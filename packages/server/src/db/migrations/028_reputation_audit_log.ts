import type { Knex } from 'knex';

/**
 * 迁移 028：信誉分审计日志 + 互评申诉系统
 *
 * reputation_audit_log  — 每次信誉分变动的完整快照 + 反作弊标记
 * review_appeals        — 用户对评价提出申诉，运营人员可处理
 */
export async function up(knex: Knex): Promise<void> {
  // ── 信誉分变动审计日志 ─────────────────────────────────────────────────────
  await knex.schema.createTable('reputation_audit_log', (t) => {
    t.string('id', 64).primary();

    /** 被变动信誉分的用户（被评价人） */
    t.string('user_id', 64).notNullable();

    /** 触发本次变动的评价 ID */
    t.string('review_id', 64).notNullable();

    /** 评价人 */
    t.string('reviewer_id', 64).notNullable();

    /** 所属房间 */
    t.string('campaign_id', 64).notNullable();

    /** 评价人在本次跑团中的角色 */
    t.enu('reviewer_role', ['gm', 'player']).notNullable();

    /** 本次评价星级 */
    t.tinyint('rating').unsigned().notNullable();

    /** 变动前均值（保留两位小数，新用户首次评价前为 0.00） */
    t.decimal('old_avg_rating', 5, 2).defaultTo(0).notNullable();

    /** 变动后均值 */
    t.decimal('new_avg_rating', 5, 2).notNullable();

    /** 变动前总评价数 */
    t.integer('old_total_reviews').unsigned().defaultTo(0).notNullable();

    /** 变动后总评价数 */
    t.integer('new_total_reviews').unsigned().notNullable();

    /**
     * 反作弊标记（可为 null 表示无异常）：
     *  - mutual_review  : 双方在同一房间互评（A 评了 B，B 也评了 A）
     *  - rapid_reviews  : 评价人在 24h 内提交了 5+ 条评价（异常密集）
     *  - low_credibility: 评价人本身历史评价数 < 3（不足以判断可信度）
     */
    t.enu('anti_cheat_flag', [
      'mutual_review',
      'rapid_reviews',
      'low_credibility',
    ]).nullable().defaultTo(null);

    t.timestamp('created_at').defaultTo(knex.fn.now());

    t.index(['user_id', 'created_at']);
    t.index('reviewer_id');
    t.index('campaign_id');
    t.index('anti_cheat_flag');
  });

  // ── 互评申诉 ───────────────────────────────────────────────────────────────
  await knex.schema.createTable('review_appeals', (t) => {
    t.string('id', 64).primary();

    /** 被申诉的评价 */
    t.string('review_id', 64).notNullable();

    /** 发起申诉的用户（被评价人自己，或 GM 帮助申诉） */
    t.string('appellant_id', 64).notNullable();

    /** 申诉理由（最长 1000 字） */
    t.string('reason', 1000).notNullable();

    /**
     * 申诉处理状态：
     *  - pending         : 待处理
     *  - resolved_remove : 已处理：评价已删除 / 屏蔽
     *  - resolved_keep   : 已处理：评价维持不变
     */
    t.enu('status', ['pending', 'resolved_remove', 'resolved_keep'])
      .notNullable()
      .defaultTo('pending');

    /** 处理人（运营/管理员 user_id）*/
    t.string('resolved_by', 64).nullable();

    /** 处理结论（运营备注，最长 500 字） */
    t.string('resolution_note', 500).nullable();

    t.timestamp('resolved_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    // 同一条评价只能发起一个有效申诉
    t.unique(['review_id', 'appellant_id']);
    t.index(['status', 'created_at']);
    t.index('appellant_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('review_appeals');
  await knex.schema.dropTableIfExists('reputation_audit_log');
}
