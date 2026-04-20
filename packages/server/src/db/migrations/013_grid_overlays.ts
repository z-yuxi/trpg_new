import type { Knex } from 'knex';

/**
 * 013 - 为 campaign_grid_maps 表添加 overlays JSON 列
 * 存储 GM 绘制的区域高亮叠加层列表
 */

export async function up(knex: Knex): Promise<void> {
  const hasOverlays = await knex.schema.hasColumn('campaign_grid_maps', 'overlays');
  if (!hasOverlays) {
    await knex.schema.alterTable('campaign_grid_maps', (t) => {
      t.json('overlays').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasOverlays = await knex.schema.hasColumn('campaign_grid_maps', 'overlays');
  if (hasOverlays) {
    await knex.schema.alterTable('campaign_grid_maps', (t) => {
      t.dropColumn('overlays');
    });
  }
}
