import { ANTHROPIC_API_KEY, EM_DEV, OPCOES_CALLABLE } from './config';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { DefinirApelidoEntrada, PreviewEntrada } from '@shared/model';
import { RepositorioFirestore } from './dados/repositorio-firestore';
import { executarDefinirApelido } from './estabelecimentos/definir-apelido';
import { executarConfirmacao } from './importar/confirmar-nfce';
import { contextoPadrao, type Contexto } from './importar/contexto';
import { executarPreview } from './importar/preview-nfce';
import { executarEnfileirar, executarRetentar } from './pendentes/enfileirar';
import { executarReprocessamento } from './pendentes/reprocessar-pendentes';
import { executarDesvincular, executarVincular } from './produtos/vincular-produto';
import { criarClassificador, type ClassificarVinculos } from './vinculo/ia';

let ctx: Contexto | null = null;
let classificador: ClassificarVinculos | null = null;

/** O secret só existe nas funções que o declaram, então o cliente nasce na 1ª chamada. */
const classificarVinculos: ClassificarVinculos = (itens) => {
  classificador ??= criarClassificador(ANTHROPIC_API_KEY.value());
  return classificador(itens);
};

function contexto(): Contexto {
  ctx ??= contextoPadrao(new RepositorioFirestore(), classificarVinculos, (html, motivo) => {
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

/** A gravação chama a IA do vínculo (até ~25 s). */
export const confirmarNfce = onCall(
  { ...OPCOES_CALLABLE, timeoutSeconds: 120, secrets: [ANTHROPIC_API_KEY] },
  (req: CallableRequest<{ chave?: string; apelido?: string | null }>) =>
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

export const definirApelido = onCall(
  OPCOES_CALLABLE,
  (req: CallableRequest<DefinirApelidoEntrada>) =>
    executarDefinirApelido(uidDe(req), req.data, contexto()),
);

export const reprocessarPendentes = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'America/Sao_Paulo',
    timeoutSeconds: 540,
    maxInstances: 1,
    secrets: [ANTHROPIC_API_KEY],
  },
  async () => {
    const resumo = await executarReprocessamento(contexto());
    logger.info('reprocessamento', resumo);
  },
);
