/**
 * Migration 048: 手机号字段加密迁移
 *
 * 变更：
 *   - 删除明文 phone 字段（含唯一索引）
 *   - 新增 phone_encrypted JSONB（存储 AES-256-GCM 密文载荷）
 *   - 新增 phone_hmac VARCHAR(64)（存储 HMAC-SHA256 盲索引，唯一约束）
 *
 * 说明：
 *   - phone_hmac 用于 findByPhone/唯一性检查，deterministic，不可逆
 *   - phone_encrypted 用于展示/业务，需 decryptFromJson() 解密
 *
 * 回滚：
 *   - 删除 phone_encrypted / phone_hmac，重新加回 phone（需手工补数据）
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    // 1. 删除旧明文字段（唯一索引由 Knex 自动删除）
    t.dropColumn('phone');
    // 2. 加密密文字段
    t.jsonb('phone_encrypted').nullable();
    // 3. HMAC 盲索引（唯一）
    t.string('phone_hmac', 64).nullable().unique();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('phone_encrypted');
    t.dropColumn('phone_hmac');
    // 回滚只恢复结构，数据需手工处理
    t.string('phone', 20).nullable().unique();
  });
}
