import type { Knex } from 'knex';

/**
 * 迁移 025：scene_participations 时间段查询优化
 *
 * 目的：支持消息查询 API 按角色参与时间段（joined_at ~ left_at）过滤历史消息。
 * 当 history_visibility = 'none' 时，仅返回角色在场期间产生的消息。
 *
 * 索引策略：
 *   - (character_id, scene_id, joined_at) 复合索引：
 *     加速 "给定角色 + 场景，按时间范围查找参与记录" 的 EXISTS 子查询
 *   - (scene_id, left_at) 索引：
 *     加速 "当前在场角色列表" 查询（left_at IS NULL）
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scene_participations', (t) => {
    // 时间范围过滤主索引（任务 1.2 核心）
    t.index(['character_id', 'scene_id', 'joined_at'], 'idx_sp_char_scene_joined');
    // 在场状态查询索引（visibility.ts computeVisibleTo 复用）
    t.index(['scene_id', 'left_at'], 'idx_sp_scene_left');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scene_participations', (t) => {
    t.dropIndex([], 'idx_sp_scene_left');
    t.dropIndex([], 'idx_sp_char_scene_joined');
  });
}
