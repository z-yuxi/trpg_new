import type { Knex } from 'knex';

/**
 * 迁移：A/B 实验平台
 *
 * ab_experiments       — 实验定义（名称、描述、变体配置、状态）
 * ab_assignments       — 用户实验分组（确定性哈希分桶）
 * ab_events            — 实验曝光与转化事件
 */
export async function up(knex: Knex): Promise<void> {
  // 实验定义表
  await knex.schema.createTable('ab_experiments', (t) => {
    t.string('id', 64).primary();
    /** 代码引用名（snake_case，唯一），如 "recruit_btn_text" */
    t.string('name', 128).unique().notNullable();
    t.string('description', 500).nullable();
    /** 状态：draft（未激活）/ running / paused / concluded */
    t.enu('status', ['draft', 'running', 'paused', 'concluded']).defaultTo('draft').notNullable();
    /**
     * 变体定义 JSON 数组，每项 { id: string, name: string, weight: number }
     * weight 为整数权重（相对比例），如 [{ id:"ctrl", name:"对照组", weight:50 }, { id:"trt", name:"实验组", weight:50 }]
     */
    t.json('variants').notNullable();
    /** 转化目标事件名（如 "apply_click"）*/
    t.string('goal_event', 128).nullable();
    /** 流量采样率（0-100 整数，100=全量） */
    t.integer('traffic_percent').defaultTo(100).notNullable();
    t.timestamp('started_at').nullable();
    t.timestamp('ended_at').nullable();
    t.string('created_by', 64).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 用户分组表（实验 × 用户 唯一）
  await knex.schema.createTable('ab_assignments', (t) => {
    t.string('id', 64).primary();
    t.string('experiment_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable();
    /** 分配到的变体 ID */
    t.string('variant_id', 64).notNullable();
    /** 是否在采样流量内（traffic_percent 剔除的用户为 false，不记录此行） */
    t.boolean('in_sample').defaultTo(true);
    t.timestamp('assigned_at').defaultTo(knex.fn.now());
    t.unique(['experiment_id', 'user_id'], { indexName: 'uq_ab_exp_user' });
  });

  // 实验事件表（曝光 / 转化）
  await knex.schema.createTable('ab_events', (t) => {
    t.string('id', 64).primary();
    t.string('experiment_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable();
    t.string('variant_id', 64).notNullable();
    /** 事件类型：expose（曝光）/ convert（转化）/ custom */
    t.enu('event_type', ['expose', 'convert', 'custom']).notNullable();
    /** 自定义事件名（event_type=custom 时填写） */
    t.string('event_name', 128).nullable();
    t.json('properties').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['experiment_id', 'variant_id', 'event_type'], 'idx_ab_events_lookup');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ab_events');
  await knex.schema.dropTableIfExists('ab_assignments');
  await knex.schema.dropTableIfExists('ab_experiments');
}
