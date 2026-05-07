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
  // ── 1. modules 表扩展（可重入，支持失败后重跑）────────────────────────────
  const addModuleColumnIfMissing = async (
    columnName: string,
    addColumn: (table: Knex.CreateTableBuilder) => void
  ): Promise<void> => {
    if (await knex.schema.hasColumn('modules', columnName)) {
      return;
    }

    await knex.schema.alterTable('modules', (table) => {
      addColumn(table);
    });
  };

  await addModuleColumnIfMissing('source_label', (table) => {
    table
      .enu('source_label', [
        'original',
        'author_version',
        'community_pending',
        'community_authorized',
        'derivative',
        'certified_independent',
      ])
      .notNullable()
      .defaultTo('original');
  });

  await addModuleColumnIfMissing('community_status', (table) => {
    table
      .enu('community_status', [
        'private_use',
        'public_share',
        'pending_review',
        'archived_by_author',
      ])
      .nullable();
  });

  await addModuleColumnIfMissing('upstream_module_id', (table) => {
    table.string('upstream_module_id', 64).nullable();
  });

  await addModuleColumnIfMissing('contributor_user_id', (table) => {
    table.string('contributor_user_id', 64).nullable();
  });

  await addModuleColumnIfMissing('original_source_url', (table) => {
    table.string('original_source_url', 1024).nullable();
  });

  await addModuleColumnIfMissing('original_source_note', (table) => {
    table.text('original_source_note').nullable();
  });

  await addModuleColumnIfMissing('claim_deadline_at', (table) => {
    table.dateTime('claim_deadline_at').nullable();
  });

  await addModuleColumnIfMissing('derivative_policy', (table) => {
    table.enu('derivative_policy', ['open', 'closed', 'review']).nullable();
  });

  // ── 2. module_claim_letters 表（致作者的信） ─────────────────────────────
  if (!(await knex.schema.hasTable('module_claim_letters'))) {
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
    table.specificType('content', 'LONGTEXT').notNullable();

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
  }

  // ── 3. module_contributors 表（贡献者 / 荣誉协作者） ─────────────────────
  if (!(await knex.schema.hasTable('module_contributors'))) {
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
