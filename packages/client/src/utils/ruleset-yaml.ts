/**
 * ruleset-yaml.ts
 * 规则包 YAML 导出 / 导入工具
 *
 * 依赖：js-yaml（客户端轻量 YAML 解析器）
 * 若未安装，退化为直接调用后端 export API 下载文件
 */

import { api } from './api';

/** 触发浏览器文件下载 */
function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 通过后端 API 下载规则集 YAML 文件
 */
export async function exportRulesetYaml(rulesetId: string, filename?: string): Promise<void> {
  // 后端返回 YAML 文本
  const response = await fetch(`/api/v1/rulesets/${rulesetId}/export?format=yaml`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    },
  });
  if (!response.ok) {
    throw new Error(`导出失败：${response.status} ${response.statusText}`);
  }
  const yaml = await response.text();
  triggerDownload(yaml, filename ?? `ruleset-${rulesetId}.yaml`, 'text/yaml;charset=utf-8');
}

/**
 * 通过后端 API 导入规则集 YAML 文件
 * @returns 新建的规则集 ID
 */
export async function importRulesetYaml(file: File): Promise<{ id: string; name: string }> {
  const yaml = await file.text();
  const data = await api.post<{ id: string; name: string }>('/rulesets/import', { yaml });
  return data;
}

/**
 * 打开文件选择对话框，选择 .yaml / .yml 文件并返回
 */
export function pickYamlFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}
