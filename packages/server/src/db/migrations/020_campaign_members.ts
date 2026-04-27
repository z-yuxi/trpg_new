import type { Knex } from 'knex';

/**
 * Phase 4.2: 引入 campaign_members 表
 * 统一记录用户与战役的成员关系及角色（gm / player / observer），
 * 为后续统一权限模型（RBAC）奠定基础。
 *
 * 本次迁移仅建表并回填历史数据，不改变现有权限校验逻辑。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('campaign_members', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('user_id', 64).notNullable();
    t.enum('role', ['gm', 'player', 'observer']).notNullable().defaultTo('player');
    t.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['campaign_id', 'user_id'], 'uk_campaign_members_unique');
    t.index(['campaign_id'], 'idx_campaign_members_campaign');
    t.index(['user_id'], 'idx_campaign_members_user');
  });

  // 回填历史数据：将现有 gm_user_id 作为 gm 角色写入
  const campaigns = await knex('campaigns').select('id', 'gm_user_id');
  const { generateId } = await import('@trpg/shared');
  const gmRows = campaigns.map((c: { id: string; gm_user_id: string }) => ({
    id: generateId(),
    campaign_id: c.id,
    user_id: c.gm_user_id,
    role: 'gm',
  }));
  if (gmRows.length > 0) {
    await knex('campaign_members').insert(gmRows);
  }

  // 回填历史数据：将有角色实例的玩家作为 player 角色写入
  const playerRows = await knex('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .join('campaigns as c', 'c.id', 'css.campaign_id')
    .whereNot('cs.user_id', knex.ref('c.gm_user_id'))
    .groupBy('css.campaign_id', 'cs.user_id')
    .select('css.campaign_id', 'cs.user_id');

  for (const row of playerRows as Array<{ campaign_id: string; user_id: string }>) {
    const exists = await knex('campaign_members')
      .where({ campaign_id: row.campaign_id, user_id: row.user_id })
      .first();
    if (!exists) {
      await knex('campaign_members').insert({
        id: generateId(),
        campaign_id: row.campaign_id,
        user_id: row.user_id,
        role: 'player',
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('campaign_members');
}
