import type { PoolClient } from 'pg';
import type {
  MatchScheduleItem,
  Team,
  Ticket,
  Tournament,
  TournamentStanding,
} from '../models.js';

export abstract class BaseRepository {
  constructor(protected readonly client: PoolClient) {}

  protected async queryView<T>(
    viewName: string,
    where?: Record<string, unknown>,
    orderBy?: string
  ): Promise<T[]> {
    const values: unknown[] = [];
    let sql = `SELECT * FROM "${viewName}"`;

    if (where && Object.keys(where).length > 0) {
      const clauses = Object.entries(where).map(([col, val], idx) => {
        values.push(val);
        return `"${col}" = $${idx + 1}`;
      });
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }

    if (orderBy) {
      sql += ` ORDER BY "${orderBy}"`;
    }

    const res = await this.client.query(sql, values);
    return res.rows as T[];
  }

  protected async callProcedure<T = Record<string, unknown>>(
    procName: string,
    args: unknown[] = [],
    outParams = 0
  ): Promise<T | null> {
    const placeholders = [
      ...args.map((_, idx) => `$${idx + 1}`),
      ...Array.from({ length: outParams }, () => 'NULL'),
    ];
    const sql = `CALL "${procName}"(${placeholders.join(', ')})`;
    const res = await this.client.query(sql, args);
    return outParams > 0 && res.rows.length > 0 ? (res.rows[0] as T) : null;
  }
}

export class TeamRepository extends BaseRepository {
  async getAll(): Promise<Team[]> {
    return this.queryView<Team>('v_teams', undefined, 'name');
  }

  async getById(teamId: number): Promise<Team | null> {
    const rows = await this.queryView<Team>('v_teams', { id: teamId });
    return rows[0] ?? null;
  }

  async create(sportId: number, name: string, city: string, foundedYear: number): Promise<number> {
    const out = await this.callProcedure<{ p_team_id: number }>(
      'sp_team_create',
      [sportId, name, city, foundedYear],
      1
    );
    return out!.p_team_id;
  }

  async update(teamId: number, name?: string, city?: string): Promise<void> {
    await this.callProcedure('sp_team_update', [teamId, name ?? null, city ?? null]);
  }

  async softDelete(teamId: number): Promise<void> {
    await this.callProcedure('sp_team_soft_delete', [teamId]);
  }

  async restore(teamId: number): Promise<void> {
    await this.callProcedure('sp_team_restore', [teamId]);
  }
}

export class TournamentRepository extends BaseRepository {
  async getById(tournamentId: number): Promise<Tournament | null> {
    const rows = await this.queryView<Tournament>('v_tournaments', { id: tournamentId });
    return rows[0] ?? null;
  }

  async getStandings(tournamentId: number): Promise<TournamentStanding[]> {
    return this.queryView<TournamentStanding>(
      'v_tournament_standings',
      { tournament_id: tournamentId },
      'position'
    );
  }

  async create(
    sportId: number,
    name: string,
    season: string,
    startDate: string,
    endDate: string,
    firstStageName: string
  ): Promise<{ tournamentId: number; stageId: number }> {
    const out = await this.callProcedure<{ p_tournament_id: number; p_stage_id: number }>(
      'sp_tournament_create',
      [sportId, name, season, startDate, endDate, firstStageName],
      2
    );
    return { tournamentId: out!.p_tournament_id, stageId: out!.p_stage_id };
  }

  async registerTeam(tournamentId: number, teamId: number, seedNumber?: number): Promise<void> {
    await this.callProcedure('sp_tournament_register_team', [
      tournamentId,
      teamId,
      seedNumber ?? null,
    ]);
  }
}

export class MatchRepository extends BaseRepository {
  async getById(matchId: number): Promise<MatchScheduleItem | null> {
    const rows = await this.queryView<MatchScheduleItem>('v_match_schedule', { id: matchId });
    return rows[0] ?? null;
  }

  async schedule(
    stageId: number,
    venueId: number,
    homeTeamId: number,
    awayTeamId: number,
    scheduledAt: string
  ): Promise<number> {
    const out = await this.callProcedure<{ p_match_id: number }>(
      'sp_match_schedule',
      [stageId, venueId, homeTeamId, awayTeamId, scheduledAt],
      1
    );
    return out!.p_match_id;
  }

  async recordResult(
    matchId: number,
    homeScore: number,
    awayScore: number,
    notes?: string
  ): Promise<void> {
    await this.callProcedure('sp_match_record_result', [
      matchId,
      homeScore,
      awayScore,
      notes ?? null,
    ]);
  }
}

export class TicketRepository extends BaseRepository {
  async getByMatch(matchId: number): Promise<Ticket[]> {
    return this.queryView<Ticket>('v_tickets', { match_id: matchId }, 'id');
  }

  async sell(
    matchId: number,
    categoryId: number,
    buyerUserId: number,
    seatNumber: string
  ): Promise<number> {
    const out = await this.callProcedure<{ p_ticket_id: number }>(
      'sp_ticket_sell',
      [matchId, categoryId, buyerUserId, seatNumber],
      1
    );
    return out!.p_ticket_id;
  }
}
