/**
 * PaymentGateway — 三方支付预付单创建
 *
 * 支持渠道：
 *   - Alipay  H5（alipay.trade.wap.pay）
 *   - WeChat  JSAPI（v3/pay/transactions/jsapi）
 *
 * 如环境变量未配置则静默降级返回 null，不影响订单记录创建。
 * 上线时配置对应 env 即可激活，无需改代码。
 *
 * 环境变量：
 *   ALIPAY_APP_ID           — 支付宝 appId
 *   ALIPAY_PRIVATE_KEY_PEM  — 支付宝应用私钥 PEM（RSA2）
 *   ALIPAY_GATEWAY          — 支付宝网关（默认 https://openapi.alipay.com/gateway.do）
 *   ALIPAY_NOTIFY_URL       — 异步通知地址
 *   ALIPAY_RETURN_URL       — 同步跳转地址（H5 支付完成后）
 *
 *   WECHAT_APPID            — 微信 appId（公众号/小程序）
 *   WECHAT_MCHID            — 微信商户号
 *   WECHAT_SERIAL_NO        — 商户证书序列号
 *   WECHAT_PRIVATE_KEY_PEM  — 商户 API 私钥 PEM
 *   WECHAT_NOTIFY_URL       — 微信支付回调地址
 */

import crypto from 'crypto';
import https from 'https';

// ── Alipay ────────────────────────────────────────────────────────────────────

export interface AlipayPreOrderParams {
  outTradeNo: string;
  totalAmount: string;       // 元，精确到分，如 "18.00"
  subject: string;           // 商品名称
  quitUrl: string;           // 用户放弃支付后跳回的地址
}

export interface AlipayPreOrderResult {
  /** 直接重定向的完整 URL（前端通过 location.href 跳转） */
  payUrl: string;
}

/**
 * 生成支付宝 WAP 支付跳转 URL
 * 若环境变量未配置则返回 null
 */
export async function createAlipayWapOrder(
  params: AlipayPreOrderParams,
): Promise<AlipayPreOrderResult | null> {
  const appId       = process.env.ALIPAY_APP_ID;
  const privateKey  = process.env.ALIPAY_PRIVATE_KEY_PEM;
  const notifyUrl   = process.env.ALIPAY_NOTIFY_URL;
  const returnUrl   = process.env.ALIPAY_RETURN_URL;
  const gateway     = process.env.ALIPAY_GATEWAY ?? 'https://openapi.alipay.com/gateway.do';

  if (!appId || !privateKey) {
    return null; // 凭证未配置，优雅降级
  }

  const bizContent = JSON.stringify({
    out_trade_no: params.outTradeNo,
    total_amount: params.totalAmount,
    subject: params.subject,
    product_code: 'QUICK_WAP_WAY',
    quit_url: params.quitUrl,
  });

  const timestamp = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');

  const rawParams: Record<string, string> = {
    app_id: appId,
    method: 'alipay.trade.wap.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp,
    version: '1.0',
    biz_content: bizContent,
    ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    ...(returnUrl ? { return_url: returnUrl } : {}),
  };

  // 签名：ASCII 升序排列，过滤 sign 字段，拼接后 RSA2 签名
  const signStr = Object.keys(rawParams)
    .sort()
    .map((k) => `${k}=${rawParams[k]}`)
    .join('&');

  let sign: string;
  try {
    const sig = crypto.createSign('sha256');
    sig.update(signStr, 'utf8');
    sign = sig.sign(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      'base64',
    );
  } catch {
    return null;
  }

  const queryParams = new URLSearchParams({ ...rawParams, sign });
  const payUrl = `${gateway}?${queryParams.toString()}`;
  return { payUrl };
}

// ── WeChat Pay v3 JSAPI ───────────────────────────────────────────────────────

export interface WechatPreOrderParams {
  outTradeNo: string;
  totalAmountCents: number;  // 分
  description: string;
  openid: string;            // 用户 openid（公众号/小程序）
  clientIp?: string;
}

export interface WechatJsapiPayParams {
  appId: string;
  timeStamp: string;
  nonceStr: string;
  package: string;           // "prepay_id=xxx"
  signType: 'RSA';
  paySign: string;
}

/**
 * 创建微信 JSAPI 支付预付单并返回前端调起支付所需参数
 * 若环境变量未配置则返回 null
 */
export async function createWechatJsapiOrder(
  params: WechatPreOrderParams,
): Promise<WechatJsapiPayParams | null> {
  const appId      = process.env.WECHAT_APPID;
  const mchId      = process.env.WECHAT_MCHID;
  const serialNo   = process.env.WECHAT_SERIAL_NO;
  const privateKey = process.env.WECHAT_PRIVATE_KEY_PEM;
  const notifyUrl  = process.env.WECHAT_NOTIFY_URL;

  if (!appId || !mchId || !serialNo || !privateKey || !notifyUrl) {
    return null; // 凭证未配置，优雅降级
  }

  const body = {
    appid: appId,
    mchid: mchId,
    description: params.description,
    out_trade_no: params.outTradeNo,
    notify_url: notifyUrl,
    amount: { total: params.totalAmountCents, currency: 'CNY' },
    payer: { openid: params.openid },
    ...(params.clientIp ? { scene_info: { payer_client_ip: params.clientIp } } : {}),
  };

  let prepayId: string;
  try {
    const result = await wechatApiPost('/v3/pay/transactions/jsapi', body, {
      mchId,
      serialNo,
      privateKey,
    });
    prepayId = (result as { prepay_id: string }).prepay_id;
    if (!prepayId) return null;
  } catch {
    return null;
  }

  // 生成 JSAPI 调起支付签名
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr  = crypto.randomBytes(16).toString('hex');
  const pkg       = `prepay_id=${prepayId}`;
  const signMsg   = `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`;

  let paySign: string;
  try {
    const sig = crypto.createSign('sha256');
    sig.update(signMsg, 'utf8');
    paySign = sig.sign(
      { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      'base64',
    );
  } catch {
    return null;
  }

  return { appId, timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign };
}

// ── WeChat v3 API 请求辅助 ───────────────────────────────────────────────────

interface WechatApiOptions {
  mchId: string;
  serialNo: string;
  privateKey: string;
}

function wechatApiPost(
  path: string,
  body: Record<string, unknown>,
  opts: WechatApiOptions,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(16).toString('hex');

    // 构造签名串
    const signMsg = `POST\n${path}\n${timestamp}\n${nonce}\n${rawBody}\n`;
    let signature: string;
    try {
      const sig = crypto.createSign('sha256');
      sig.update(signMsg, 'utf8');
      signature = sig.sign(
        { key: opts.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
        'base64',
      );
    } catch (e) {
      reject(e);
      return;
    }

    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${opts.mchId}",` +
      `nonce_str="${nonce}",` +
      `signature="${signature}",` +
      `timestamp="${timestamp}",` +
      `serial_no="${opts.serialNo}"`;

    const options = {
      hostname: 'api.mch.weixin.qq.com',
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        'User-Agent': 'trpg-platform/1.0',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`WeChat API error ${res.statusCode}: ${data}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Invalid JSON from WeChat API: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}
