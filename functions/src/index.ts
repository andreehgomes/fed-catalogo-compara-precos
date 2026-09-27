import { EM_DEV, OPCOES_CALLABLE } from './config';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { PreviewEntrada } from '@shared/model';
import { RepositorioFirestore } from './dados/repositorio-firestore';
import { executarConfirmacao } from './importar/confirmar-nfce';
import { contextoPadrao, type Contexto } from './importar/contexto';
import { executarPreview } from './importar/preview-nfce';
import { executarEnfileirar, executarRetentar } from './pendentes/enfileirar';
import { executarReprocessamento } from './pendentes/reprocessar-pendentes';
import { executarDesvincular, executarVincular } from './produtos/vincular-produto';

let ctx: Contexto | null = null;

function contexto(): Contexto {
  ctx ??= contextoPadrao(new RepositorioFirestore(), (html, motivo) => {
    if (EM_DEV) logger.warn('html-layout-inesperado', { motivo, html: html.slice(0, 20_000) });
  });
  return ctx;
}

function uidDe(req: CallableRequest): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para importar notas.');
  return uid;
}

export const previewNfce = onCall(OPCOES_CALLABLE, (req: CallableRequest<PreviewEntrada>) =>
  executarPreview(uidDe(req), req.data, contexto()),
);

export const confirmarNfce = onCall(OPCOES_CALLABLE, (req: CallableRequest<{ chave?: string }>) =>
  executarConfirmacao(uidDe(req), req.data, contexto()),
);

export const enfileirarNfce = onCall(OPCOES_CALLABLE, (req: CallableRequest<PreviewEntrada>) =>
  executarEnfileirar(uidDe(req), req.data, contexto()),
);

export const retentarPendente = onCall(
  OPCOES_CALLABLE,
  (req: CallableRequest<{ chave?: string }>) => executarRetentar(uidDe(req), req.data, contexto()),
);

export const vincularProduto = onCall(
  OPCOES_CALLABLE,
  (req: CallableRequest<{ origem?: string; destino?: string }>) =>
    executarVincular(uidDe(req), req.data, contexto()),
);

export const desvincularProduto = onCall(
  OPCOES_CALLABLE,
  (req: CallableRequest<{ id?: string }>) => {
    uidDe(req);
    return executarDesvincular(req.data, contexto());
  },
);

export const reprocessarPendentes = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'America/Sao_Paulo',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const resumo = await executarReprocessamento(contexto());
    logger.info('reprocessamento', resumo);
  },
);
