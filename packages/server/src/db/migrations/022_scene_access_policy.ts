import type { Knex } from 'knex';

/**
 * 迁移：场景访问策略（附录 C 补全）
 *
 * scenes.access_policy:
 *   'open'       — 所有团成员可自由进入（默认）
 *   'gm_approve' — 需要 GM 审批移动申请后才可进入
 *   'locked'     — 已锁定，任何人不可进入（仅 GM 可强制移动）
 *
 * position_history.story_time_left:
 *   确保列存在（已有但可能为 NULL），此迁移加索引加速历史查询。
 *
 * scene_participations.join_reason:
 *   记录进入原因：'join' | 'scheduled' | 'force_move' | 'ob'
 */
export async function up(knex: Knex): Promise<void> {
  // 1. scenes 表：新增访问策略列
  await knex.schema.alterTable('scenes', (t) => {
    t.enu('access_policy', ['open', 'gm_approve', 'locked']).defaultTo('open').notNullable();
  });

  // 2. position_history 表：补 character_id + scene_id 复合索引（加速轨迹矩阵查询）
  await knex.schema.alterTable('position_history', (t) => {
    t.index(['character_id', 'campaign_id'], 'idx_poshistory_char_campaign');
  });

  // 3. scene_participations 表：新增进入原因列（向后兼容 nullable）
  await knex.schema.alterTable('scene_participations', (t) => {
    t.enu('join_reason', ['join', 'scheduled', 'force_move', 'ob']).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scene_participations', (t) => {
    t.dropColumn('join_reason');
  });
  await knex.schema.alterTable('position_history', (t) => {
    t.dropIndex([], 'idx_poshistory_char_campaign');
  });
  await knex.schema.alterTable('scenes', (t) => {
    t.dropColumn('access_policy');
  });
}
