/**
 * PaymentVerifier — 支付渠道回调签名验证 & WeChat 资源解密
 *
 * ── Alipay RSA2 ────────────────────────────────────────────────────────────
 * 算法：SHA256withRSA（PKCS#1 v1.5）
 * 环境变量：ALIPAY_PUBLIC_KEY_PEM（支付宝公钥，PEM 格式，包含 -----BEGIN PUBLIC KEY----- 头尾）
 * 参考：https://opendocs.alipay.com/open/204/105301
 *
 * 签名消息构造步骤：
 *   1. 取回调参数中除 sign / sign_type 之外的所有非空字段
 *   2. 按键名 ASCII 升序排列
 *   3. 拼接为 key=value&key2=value2 字符串（值不做 URL decode，原样使用）
 *   4. 使用支付宝公钥对签名串做 RSA2 验签（sign 字段 base64 decode 为签名字节）
 *
 * ── WeChat Pay v3 ──────────────────────────────────────────────────────────
 * 算法：SHA256WithRSA（PKCS#1 v1.5）
 * 环境变量：
 *   WECHAT_PAY_PUBLIC_KEY_PEM  —— 微信支付平台证书公钥（PEM）
 *   WECHAT_PAY_API_V3_KEY      —— 32 字节 UTF-8 API v3 密钥（AES-256-GCM 解密用）
 * 参考：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml
 *
 * 验签步骤：
 *   签名消息 = {Wechatpay-Timestamp}\n{Wechatpay-Nonce}\n{rawBody}\n
 *   用平台证书公钥对 Wechatpay-Signature（base64 decode）做 RSA-SHA256 验签
 *
 * 解密步骤（resource 字段 AES-256-GCM）：
 *   密文 = base64_decode(ciphertext) = encrypted_data + 16-byte authTag
 *   key  = UTF-8 bytes of WECHAT_PAY_API_V3_KEY
 *   nonce、associated_data 来自 resource 对象
 *
 * ── Internal / Test HMAC-SHA256 ────────────────────────────────────────────
 * 仅用于测试环境或内部渠道，使用 PAYMENT_WEBHOOK_SECRET_{CHANNEL} 环境变量。
 * 使用 timingSafeEqual 防时序攻击。
 */

import crypto from 'crypto';

// ── Alipay RSA2 ───────────────────────────────────────────────────────────────

/**
 * 验证支付宝异步通知签名
 * @param params  - 回调中所有表单参数（含 sign / sign_type）
 * @param publicKeyPem - 支付宝公钥 PEM（来自 ALIPAY_PUBLIC_KEY_PEM）
 */
export function verifyAlipaySignature(
  params: Record<string, string>,
  publicKeyPem: string,
): boolean {
  const { sign, sign_type, ...rest } = params;
  if (!sign) return false;

  // 只接受 RSA2；如果 sign_type 缺省也按 RSA2 处理（部分老版本不传该字段）
  if (sign_type && sign_type !== 'RSA2') return false;

  // 按键名 ASCII 升序，过滤空值，拼接签名串
  const signString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== '')
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&');

  try {
    return crypto.verify(
      'sha256',
      Buffer.from(signString, 'utf8'),
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(sign, 'base64'),
    );
  } catch {
    return false;
  }
}

// ── WeChat Pay v3 ─────────────────────────────────────────────────────────────

export interface WechatPayCallbackHeaders {
  /** Wechatpay-Timestamp */
  timestamp: string;
  /** Wechatpay-Nonce */
  nonce: string;
  /** Wechatpay-Signature（base64 编码） */
  signature: string;
  /** Wechatpay-Serial — 平台证书序列号（用于证书轮转时选取对应公钥） */
  serial: string;
}

/**
 * 验证微信支付 v3 回调签名
 * @param headers  - 从 HTTP 请求头中提取的验签字段
 * @param rawBody  - 原始请求体字符串（UTF-8）
 * @param publicKeyPem - 微信支付平台证书公钥 PEM
 */
export function verifyWechatPayV3Signature(
  headers: WechatPayCallbackHeaders,
  rawBody: string,
  publicKeyPem: string,
): boolean {
  // 签名消息 = timestamp\nnonce\nbody\n（注意末尾也有 \n）
  const message = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`;

  try {
    return crypto.verify(
      'sha256',
      Buffer.from(message, 'utf8'),
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(headers.signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export interface WechatResourceParams {
  /** base64 编码密文（含尾部 16-byte GCM auth tag） */
  ciphertext: string;
  /** AES-GCM nonce（12 字节，来自 resource.nonce） */
  nonce: string;
  /** 关联数据（来自 resource.associated_data，可为空字符串） */
  associatedData: string;
  /** 32 字节 UTF-8 密钥（WECHAT_PAY_API_V3_KEY） */
  apiV3Key: string;
}

/**
 * 解密微信支付 v3 回调 resource 字段（AES-256-GCM）
 * 返回解密后的 JSON 字符串
 */
export function decryptWechatResource(params: WechatResourceParams): string {
  const key = Buffer.from(params.apiV3Key, 'utf8');
  if (key.length !== 32) {
    throw new Error('WECHAT_PAY_API_V3_KEY must be exactly 32 UTF-8 bytes');
  }

  const data = Buffer.from(params.ciphertext, 'base64');
  if (data.length < 16) {
    throw new Error('WeChat ciphertext too short to contain auth tag');
  }

  const encrypted = data.subarray(0, data.length - 16);
  const authTag = data.subarray(data.length - 16);
  const iv = Buffer.from(params.nonce, 'utf8'); // nonce 直接当 IV

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  if (params.associatedData) {
    decipher.setAAD(Buffer.from(params.associatedData, 'utf8'));
  }

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ── Internal / Test HMAC-SHA256 ───────────────────────────────────────────────

/**
 * 验证内部测试渠道的 HMAC-SHA256 签名
 * 使用 timingSafeEqual 防止时序攻击
 */
export function verifyHmacSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  // 长度不同时直接拒绝（timingSafeEqual 要求等长）
  if (signature.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signature.toLowerCase(), 'utf8'),
    );
  } catch {
    return false;
  }
}
