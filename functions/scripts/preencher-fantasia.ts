/**
 * Preenchimento retroativo do nome fantasia (RF-11). Manual, fora do `npm test`, rodado pelo
 * usuário contra um projeto com ADC (`gcloud auth application-default login`). Consulta os
 * estabelecimentos sem `fantasiaConsultadaEm` (1 s entre consultas) e o `estabelecimentoNome`
 * das notas desses CNPJs. Notas de loja com apelido do usuário ficam como estão.
 *
 *   functions/node_modules/.bin/esbuild functions/scripts/preencher-fantasia.ts --bundle \
 *     --platform=node --format=cjs --alias:@shared=./shared --external:firebase-admin \
 *     --outfile=functions/lib/preencher-fantasia.cjs
 *   GOOGLE_CLOUD_PROJECT=fed-catalogo-compara-precos-dv node functions/lib/preencher-fantasia.cjs
 *
 * Padrão: `--simular` (só lista). Para aplicar, acrescente `--gravar`.
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { formatarCnpj } from '@shared/chave-acesso';
import type { Estabelecimento, Nota } from '@shared/model';
import { limparFantasia } from '@shared/nome-fantasia';
import { criarConsultaCnpj } from '../src/cnpj/consultar-cnpj';
import { LIMITE_LOTE } from '../src/dados/repositorio';

const ESPERA_MS = 1_000;

interface Escrita {
  ref: DocumentReference;
  dados: Record<string, unknown>;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const gravar = process.argv.includes('--gravar');
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  if (!projectId)
    throw new Error('Defina GOOGLE_CLOUD_PROJECT (ex.: fed-catalogo-compara-precos-dv)');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const consultar = criarConsultaCnpj({ fetch: (...a) => fetch(...a), agora: Date.now });
  const agora = new Date().toISOString();

  const pendentes = (await db.collection('estabelecimentos').get()).docs
    .map((d) => d.data() as Estabelecimento)
    .filter((e) => !e.fantasiaConsultadaEm);
  console.info(`${projectId}: ${pendentes.length} estabelecimento(s) sem consulta`);

  const escritas: Escrita[] = [];
  const nomes = new Map<string, string>();
  let falhas = 0;
  for (const [k, e] of pendentes.entries()) {
    if (k > 0) await esperar(ESPERA_MS);
    try {
      const r = await consultar(e.cnpj);
      const fantasia = r.status === 'ok' ? limparFantasia(r.nomeFantasia, e.nome) : undefined;
      if (fantasia) nomes.set(e.cnpj, fantasia);
      escritas.push({
        ref: db.doc(`estabelecimentos/${e.cnpj}`),
        dados: { ...(fantasia ? { fantasia } : {}), fantasiaConsultadaEm: agora },
      });
      console.info(`${formatarCnpj(e.cnpj)} → ${fantasia ?? '(sem nome fantasia)'} [${r.fonte}]`);
    } catch (erro) {
      falhas++;
      console.warn(`${formatarCnpj(e.cnpj)} → falhou (${String(erro)})`);
    }
  }

  let notas = 0;
  let comApelido = 0;
  if (nomes.size) {
    const apelidos = new Set(
      (await db.collectionGroup('estabelecimentos').get()).docs
        .filter((d) => d.ref.parent.parent?.parent.id === 'usuarios')
        .map((d) => `${d.ref.parent.parent?.id}|${d.id}`),
    );
    for (const d of (await db.collectionGroup('notas').get()).docs) {
      const n = d.data() as Nota;
      const fantasia = nomes.get(n.cnpj);
      if (!fantasia || n.estabelecimentoNome === fantasia) continue;
      if (apelidos.has(`${d.ref.parent.parent?.id}|${n.cnpj}`)) {
        comApelido++;
        continue;
      }
      escritas.push({ ref: d.ref, dados: { estabelecimentoNome: fantasia } });
      notas++;
    }
  }

  console.info(
    [
      `consultados: ${pendentes.length - falhas}`,
      `com nome fantasia: ${nomes.size}`,
      `falhas (puladas): ${falhas}`,
      `notas afetadas: ${notas}`,
      `notas com apelido (puladas): ${comApelido}`,
    ].join('\n'),
  );
  if (!gravar) {
    console.info('Simulação: nada foi gravado. Rode com --gravar para aplicar.');
    return;
  }
  for (let i = 0; i < escritas.length; i += LIMITE_LOTE) {
    const lote = db.batch();
    for (const { ref, dados } of escritas.slice(i, i + LIMITE_LOTE))
      lote.set(ref, dados, { merge: true });
    await lote.commit();
  }
  console.info(`Gravado: ${escritas.length} documento(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
