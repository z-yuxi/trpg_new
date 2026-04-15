import knex, { type Knex } from 'knex';
import path from 'path';

const config: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '3306'),
    user: process.env.DB_USER ?? 'trpg',
    password: process.env.DB_PASSWORD ?? 'trpg_password',
    database: process.env.DB_NAME ?? 'trpg_platform',
    charset: 'utf8mb4',
  },
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    extension: 'ts',
  },
  acquireConnectionTimeout: 10000,
};

export const db = knex(config);
export default config;
