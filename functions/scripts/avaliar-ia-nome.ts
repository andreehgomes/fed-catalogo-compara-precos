/**
 * Medição manual da IA de nome por modelo (fora do `npm test`; custa centavos). Manda as mesmas
 * descrições do gabarito do Menor Preço para cada modelo da lista e compara tempo, custo, blocos
 * que coincidem entre ofertas do mesmo GTIN em lojas diferentes (o que o vínculo precisa) e uma
 * amostra de nomes lado a lado. A regra (`etiquetar`) entra como referência.
 *
 *   functions/node_modules/.bin/esbuild functions/scripts/avaliar-ia-nome.ts --bundle \
 *     --platform=node --format=cjs --alias:@shared=./shared --external:@anthropic-ai/sdk \
 *     --external:zod --outfile=functions/lib/avaliar-ia-nome.cjs
 *   node functions/lib/avaliar-ia-nome.cjs [--n=120] [--modelos=claude-haiku-5-5,claude-opus-5-5]
 *
 * Chave: `ANTHROPIC_API_KEY` ou o arquivo `~/.anthropic_api_key`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { etiquetar } from '@shared/etiquetas';
import { MODELOS_IA, idModeloValido, type IdModeloIa } from '@shared/modelos-ia';
import { etiquetasDaIa } from '@shared/nome-produto';
import { criarNormalizador } from '../src/nome/ia-nome';

interface Oferta {
  desc: string;
  gtin: string;
  loja: string;
}

const AMOSTRA_NOMES = 30;

function chave(): string {
  const env = process.env['ANTHROPIC_API_KEY'];
  if (env) return env;
  const arquivo = resolve(homedir(), '.anthropic_api_key');
  if (existsSync(arquivo)) return readFileSync(arquivo, 'utf8').trim();
  throw new Error('Defina ANTHROPIC_API_KEY ou crie ~/.anthropic_api_key');
}

function argumento(nome: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];
}

/** Pares de descrições do mesmo GTIN em lojas diferentes: quantos têm o mesmo bloco (não nulo). */
function blocosCoincidentes(ofertas: readonly Oferta[], bloco: (desc: string) => string | null) {
  let pares = 0;
  let iguais = 0;
  for (let a = 0; a < ofertas.length; a++)
    for (let b = a + 1; b < ofertas.length; b++) {
      const [x, y] = [ofertas[a], ofertas[b]];
      if (x.gtin !== y.gtin || x.loja === y.loja) continue;
      pares++;
      const bx = bloco(x.desc);
      if (bx && bx === bloco(y.desc)) iguais++;
    }
  return { pares, iguais };
}

async function main() {
  const n = Number(argumento('n') ?? 120);
  const pedidos = (argumento('modelos')?.split(',') ?? MODELOS_IA.map((m) => m.id)).filter(
    idModeloValido,
  ) as IdModeloIa[];
  const gabarito = JSON.parse(
    readFileSync(
      resolve('functions/test/fixtures/vinculo/gabarito-menor-preco-2026-09.json'),
      'utf8',
    ),
  ) as { grupos: { ofertas: Oferta[] }[] };

  const ofertas: Oferta[] = [];
  const vistas = new Set<string>();
  for (const { ofertas: grupo } of gabarito.grupos)
    for (const o of grupo)
      if (!vistas.has(o.desc) && ofertas.length < n) {
        vistas.add(o.desc);
        ofertas.push(o);
      }
  const descricoes = ofertas.map((o) => o.desc);
  const itens = descricoes.map((d, k) => ({ i: k + 1, d }));
  console.info(
    `${descricoes.length} descrições únicas do gabarito; modelos: ${pedidos.join(', ')}\n`,
  );

  const regra = blocosCoincidentes(ofertas, (d) => etiquetar(d).bloco);
  console.info(
    `regra (etiquetar): ${regra.iguais}/${regra.pares} pares do mesmo GTIN com o mesmo bloco`,
  );

  const normalizar = criarNormalizador(chave());
  const nomesPorModelo = new Map<IdModeloIa, Map<string, string>>();
  for (const modelo of pedidos) {
    const inicio = Date.now();
    try {
      const r = await normalizar(itens, modelo);
      const segundos = (Date.now() - inicio) / 1000;
      const nomes = new Map<string, string>();
      const blocos = new Map<string, string | null>();
      for (const [i, nome] of r.nomes) {
        const d = descricoes[i - 1];
        nomes.set(d, nome.nome);
        blocos.set(d, etiquetasDaIa(nome, d).bloco);
      }
      nomesPorModelo.set(modelo, nomes);
      const m = blocosCoincidentes(ofertas, (d) => blocos.get(d) ?? null);
      console.info(
        [
          `${modelo}:`,
          `${segundos.toFixed(1)} s`,
          `${r.chamadas} chamada(s)`,
          `US$ ${r.custoUsd.toFixed(4)}`,
          `${nomes.size}/${descricoes.length} nomeados`,
          `${m.iguais}/${m.pares} pares do mesmo GTIN com o mesmo bloco`,
          r.erro ? `falha parcial: ${String(r.erro)}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      );
    } catch (e) {
      console.info(`${modelo}: falhou (${String(e)})`);
    }
  }

  console.info('\nAmostra (descrição → nome por modelo):');
  for (const d of descricoes.slice(0, AMOSTRA_NOMES)) {
    console.info(`\n${d}`);
    for (const modelo of pedidos)
      console.info(`  ${modelo.padEnd(18)} ${nomesPorModelo.get(modelo)?.get(d) ?? '—'}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
