import type { Knex } from 'knex';

/**
 * Migration 045: 社区版模组与衍生管理
 *
 * 1. modules 表新增社区版字段：来源标签、社区状态、溯源链、贡献者、认领截止
 * 2. 新建 module_claim_letters 表（致作者的信 + AI审核报告）
 * 3. 新建 module_contributors 表（贡献者 / 荣誉协作者）
 *
 * 设计依据：附录 C §4.8 模组来源与衍生管理
 */
export async function up(knex: Knex): Promise<void> {
  // ── 1. modules 表扩展 ────────────────────────────────────────────────────
  await knex.schema.alterTable('modules', (table) => {
    // 来源标签（创建时永久确定）
    table
      .enu('source_label', [
        'original',              // 原创
        'author_version',        // 作者版
        'community_pending',     // 社区贡献·待认领
        'community_authorized',  // 社区贡献·已授权
        'derivative',            // 衍生创作
        'certified_independent', // 已认证的独立创作
      ])
      .notNullable()
      .defaultTo('original');

    // 社区状态（仅社区版使用，作者版为 null）
    table
      .enu('community_status', [
        'private_use',    // 私有导入，仅上传者可见
        'public_share',   // 公开分享，待认领
        'pending_review', // 等待原作者审核（作者已入驻）
        'archived_by_author', // 应作者要求已封存
      ])
      .nullable()
      .defaultTo(null);

    // 溯源：上游模组 ID（衍生/社区版填写，组成家族树）
    table
      .string('upstream_module_id', 64)
      .nullable()
      .defaultTo(null);

    // 贡献者用户 ID（社区版上传者）
    table
      .string('contributor_user_id', 64)
      .nullable()
      .defaultTo(null);

    // 原发布链接（搬运版必填）
    table
      .string('original_source_url', 1024)
      .nullable()
      .defaultTo(null);

    // 来源说明（搬运版选填）
    table
      .text('original_source_note')
      .nullable()
      .defaultTo(null);

    // 认领截止时间（认领发生后 +168h）
    table
      .dateTime('claim_deadline_at')
      .nullable()
      .defaultTo(null);

    // 作者对该模组设置的衍生管理策略
    table
      .enu('derivative_policy', ['open', 'closed', 'review'])
      .nullable()
      .defaultTo(null);
  });

  // ── 2. module_claim_letters 表（致作者的信） ─────────────────────────────
  await knex.schema.createTable('module_claim_letters', (table) => {
    table.string('id', 64).primary();

    // 关联模组
    table
      .string('module_id', 64)
      .notNullable()
      .references('id')
      .inTable('modules')
      .onDelete('CASCADE');

    // 申请人（贡献者）
    table.string('applicant_user_id', 64).notNullable();

    // 申请类型：公开分享 or 衍生申请
    table
      .enu('letter_type', ['public_share', 'derivative'])
      .notNullable()
      .defaultTo('public_share');

    // 信件正文（富文本 JSON）
    table.specificType('content', 'LONGTEXT').notNullable().defaultTo('');

    // 图片附件（JSON array of URLs）
    table.json('attachments').nullable();

    // AI 审核报告（相似度、改动摘要、合规预检）
    table.json('ai_report').nullable();

    // 审核状态
    table
      .enu('status', ['pending', 'approved', 'rejected'])
      .notNullable()
      .defaultTo('pending');

    // 原作者的回复（可选）
    table.text('author_reply').nullable();

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.dateTime('reviewed_at').nullable();
    table.string('reviewed_by', 64).nullable(); // null = 系统超时自动处理

    table.index(['module_id']);
    table.index(['applicant_user_id']);
  });

  // ── 3. module_contributors 表（贡献者 / 荣誉协作者） ─────────────────────
  await knex.schema.createTable('module_contributors', (table) => {
    table.string('id', 64).primary();

    table
      .string('module_id', 64)
      .notNullable()
      .references('id')
      .inTable('modules')
      .onDelete('CASCADE');

    table.string('user_id', 64).notNullable();

    // contributor = 上传者；honorary_collaborator = 被认领后的永久荣誉
    table
      .enu('role', ['contributor', 'honorary_collaborator'])
      .notNullable()
      .defaultTo('contributor');

    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['module_id', 'user_id']);
    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('module_contributors');
  await knex.schema.dropTableIfExists('module_claim_letters');

  await knex.schema.alterTable('modules', (table) => {
    table.dropColumn('derivative_policy');
    table.dropColumn('claim_deadline_at');
    table.dropColumn('original_source_note');
    table.dropColumn('original_source_url');
    table.dropColumn('contributor_user_id');
    table.dropColumn('upstream_module_id');
    table.dropColumn('community_status');
    table.dropColumn('source_label');
  });
}
