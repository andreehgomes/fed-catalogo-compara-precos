/**
 * Avaliação manual da IA do vínculo no gabarito do Menor Preço (fora do `npm test`; custa
 * centavos). Roda a regra das etiquetas e manda só as dúvidas para a Claude API real.
 *
 *   functions/node_modules/.bin/esbuild functions/scripts/avaliar-ia-vinculo.ts --bundle \
 *     --platform=node --format=cjs --alias:@shared=./shared --external:@anthropic-ai/sdk \
 *     --external:zod --outfile=functions/lib/avaliar-ia-vinculo.cjs
 *   node functions/lib/avaliar-ia-vinculo.cjs
 *
 * Chave: `ANTHROPIC_API_KEY` ou o arquivo `~/.anthropic_api_key`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { decidirPorEtiquetas, etiquetar, type Candidato } from '@shared/etiquetas';
import { criarClassificador, type ItemIa } from '../src/vinculo/ia';
import { MAX_ITENS_POR_CHAMADA } from '../src/vinculo/vincular-nota';

interface Oferta {
  desc: string;
  gtin: string;
  loja: string;
}

interface Duvida {
  item: ItemIa;
  gtinsPorRaiz: Map<string, Set<string>>;
  gtins: string[];
}

function chave(): string {
  const env = process.env['ANTHROPIC_API_KEY'];
  if (env) return env;
  const arquivo = resolve(homedir(), '.anthropic_api_key');
  if (existsSync(arquivo)) return readFileSync(arquivo, 'utf8').trim();
  throw new Error('Defina ANTHROPIC_API_KEY ou crie ~/.anthropic_api_key');
}

async function main() {
  const gabarito = JSON.parse(
    readFileSync(resolve('functions/test/fixtures/vinculo/gabarito-menor-preco-2026-09.json'), 'utf8'),
  ) as { grupos: { ofertas: Oferta[] }[] };

  let itens = 0;
  let ligadosRegra = 0;
  let acertosRegra = 0;
  const duvidas = new Map<string, Duvida>();

  for (const { ofertas } of gabarito.grupos) {
    const etiquetas = ofertas.map((o) => etiquetar(o.desc));
    ofertas.forEach((o, k) => {
      itens++;
      const e = etiquetas[k];
      if (!e.bloco) return;
      const gtinsPorRaiz = new Map<string, Set<string>>();
      const candidatos = new Map<string, Candidato>();
      ofertas.forEach((c, j) => {
        if (c.loja === o.loja || etiquetas[j].bloco !== e.bloco) return;
        const raiz = `${etiquetas[j].tipo}|${etiquetas[j].variantes.join(',')}`;
        gtinsPorRaiz.set(raiz, (gtinsPorRaiz.get(raiz) ?? new Set()).add(c.gtin));
        if (!candidatos.has(raiz))
          candidatos.set(raiz, { id: raiz, descricao: c.desc, ...etiquetas[j] });
      });
      const d = decidirPorEtiquetas(e, [...candidatos.values()]);
      if (d.tipo === 'ligar') {
        ligadosRegra++;
        if (gtinsPorRaiz.get(d.id)?.has(o.gtin)) acertosRegra++;
      } else if (d.tipo === 'ia') {
        const c = d.candidatos.map((x) => ({ id: x.id, d: x.descricao }));
        const id = `${o.desc}|${c.map((x) => x.d).join('|')}`;
        const atual = duvidas.get(id);
        if (atual) atual.gtins.push(o.gtin);
        else duvidas.set(id, { item: { i: duvidas.size + 1, d: o.desc, c }, gtinsPorRaiz, gtins: [o.gtin] });
      }
    });
  }

  const lista = [...duvidas.values()];
  const classificar = criarClassificador(chave());
  const lotes: ItemIa[][] = [];
  for (let k = 0; k < lista.length; k += MAX_ITENS_POR_CHAMADA)
    lotes.push(lista.slice(k, k + MAX_ITENS_POR_CHAMADA).map((d) => d.item));
  const respostas = await Promise.all(lotes.map((l) => classificar(l)));

  let ligadosIa = 0;
  let acertosIa = 0;
  let ambiguos = 0;
  let nenhum = 0;
  let custo = 0;
  for (const r of respostas) {
    custo += r.custoUsd;
    for (const { i, r: escolha } of r.decisoes) {
      const d = lista[i - 1];
      if (escolha === 'A') ambiguos += d.gtins.length;
      else if (escolha === 'N') nenhum += d.gtins.length;
      else {
        ligadosIa += d.gtins.length;
        const certos = d.gtinsPorRaiz.get(escolha);
        acertosIa += d.gtins.filter((g) => certos?.has(g)).length;
      }
    }
  }
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
  console.info(
    [
      `itens: ${itens}`,
      `regra: ${ligadosRegra} ligados, acerto ${pct(acertosRegra, ligadosRegra)}`,
      `IA: ${lista.length} dúvidas distintas em ${lotes.length} chamadas`,
      `IA: ${ligadosIa} ligados, acerto ${pct(acertosIa, ligadosIa)}; ${ambiguos} ambíguos; ${nenhum} nenhum`,
      `custo real: US$ ${custo.toFixed(4)}`,
    ].join('\n'),
  );
}

void main();
