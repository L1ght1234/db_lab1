// =====================================================================
// Unit of Work: одна транзакція на кілька логічно-пов'язаних репозиторіїв.
// На початку транзакції передає ID поточного користувача в сесію PostgreSQL
// (app.user_id), звідки його зчитують тригери та збережені процедури.
// =====================================================================

import type { PoolClient } from 'pg';
import { pool } from './db.js';
import {
  MatchRepository,
  TeamRepository,
  TicketRepository,
  TournamentRepository,
} from './repositories/index.js';

export class UnitOfWork {
  private client: PoolClient | null = null;
  private inTransaction = false;

  public teams!: TeamRepository;
  public tournaments!: TournamentRepository;
  public matches!: MatchRepository;
  public tickets!: TicketRepository;

  constructor(private readonly userId: number) {}

  async begin(): Promise<void> {
    if (!this.client) {
      this.client = await pool.connect();
      this.teams = new TeamRepository(this.client);
      this.tournaments = new TournamentRepository(this.client);
      this.matches = new MatchRepository(this.client);
      this.tickets = new TicketRepository(this.client);
    }
    await this.client.query('BEGIN');
    this.inTransaction = true;
    await this.bindUser();
  }

  private async bindUser(): Promise<void> {
    await this.client!.query("SELECT set_config('app.user_id', $1, true)", [String(this.userId)]);
  }

  async commit(): Promise<void> {
    if (!this.client || !this.inTransaction) return;
    await this.client.query('COMMIT');
    await this.client.query('BEGIN');
    await this.bindUser();
  }

  async rollback(): Promise<void> {
    if (!this.client || !this.inTransaction) return;
    await this.client.query('ROLLBACK');
    await this.client.query('BEGIN');
    await this.bindUser();
  }

  async close(): Promise<void> {
    if (!this.client) return;
    try {
      if (this.inTransaction) {
        await this.client.query('ROLLBACK');
        this.inTransaction = false;
      }
    } finally {
      this.client.release();
      this.client = null;
    }
  }

  static async run<T>(userId: number, work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    const uow = new UnitOfWork(userId);
    await uow.begin();
    try {
      return await work(uow);
    } finally {
      await uow.close();
    }
  }
}
