import '../utils/load-env';
import path from 'path';
import { db } from './knex-config';

async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(process.cwd(), 'src/db/migrations');

  try {
    const [batchNo, log] = await db.migrate.latest({
      directory: migrationsDir,
      extension: 'ts',
    });

    if (log.length === 0) {
      console.log('Already up to date. No new migrations were run.');
    } else {
      console.log(`Batch ${batchNo} run: ${log.length} migration(s)`);
      for (const name of log) {
        console.log(`- ${name}`);
      }
    }
  } finally {
    await db.destroy();
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
