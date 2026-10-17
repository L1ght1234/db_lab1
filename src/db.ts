import pg from 'pg';

const { Pool } = pg;

export const DEFAULT_CONNECTION_STRING =
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres_password@localhost:5432/sports_management';

export const pool = new Pool({
  connectionString: DEFAULT_CONNECTION_STRING,
});
