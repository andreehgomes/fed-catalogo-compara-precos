/**
 * Retroativo do nome legível e do vínculo automático (etiquetas + IA) sobre os produtos já
 * importados. Manual, fora do `npm test`, rodado pelo usuário contra um projeto com ADC
 * (`gcloud auth application-default login`). Lê todos os `produtos`, roda
 * `reprocessarVinculos` num repositório em memória e, com `--gravar`, grava só os documentos
 * que mudaram (produtos e o gasto do mês em `controle/ia_AAAA-MM`) e o `nome` dos itens nas
 * notas de todos os usuários. Não rode durante importações: um produto ou nota alterado no meio
 * é sobrescrito pela versão lida no início.
 *
 *   functions/node_modules/.bin/esbuild functions/scripts/reprocessar-vinculos.ts --bundle \
 *     --platform=node --format=cjs --alias:@shared=./shared --external:firebase-admin \
 *     --external:firebase-functions --external:@anthropic-ai/sdk --external:zod \
 *     --outfile=functions/lib/reprocessar-vinculos.cjs
 *   GOOGLE_CLOUD_PROJECT=fed-catalogo-compara-precos-dv node functions/lib/reprocessar-vinculos.cjs
 *
 * Padrão: `--simular` (nada é gravado e a IA não é chamada). `--com-ia` chama a IA (nome e
 * vínculo) também na simulação, para ver os nomes antes de gravar (custa centavos). `--gravar`
 * aplica, com IA; `--gravar --sem-ia` aplica só a regra das etiquetas.
 * Modelos: os de `controle/configIa` (tela Configurações de IA; padrão Opus 5.5).
 * `--modelo-nome=<id>` e `--modelo-vinculo=<id>` sobrepõem só nesta execução (não gravam a config).
 * Chave da IA: `ANTHROPIC_API_KEY` ou o arquivo `~/.anthropic_api_key`; consome o saldo da
 * organização do Console da chave (os créditos mensais do plano Max valem na organização vinculada).
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Nota, Produto } from '@shared/model';
import { configIaDe, idModeloValido, type ConfigIa } from '@shared/modelos-ia';
import { LIMITE_LOTE, type Dados } from '../src/dados/repositorio';
import { CAMINHO_CONFIG_IA } from '../src/ia/config-ia-firestore';
import { contextoPadrao } from '../src/importar/contexto';
import { criarNormalizador, type NormalizarNomes } from '../src/nome/ia-nome';
import { criarClassificador, type ClassificarVinculos } from '../src/vinculo/ia';
import { reprocessarVinculos } from '../src/vinculo/reprocessar-vinculos';
import { caminhoGastoIa } from '../src/vinculo/vincular-nota';
import { RepositorioMemoria } from '../test/fakes/repositorio-memoria';

function chave(): string {
  const env = process.env['ANTHROPIC_API_KEY'];
  if (env) return env;
  const arquivo = resolve(homedir(), '.anthropic_api_key');
  if (existsSync(arquivo)) return readFileSync(arquivo, 'utf8').trim();
  throw new Error('Defina ANTHROPIC_API_KEY ou crie ~/.anthropic_api_key');
}

function modeloDoArgumento(args: readonly string[], nome: string): string | undefined {
  const valor = args.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];
  if (valor !== undefined && !idModeloValido(valor))
    throw new Error(`--${nome}: modelo desconhecido "${valor}"`);
  return valor;
}

const semIa: ClassificarVinculos = async () => ({ decisoes: [], custoUsd: 0 });
const semNome: NormalizarNomes = async () => ({ nomes: new Map(), custoUsd: 0, chamadas: 0 });

async function main() {
  const args = process.argv.slice(2);
  const gravar = args.includes('--gravar');
  const usarIa = gravar ? !args.includes('--sem-ia') : args.includes('--com-ia');
  const projectId = process.env['GOOGLE_CLOUD_PROJECT'];
  if (!projectId)
    throw new Error('Defina GOOGLE_CLOUD_PROJECT (ex.: fed-catalogo-compara-precos-dv)');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const agora = new Date();
  const gasto = caminhoGastoIa(agora);

  const memoria = new RepositorioMemoria();
  const produtos = (await db.collection('produtos').get()).docs.map((d) => d.data() as Produto);
  for (const p of produtos) await memoria.gravar(`produtos/${p.id}`, { ...p });
  const gastoAtual = (await db.doc(gasto).get()).data();
  if (gastoAtual) await memoria.gravar(gasto, gastoAtual);
  const salva = configIaDe((await db.doc(CAMINHO_CONFIG_IA).get()).data());
  const modelos: ConfigIa = configIaDe({
    modeloNome: modeloDoArgumento(args, 'modelo-nome') ?? salva.modeloNome,
    modeloVinculo: modeloDoArgumento(args, 'modelo-vinculo') ?? salva.modeloVinculo,
  });
  await memoria.gravar(CAMINHO_CONFIG_IA, { ...modelos });
  const antes = new Map([...memoria.docs].map(([c, d]) => [c, JSON.stringify(d)]));
  console.info(
    `${projectId}: ${produtos.length} produto(s); IA ${usarIa ? 'ligada' : 'desligada'}; ` +
      `gasto do mês US$ ${Number(gastoAtual?.['custoUsd'] ?? 0).toFixed(4)} (sem teto)
` +
      `modelos: nome ${modelos.modeloNome}, vínculo ${modelos.modeloVinculo}`,
  );

  const ctx = {
    ...contextoPadrao(memoria, {
      classificarVinculos: usarIa ? criarClassificador(chave()) : semIa,
      normalizarNomes: usarIa ? criarNormalizador(chave()) : semNome,
    }),
    agora: () => agora,
    log: () => undefined,
  };
  const r = await reprocessarVinculos(ctx, produtos);

  const mudaram = [...memoria.docs].filter(
    ([c, d]) =>
      c !== CAMINHO_CONFIG_IA && antes.get(c) !== JSON.stringify(d) && (usarIa || c !== gasto),
  );
  const desc = (id: unknown) =>
    (memoria.docs.get(`produtos/${String(id)}`)?.['descricao'] as string) ?? String(id);
  for (const [c, d] of mudaram) {
    const anterior = JSON.parse(antes.get(c) ?? '{}') as Dados;
    if (d['nome'] && d['nome'] !== anterior['nome'])
      console.info(`nome  ${String(d['descricao'])} → ${String(d['nome'])}`);
    if (d['vinculadoA'] && d['vinculadoA'] !== anterior['vinculadoA'])
      console.info(
        `liga  ${String(d['descricao'])} → ${desc(d['vinculadoA'])} [${String(d['vinculoMotivo'])}]`,
      );
    else if (d['candidatosVinculo'] && !anterior['candidatosVinculo'])
      console.info(
        `talvez ${String(d['descricao'])} → ${(d['candidatosVinculo'] as string[]).map(desc).join(' | ')}`,
      );
  }

  const nomes = new Map(
    [...memoria.docs]
      .filter(([c, d]) => c.startsWith('produtos/') && d['nome'])
      .map(([, d]) => [String(d['id']), String(d['nome'])]),
  );
  const notas = (await db.collectionGroup('notas').get()).docs.flatMap((doc) => {
    if (doc.ref.parent.parent?.parent.id !== 'usuarios') return [];
    const itens = (doc.data() as Nota).itens ?? [];
    if (!itens.some((i) => nomes.has(i.produtoId) && i.nome !== nomes.get(i.produtoId))) return [];
    return [
      {
        ref: doc.ref,
        itens: itens.map((i) =>
          nomes.has(i.produtoId) ? { ...i, nome: nomes.get(i.produtoId) } : i,
        ),
      },
    ];
  });

  console.info(
    [
      `sem nome: ${r.semNome}${usarIa ? '' : ' (iriam para a IA)'}`,
      `nomeados pela IA: ${r.nomeados}${r.erroNome ? ` (falha: ${r.erroNome})` : ''}`,
      `chamadas de nome: ${r.chamadasNome}, custo US$ ${r.custoNomeUsd.toFixed(4)}`,
      `notas com nome novo nos itens: ${notas.length}`,
      `etiquetas preenchidas: ${r.etiquetasPreenchidas}`,
      `loc: sem vínculo com bloco: ${r.semVinculo} (em ${r.lojas} loja(s))`,
      `ligados pela regra: ${r.etiquetas}`,
      `dúvidas: ${r.duvidas}${usarIa ? '' : ' (iriam para a IA)'}`,
      `ligados pela IA: ${r.ia}`,
      `possíveis equivalentes (A): ${r.ambiguos}`,
      `chamadas à IA: ${usarIa ? r.chamadasIa : 0}, custo US$ ${r.custoUsd.toFixed(4)}`,
      `documentos alterados: ${mudaram.length}`,
    ].join('\n'),
  );
  if (!gravar) {
    console.info('Simulação: nada foi gravado. Rode com --gravar para aplicar.');
    return;
  }
  for (let i = 0; i < mudaram.length; i += LIMITE_LOTE) {
    const lote = db.batch();
    for (const [c, d] of mudaram.slice(i, i + LIMITE_LOTE)) lote.set(db.doc(c), d);
    await lote.commit();
  }
  for (let i = 0; i < notas.length; i += LIMITE_LOTE) {
    const lote = db.batch();
    for (const n of notas.slice(i, i + LIMITE_LOTE))
      lote.set(n.ref, { itens: n.itens }, { merge: true });
    await lote.commit();
  }
  console.info(`Gravado: ${mudaram.length} produto(s)/controle e ${notas.length} nota(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
