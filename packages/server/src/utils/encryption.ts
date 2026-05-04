/**
 * 对称加密工具（AES-256-GCM）+ HMAC 盲索引
 *
 * 用于加密存储敏感字段：手机号、身份证号等 PII 数据。
 *
 * 环境变量：
 *   ENCRYPTION_KEY   - 64 位十六进制字符串（32 字节），用于 AES-256-GCM 加密
 *                      生成：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   PHONE_HMAC_KEY   - 64 位十六进制字符串（32 字节），用于手机号 HMAC 盲索引
 *                      必须与 ENCRYPTION_KEY 独立，不可复用
 *
 * 存储格式（JSON 字符串存入 DB）：
 *   phone_encrypted: { "ct": "<hex>", "iv": "<hex>", "tag": "<hex>" }
 *   phone_hmac:      HMAC-SHA256 hex（唯一索引用，不可逆）
 *
 * 用法：
 *   const enc = encrypt(phone);               // 加密
 *   const raw = decrypt(enc.ct, enc.iv, enc.tag); // 解密
 *   const stored = encryptToJson(phone);       // 加密并序列化
 *   const plain  = decryptFromJson(stored);    // 反序列化并解密
 *   const hmac   = phoneHmac(phone);           // 生成手机号盲索引（用于 WHERE 查询）
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

/**
 * 手机号 HMAC 盲索引
 *
 * 使用 HMAC-SHA256 生成手机号的确定性哈希，用于数据库唯一索引和查询。
 * 不可逆，不等价于明文，仅用于 "WHERE phone_hmac = ?" 类查询。
 *
 * 必须使用独立的 PHONE_HMAC_KEY（与 ENCRYPTION_KEY 分离，防止交叉攻击）。
 *
 * @throws 若 PHONE_HMAC_KEY 未配置或格式非法
 */
export function phoneHmac(plainPhone: string): string {
  const hex = process.env['PHONE_HMAC_KEY'];
  if (!hex || hex.length !== 64) {
    throw new Error('[encryption] PHONE_HMAC_KEY must be a 64-char hex string (32 bytes)');
  }
  return crypto
    .createHmac('sha256', Buffer.from(hex, 'hex'))
    .update(plainPhone, 'utf8')
    .digest('hex');
}
