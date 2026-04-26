import { getToken } from './api';

function authHeaders(contentType = false): HeadersInit {
  const token = getToken();
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json() as { message?: string; error?: string };
    return body.message ?? body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function exportRulesetYaml(rulesetId: string, fileName: string): Promise<void> {
  const res = await fetch(`/api/rulesets/${rulesetId}/export?format=yaml`, {
    method: 'GET',
    headers: authHeaders(false),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, '导出 YAML 失败'));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function pickYamlFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,text/yaml,text/x-yaml';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
    };
    input.click();
  });
}

export async function importRulesetYaml(file: File): Promise<{ id: string; name: string }> {
  const yaml = await file.text();
  const res = await fetch('/api/rulesets/import', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ yaml }),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, '导入 YAML 失败'));
  }

  return res.json() as Promise<{ id: string; name: string }>;
}
