import type { Knex } from 'knex';

/**
 * 为 campaign_grid_maps 添加 allow_player_token_drag 字段。
 * 默认 false（GM 专属），GM 开启后玩家仅可拖拽自己的角色 Token。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('campaign_grid_maps', (t) => {
    t.boolean('allow_player_token_drag').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('campaign_grid_maps', (t) => {
    t.dropColumn('allow_player_token_drag');
  });
}
