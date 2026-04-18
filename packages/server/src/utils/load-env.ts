import fs from 'fs';
import path from 'path';

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const envContent = fs.readFileSync(filePath, 'utf8');
  const parsed = parseEnv(envContent);

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
const rootEnvPath = path.resolve(cwd, '../../.env');
const serverEnvPath = path.resolve(cwd, '.env');

loadEnvFile(rootEnvPath);
loadEnvFile(serverEnvPath);
