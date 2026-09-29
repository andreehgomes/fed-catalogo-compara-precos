import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { IA_MODELO, IA_TIMEOUT_MS, IA_USD_POR_MTOK } from './config-ia';

/** Item em dúvida: `i` é o número na nota, `d` a descrição e `c` os candidatos (id real). */
export interface ItemIa {
  i: number;
  d: string;
  c: { id: string; d: string }[];
}

/** `r`: id real do candidato escolhido, `N` (nenhum) ou `A` (ambíguo). */
export interface RespostaIa {
  decisoes: { i: number; r: string }[];
  custoUsd: number;
}

export type ClassificarVinculos = (itens: ItemIa[]) => Promise<RespostaIa>;

/** A IA respondeu sem decisão utilizável (recusa, corte, JSON inválido). */
export class IaSemDecisaoError extends Error {
  constructor(
    motivo: string,
    readonly custoUsd: number,
  ) {
    super(motivo);
  }
}

export const SISTEMA_IA = `Você compara produtos de supermercado brasileiros pelas descrições das notas fiscais (abreviadas e às vezes cortadas: DET=detergente, REFR=refrigerante, TRAD=tradicional, S/G=sem gás). Para cada item, escolha o candidato que é EXATAMENTE o mesmo produto: mesma marca, variante (sabor, zero/diet, tradicional/extraforte, integral/desnatado), tamanho e embalagem quando muda o produto.
Responda r = id do candidato (c1, c2…); "N" se nenhum é o mesmo; "A" se a descrição do item não diz a variante e o produto costuma ter variantes (ex.: "CAFE ITAMARATY 500G" diante de tradicional e extraforte). Na dúvida, "A": ligar errado é pior que não ligar.
Devolva uma decisão por item, com i = número do item.`;

export const SaidaIa = z.object({
  decisoes: z.array(z.object({ i: z.number().int(), r: z.string() })),
});

export type SaidaIa = z.infer<typeof SaidaIa>;

/** Uma linha por item e uma por candidato, com ids curtos: a IA nunca vê o id real (tem CNPJ). */
export function montarMensagem(itens: readonly ItemIa[]): string {
  return itens
    .map((it) => [`${it.i}. ${it.d}`, ...it.c.map((c, k) => `  c${k + 1}: ${c.d}`)].join('\n'))
    .join('\n');
}

export function custoUsd(uso: { input_tokens: number; output_tokens: number }): number {
  return (uso.input_tokens * IA_USD_POR_MTOK.entrada + uso.output_tokens * IA_USD_POR_MTOK.saida) / 1e6;
}

/** Traduz `c{k}` para o id real; item ou candidato desconhecido é descartado. */
export function traduzirDecisoes(itens: readonly ItemIa[], saida: SaidaIa): RespostaIa['decisoes'] {
  const porNumero = new Map(itens.map((it) => [it.i, it]));
  const vistos = new Set<number>();
  const decisoes: RespostaIa['decisoes'] = [];
  for (const { i, r } of saida.decisoes) {
    const item = porNumero.get(i);
    if (!item || vistos.has(i)) continue;
    vistos.add(i);
    const codigo = r.trim().toUpperCase();
    if (codigo === 'N' || codigo === 'A') {
      decisoes.push({ i, r: codigo });
      continue;
    }
    const k = /^C(\d+)$/.exec(codigo);
    const candidato = k ? item.c[Number(k[1]) - 1] : undefined;
    if (candidato) decisoes.push({ i, r: candidato.id });
  }
  return decisoes;
}

export interface MensagemIa {
  stop_reason: string | null;
  parsed_output: SaidaIa | null;
  usage: { input_tokens: number; output_tokens: number };
}

export function interpretarMensagem(itens: readonly ItemIa[], msg: MensagemIa): RespostaIa {
  const custo = custoUsd(msg.usage);
  if (msg.stop_reason !== 'end_turn') throw new IaSemDecisaoError(`stop:${msg.stop_reason}`, custo);
  if (!msg.parsed_output) throw new IaSemDecisaoError('sem-json', custo);
  return { decisoes: traduzirDecisoes(itens, msg.parsed_output), custoUsd: custo };
}

/**
 * Uma chamada para todos os itens em dúvida da nota. Recusa vai para o fallback do servidor;
 * qualquer outra falha lança e quem chama deixa os itens sem vínculo.
 */
export function criarClassificador(apiKey: string): ClassificarVinculos {
  const cliente = new Anthropic({ apiKey, timeout: IA_TIMEOUT_MS, maxRetries: 1 });
  return async (itens) => {
    const msg = await cliente.beta.messages.parse({
      model: IA_MODELO,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(SaidaIa) },
      system: SISTEMA_IA,
      messages: [{ role: 'user', content: montarMensagem(itens) }],
    });
    return interpretarMensagem(itens, msg);
  };
}
