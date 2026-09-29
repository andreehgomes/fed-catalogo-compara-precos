import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decidirPorEtiquetas, etiquetar, type Candidato } from '@shared/etiquetas';

interface Oferta {
  desc: string;
  gtin: string;
  loja: string;
  valor: number;
}

interface Gabarito {
  grupos: { busca: string; ofertas: Oferta[] }[];
}

const gabarito = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/vinculo/gabarito-menor-preco-2026-09.json'), 'utf8'),
) as Gabarito;

/**
 * Cada oferta faz o papel de produto novo; as ofertas de outras lojas do mesmo bloco são
 * a base. Ofertas com as mesmas variantes contam como uma raiz só (a regra já as teria
 * ligado entre si), e a ligação acerta se algum GTIN daquela raiz é o da oferta.
 */
function medir() {
  let itens = 0;
  let blocoVazio = 0;
  let semCandidato = 0;
  let ligados = 0;
  let acertos = 0;
  let paraIa = 0;
  let candidatosIa = 0;
  const erros: string[] = [];

  for (const { ofertas } of gabarito.grupos) {
    const etiquetas = ofertas.map((o) => etiquetar(o.desc));
    ofertas.forEach((o, k) => {
      itens++;
      const e = etiquetas[k];
      if (!e.bloco) {
        blocoVazio++;
        return;
      }
      const gtinsPorRaiz = new Map<string, Set<string>>();
      const candidatos = new Map<string, Candidato>();
      ofertas.forEach((c, j) => {
        if (c.loja === o.loja || etiquetas[j].bloco !== e.bloco) return;
        const raiz = `${etiquetas[j].tipo}|${etiquetas[j].variantes.join(',')}`;
        const gtins = gtinsPorRaiz.get(raiz) ?? new Set<string>();
        gtins.add(c.gtin);
        gtinsPorRaiz.set(raiz, gtins);
        if (!candidatos.has(raiz))
          candidatos.set(raiz, { id: raiz, descricao: c.desc, ...etiquetas[j] });
      });
      const d = decidirPorEtiquetas(e, [...candidatos.values()]);
      if (d.tipo === 'nenhum') semCandidato++;
      else if (d.tipo === 'ia') {
        paraIa++;
        candidatosIa += d.candidatos.length;
      } else {
        ligados++;
        if (gtinsPorRaiz.get(d.id)?.has(o.gtin)) acertos++;
        else erros.push(`${o.desc} → ${candidatos.get(d.id)?.descricao}`);
      }
    });
  }
  return { itens, blocoVazio, semCandidato, ligados, acertos, paraIa, candidatosIa, erros };
}

describe('etiquetas no gabarito do Menor Preço', () => {
  it('a regra acerta ≥ 90% das ligações e manda ≤ 5 candidatos por item à IA', () => {
    const m = medir();
    const acerto = m.acertos / m.ligados;
    const mediaIa = m.paraIa ? m.candidatosIa / m.paraIa : 0;
    console.info(
      [
        `itens: ${m.itens}`,
        `bloco vazio: ${m.blocoVazio} (${pct(m.blocoVazio, m.itens)})`,
        `sem candidato/conflito: ${m.semCandidato} (${pct(m.semCandidato, m.itens)})`,
        `ligados pela regra: ${m.ligados} (${pct(m.ligados, m.itens)}), acerto ${pct(m.acertos, m.ligados)}`,
        `para a IA: ${m.paraIa} (${pct(m.paraIa, m.itens)}), ${mediaIa.toFixed(2)} candidatos/item`,
        ...m.erros.map((e) => `  divergente: ${e}`),
      ].join('\n'),
    );
    expect(m.ligados).toBeGreaterThan(0);
    expect(acerto).toBeGreaterThanOrEqual(0.9);
    expect(mediaIa).toBeLessThanOrEqual(5);
  });
});

function pct(a: number, b: number): string {
  return b ? `${((a / b) * 100).toFixed(1)}%` : '—';
}
