import type { OfertaComGtin } from '@shared/vinculo-auto';

export class MenorPrecoIndisponivelError extends Error {}

/**
 * Sob muitas requisições o Menor Preço não recusa: devolve ofertas sintéticas (lojas de
 * nome embaralhado, de outras UFs, GTINs inventados). Uma oferta fora do PR condena a
 * resposta inteira, porque as falsas do PR vêm misturadas.
 */
export class MenorPrecoBloqueadoError extends MenorPrecoIndisponivelError {}

function texto(x: unknown): string {
  return typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
}

function numero(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(texto(x).replace(',', '.'));
  return texto(x) === '' && typeof x !== 'number' ? null : Number.isFinite(n) ? n : null;
}

function registro(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

function lerOferta(bruto: unknown): OfertaComGtin | null {
  const item = registro(bruto);
  const estab = registro(item?.['estabelecimento']);
  if (!item || !estab) return null;
  const descricao = texto(item['desc']);
  const valor = numero(item['valor']);
  const razaoSocial = texto(estab['nm_emp']);
  if (!descricao || valor === null || !razaoSocial) return null;
  return {
    descricao,
    gtin: texto(item['gtin']) || null,
    valor,
    estabelecimento: {
      razaoSocial,
      logradouro: texto(estab['nm_logr']),
      municipio: texto(estab['mun']),
    },
  };
}

/** Valida item a item (o inválido é descartado) e recusa a resposta envenenada. */
export function lerOfertas(json: unknown): OfertaComGtin[] {
  const resposta = registro(json);
  const produtos = resposta?.['produtos'];
  if (!Array.isArray(produtos)) throw new MenorPrecoIndisponivelError('Resposta sem produtos');
  const foraDoPr = produtos.some((p) => {
    const uf = texto(registro(registro(p)?.['estabelecimento'])?.['uf']);
    return uf !== '' && uf !== 'PR';
  });
  if (foraDoPr) throw new MenorPrecoBloqueadoError('Resposta sintética (bloqueio por volume)');
  return produtos.map(lerOferta).filter((o): o is OfertaComGtin => o !== null);
}
