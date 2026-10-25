import { GRANEL, formatarTamanho, sinonimo, type Etiquetas } from './etiquetas';
import { semAcento } from './normalizar';

export const MIN_NOME_PRODUTO = 2;
export const MAX_NOME_PRODUTO = 80;

/** O que a IA devolve para cada descrição da NFC-e (`functions/src/nome/`). */
export interface NomeIa {
  nome: string;
  tipo: string | null;
  marca: string | null;
  variantes: string[];
  tamanho: { quantidade: number; unidade: 'g' | 'kg' | 'ml' | 'L' | 'un' } | null;
  granel: boolean;
}

const FATOR_TAMANHO: Record<NonNullable<NomeIa['tamanho']>['unidade'], [number, string]> = {
  g: [0.001, 'kg'],
  kg: [1, 'kg'],
  ml: [0.001, 'L'],
  L: [1, 'L'],
  un: [1, 'un'],
};

export function nomeDoItem(item: { nome?: string; descricao: string }): string {
  return item.nome || item.descricao;
}

/** Correção do usuário: `null` se não servir como nome (curto, longo, sem letra, com controle). */
export function limparNomeProduto(bruto: string | null | undefined): string | null {
  const nome = (bruto ?? '').trim().replace(/\s+/g, ' ');
  if (
    nome.length < MIN_NOME_PRODUTO ||
    nome.length > MAX_NOME_PRODUTO ||
    /\p{Cc}/u.test(nome) ||
    !/\p{L}/u.test(nome)
  )
    return null;
  return nome;
}

/** Mesma grafia da regra: maiúsculas, sem acento, sem pontuação ("Coca-Cola" → "COCA COLA"). */
function termo(t: string | null): string | null {
  const limpo = semAcento(t ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return limpo || null;
}

function tamanhoDaIa(t: NomeIa['tamanho']): string | null {
  if (!t || !(t.quantidade > 0)) return null;
  const [fator, base] = FATOR_TAMANHO[t.unidade];
  return `${Math.round(t.quantidade * fator * 1000) / 1000}${base}`;
}

/**
 * Etiquetas no formato da regra a partir da resposta da IA, para o vínculo seguir igual.
 * O tamanho lido da descrição vence o da IA: a regex não inventa número. Bloco:
 * `MARCA|tamanho`, `MARCA|GRANEL` (a granel com marca) ou `GRANEL|TIPO` (hortifruti, açougue).
 */
export function etiquetasDaIa(r: NomeIa, descricao: string): Etiquetas {
  const tipo = termo(r.tipo);
  const marca = termo(r.marca);
  const tamanho = formatarTamanho(descricao) ?? tamanhoDaIa(r.tamanho);
  const variantes = [
    ...new Set(
      r.variantes
        .map((v) => termo(v)?.replace(/ /g, ''))
        .filter((v): v is string => !!v)
        .map(sinonimo)
        .filter((v) => ![tipo, marca].some((t) => t?.replace(/ /g, '') === v)),
    ),
  ].sort();
  return {
    tipo,
    marca,
    tamanho,
    variantes,
    bloco: bloco(r.granel, tipo, marca, tamanho),
    origem: 'ia',
  };
}

function bloco(
  granel: boolean,
  tipo: string | null,
  marca: string | null,
  tamanho: string | null,
): string | null {
  if (granel) return marca ? `${marca}|${GRANEL}` : tipo ? `${GRANEL}|${tipo}` : null;
  return marca && tamanho ? `${marca}|${tamanho}` : null;
}
