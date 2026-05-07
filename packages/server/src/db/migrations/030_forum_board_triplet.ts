import type { Knex } from 'knex';

const BACKUP_TABLE = 'forum_board_migration_030_backup';

/**
 * 迁移 030：论坛分区统一为 tips/share/lounge
 *
 * 旧值映射：
 * - experience -> tips
 * - rpg-log    -> share
 * - lounge     -> lounge
 * - rules      -> tips
 * - newbie     -> tips
 * - creation   -> share
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(BACKUP_TABLE, (t) => {
    t.string('thread_id', 64).primary();
    t.string('old_board', 32).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 备份迁移前分区值，确保 down 可精确回滚。
  await knex.raw(`
    INSERT INTO ${BACKUP_TABLE} (thread_id, old_board)
    SELECT id, board FROM forum_threads
  `);

  // 先把 board 列扩展为包含新旧值的 ENUM，允许数据改写期间两种值并存。
  await knex.raw(`
    ALTER TABLE forum_threads
    MODIFY COLUMN board ENUM('rules','creation','experience','newbie','lounge','tips','share')
    NOT NULL
  `);

  await knex.raw(`
    UPDATE forum_threads
    SET board = CASE board
      WHEN 'experience' THEN 'tips'
      WHEN 'rpg-log' THEN 'share'
      WHEN 'lounge' THEN 'lounge'
      WHEN 'rules' THEN 'tips'
      WHEN 'newbie' THEN 'tips'
      WHEN 'creation' THEN 'share'
      ELSE board
    END
  `);

  // 收缩为最终 ENUM（仅三值）。
  await knex.raw(`
    ALTER TABLE forum_threads
    MODIFY COLUMN board ENUM('tips','share','lounge')
    NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable(BACKUP_TABLE);
  if (!exists) return;

  // 先扩枚举，允许写回旧值。
  await knex.raw(`
    ALTER TABLE forum_threads
    MODIFY COLUMN board ENUM('rules','creation','experience','newbie','lounge','tips','share')
    NOT NULL
  `);

  // 依据备份逐条恢复旧分区值，保证跨数据库兼容。
  const backups = await knex(BACKUP_TABLE).select<{ thread_id: string; old_board: string }[]>('thread_id', 'old_board');
  await knex.transaction(async (trx) => {
    for (const row of backups) {
      await trx('forum_threads').where({ id: row.thread_id }).update({ board: row.old_board });
    }
  });

  // 收缩回旧版 ENUM。
  await knex.raw(`
    ALTER TABLE forum_threads
    MODIFY COLUMN board ENUM('rules','creation','experience','newbie','lounge')
    NOT NULL
  `);

  await knex.schema.dropTableIfExists(BACKUP_TABLE);
}
