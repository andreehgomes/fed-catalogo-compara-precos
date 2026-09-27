import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function lerEnvE2e(): Record<string, string> {
  const arquivo = resolve(__dirname, '../../.env.e2e');
  if (!existsSync(arquivo)) return {};
  const valores: Record<string, string> = {};
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return valores;
}

const env = { ...lerEnvE2e(), ...process.env };

export const E2E_EMAIL = env['E2E_EMAIL'] ?? '';
export const E2E_SENHA = env['E2E_SENHA'] ?? '';
export const TEM_USUARIO_E2E = !!E2E_EMAIL && !!E2E_SENHA;
export const MOTIVO_SEM_USUARIO =
  'Sem usuário de teste: crie a conta no Authentication do projeto dv e preencha .env.e2e (veja .env.e2e.example).';
