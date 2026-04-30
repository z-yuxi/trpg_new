import { describe, expect, it } from 'vitest';
import { shouldShowBackButton } from '../composables/usePageInteractionPolicy';

function routeLike(path: string, meta: Record<string, unknown> = {}) {
  return { path, meta } as any;
}

describe('shouldShowBackButton', () => {
  it('首页不显示返回按钮', () => {
    expect(shouldShowBackButton(routeLike('/', { disableBack: true }))).toBe(false);
  });

  it('登录页不显示返回按钮', () => {
    expect(shouldShowBackButton(routeLike('/login', { disableBack: true }))).toBe(false);
  });

  it('一级标签页不显示返回按钮', () => {
    expect(shouldShowBackButton(routeLike('/explore', { isPrimaryTab: true }))).toBe(false);
    expect(shouldShowBackButton(routeLike('/recruit', { isPrimaryTab: true }))).toBe(false);
    expect(shouldShowBackButton(routeLike('/rooms', { isPrimaryTab: true }))).toBe(false);
    expect(shouldShowBackButton(routeLike('/discuss/tips', { isPrimaryTab: true }))).toBe(false);
    expect(shouldShowBackButton(routeLike('/tuantu', { isPrimaryTab: true }))).toBe(false);
  });

  it('二级及以上页面显示返回按钮', () => {
    expect(shouldShowBackButton(routeLike('/recruit/abc'))).toBe(true);
    expect(shouldShowBackButton(routeLike('/messages'))).toBe(true);
    expect(shouldShowBackButton(routeLike('/creator/workshop'))).toBe(true);
  });
});
