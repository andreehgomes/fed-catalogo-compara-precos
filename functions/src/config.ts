import { initializeApp } from 'firebase-admin/app';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';

export const REGIAO = 'southamerica-east1';

setGlobalOptions({ region: REGIAO, maxInstances: 5 });
initializeApp();

/** Toda callable exige App Check (RNF-25); o token não é consumido (replay é tolerado). */
export const OPCOES_CALLABLE = {
  enforceAppCheck: true,
  consumeAppCheckToken: false,
  timeoutSeconds: 60,
  memory: '256MiB',
} as const;

export const EM_DEV = process.env['GCLOUD_PROJECT']?.endsWith('-dv') ?? false;

/** Chave da Claude API do vínculo por IA (`firebase functions:secrets:set ANTHROPIC_API_KEY`). */
export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
