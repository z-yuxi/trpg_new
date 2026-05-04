/**
 * 对称加密工具（AES-256-GCM）
 *
 * 用于加密存储敏感字段：手机号、身份证号等 PII 数据。
 *
 * 环境变量：
 *   ENCRYPTION_KEY  - 64 位十六进制字符串（32 字节），通过 KMS/Docker Secret 注入
 *                     生成示例：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * 存储格式（JSON 字符串存入 DB）：
 *   { "ct": "<hex>", "iv": "<hex>", "tag": "<hex>" }
 *
 * 用法：
 *   const enc = encrypt(phone);          // 加密
 *   const raw = decrypt(enc.ct, enc.iv, enc.tag); // 解密
 *   const stored = encryptToJson(phone);  // 加密并序列化为 JSON 字符串
 *   const plain  = decryptFromJson(stored); // 反序列化并解密
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const TAG_BYTES = 16;

/** 延迟加载并校验密钥，避免模块加载时崩溃 */
function getKey(): Buffer {
  const hex = process.env['ENCRYPTION_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('[encryption] ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedPayload {
  /** ciphertext（hex） */
  ct: string;
  /** initialization vector（hex） */
  iv: string;
  /** GCM authentication tag（hex） */
  tag: string;
}

/**
 * 加密明文字符串
 */
export function encrypt(plain: string): EncryptedPayload {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  let ct = cipher.update(plain, 'utf8', 'hex');
  ct += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return {
    ct,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * 解密
 */
export function decrypt(ct: string, iv: string, tag: string): string {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'), { authTagLength: TAG_BYTES });
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let plain = decipher.update(ct, 'hex', 'utf8');
  plain += decipher.final('utf8');
  return plain;
}

/**
 * 加密并序列化为 JSON 字符串，方便存入 VARCHAR 列
 */
export function encryptToJson(plain: string): string {
  return JSON.stringify(encrypt(plain));
}

/**
 * 从 JSON 字符串反序列化并解密
 * @throws 若 JSON 格式非法或解密失败（认证标签不匹配）
 */
export function decryptFromJson(stored: string): string {
  const parsed: unknown = JSON.parse(stored);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)['ct'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['iv'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['tag'] !== 'string'
  ) {
    throw new Error('[encryption] Invalid encrypted payload format');
  }
  const { ct, iv, tag } = parsed as EncryptedPayload;
  return decrypt(ct, iv, tag);
}
