import { v4 as uuidv4 } from 'uuid';

/** 生成 UUID v4 */
export function generateId(): string {
  return uuidv4();
}

/** 房间代码字符集（排除易混淆字符 0OI1） */
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXY23456789';

/** 生成 6 位房间代码 */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

/** 生成 8 位十六进制角色代码 */
export function generateCharacterCode(): string {
  return Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
}

/** UID 起始值 */
export const UID_START = 1000000;
