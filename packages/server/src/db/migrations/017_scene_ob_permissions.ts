import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scenes', (t) => {
    t.string('created_by', 64).nullable();
  });

  // 历史数据回填：旧场景默认归属团 GM（避免依赖方言特有 update join）
  const sceneRows = await knex('scenes as s')
    .leftJoin('campaigns as c', 'c.id', 's.campaign_id')
    .whereNull('s.created_by')
    .select('s.id as scene_id', 'c.gm_user_id as gm_user_id');

  for (const row of sceneRows as Array<{ scene_id: string; gm_user_id: string | null }>) {
    if (!row.gm_user_id) continue;
    await knex('scenes').where({ id: row.scene_id }).update({ created_by: row.gm_user_id });
  }

  await knex.schema.alterTable('scenes', (t) => {
    t.index(['campaign_id', 'type'], 'idx_scenes_campaign_type');
  });

  await knex.schema.createTable('scene_ob_permissions', (t) => {
    t.string('id', 64).primary();
    t.string('scene_id', 64).notNullable();
    t.string('user_id', 64).notNullable();
    t.string('granted_by', 64).notNullable();
    t.timestamp('granted_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('revoked_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.unique(['scene_id', 'user_id', 'revoked_at'], 'uk_scene_user_active');
    t.index(['scene_id'], 'idx_scene_ob_permissions_scene');
    t.index(['user_id'], 'idx_scene_ob_permissions_user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('scene_ob_permissions');

  await knex.schema.alterTable('scenes', (t) => {
    t.dropIndex(['campaign_id', 'type'], 'idx_scenes_campaign_type');
    t.dropColumn('created_by');
  });
}
