import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MODELO_IA_PADRAO, custoDoModelo, type IdModeloIa } from '@shared/modelos-ia';
import { parametrosDoModelo } from '../ia/modelos';
import { IA_TIMEOUT_MS } from './config-ia';

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

export type ClassificarVinculos = (itens: ItemIa[], modelo: IdModeloIa) => Promise<RespostaIa>;

/** A IA respondeu sem decisão utilizável (recusa, corte, JSON inválido). */
export class IaSemDecisaoError extends Error {
  constructor(
    motivo: string,
    readonly custoUsd: number,
  ) {
    super(motivo);
  }
}

export interface ErroIa {
  erro: string;
  /** `error.type` da API (`authentication_error`, `invalid_request_error`…), quando houver. */
  tipo?: string;
}

/**
 * Motivo da falha para o log, sem a mensagem livre da API (pode citar o pedido) nem a chave:
 * só o status HTTP, o tipo do erro ou a classe de falha de rede.
 */
export function erroIa(e: unknown): ErroIa {
  if (e instanceof IaSemDecisaoError) return { erro: `ia-${e.message}` };
  if (e instanceof APIConnectionTimeoutError) return { erro: 'ia-timeout' };
  if (e instanceof APIConnectionError) return { erro: 'ia-conexao' };
  if (e instanceof APIError)
    return { erro: `ia-${e.status ?? 'erro'}`, ...(e.type ? { tipo: e.type } : {}) };
  return { erro: 'ia-erro' };
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

export function custoUsd(
  uso: { input_tokens: number; output_tokens: number },
  modelo: IdModeloIa = MODELO_IA_PADRAO,
): number {
  return custoDoModelo(modelo, uso);
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

export interface MensagemIa<T = SaidaIa> {
  stop_reason: string | null;
  parsed_output: T | null;
  usage: { input_tokens: number; output_tokens: number };
}

export function interpretarMensagem(
  itens: readonly ItemIa[],
  msg: MensagemIa,
  modelo: IdModeloIa = MODELO_IA_PADRAO,
): RespostaIa {
  const custo = custoUsd(msg.usage, modelo);
  if (msg.stop_reason !== 'end_turn') throw new IaSemDecisaoError(`stop:${msg.stop_reason}`, custo);
  if (!msg.parsed_output) throw new IaSemDecisaoError('sem-json', custo);
  return { decisoes: traduzirDecisoes(itens, msg.parsed_output), custoUsd: custo };
}

/**
 * Uma chamada para todos os itens em dúvida da nota, no modelo da configuração. Recusa vai
 * para o fallback do servidor (quando o modelo tem); qualquer outra falha lança e quem chama
 * deixa os itens sem vínculo.
 */
export function criarClassificador(apiKey: string): ClassificarVinculos {
  const cliente = new Anthropic({ apiKey, timeout: IA_TIMEOUT_MS, maxRetries: 1 });
  return async (itens, modelo) => {
    const msg = await cliente.beta.messages.parse({
      ...parametrosDoModelo(modelo),
      max_tokens: 4000,
      output_config: { effort: 'low', format: betaZodOutputFormat(SaidaIa) },
      system: SISTEMA_IA,
      messages: [{ role: 'user', content: montarMensagem(itens) }],
    });
    return interpretarMensagem(itens, msg, modelo);
  };
}
