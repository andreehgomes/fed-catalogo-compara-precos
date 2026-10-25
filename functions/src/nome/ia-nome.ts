import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { limparNomeProduto, type NomeIa } from '@shared/nome-produto';
import { MODELO_IA_PADRAO, type IdModeloIa } from '@shared/modelos-ia';
import { parametrosDoModelo } from '../ia/modelos';
import { IA_TIMEOUT_MS } from '../vinculo/config-ia';
import { IaSemDecisaoError, custoUsd, type MensagemIa } from '../vinculo/ia';

export const MAX_ITENS_POR_PARTE = 40;
export const MAX_PARTES_EM_PARALELO = 3;

/** `i` é um número curto (a posição), `d` a descrição da NFC-e: a IA não vê id nem CNPJ. */
export interface ItemNome {
  i: number;
  d: string;
}

export interface RespostaNomes {
  nomes: Map<number, NomeIa>;
  custoUsd: number;
  chamadas: number;
  /** Primeira falha quando só parte das chamadas respondeu (o resto vale). */
  erro?: unknown;
}

/** Lança só se nenhuma parte respondeu; quem chama segue sem nome. */
export type NormalizarNomes = (itens: ItemNome[], modelo: IdModeloIa) => Promise<RespostaNomes>;

export const SISTEMA_NOME = `Você recebe descrições de produtos de supermercado brasileiros copiadas de notas fiscais: abreviadas e muitas vezes cortadas no fim (DET=detergente, REFR=refrigerante, REQ=requeijão, SAB=sabonete, SAB PO=sabão em pó, CR D=creme dental, GE D=gel dental, TRAD=tradicional, DESN=desnatado, INTEG=integral, S G=sem gás, C G=com gás, BDJ=bandeja, S OSSO=sem osso, C PELE=com pele, ACG=açougue, KG=vendido por quilo, UN=unidade).
Para cada item devolva:
- nome: o nome por extenso em português, como numa prateleira ("Detergente Ypê Coco 500 ml"), com a grafia oficial da marca quando você a conhece. Não invente o que a descrição não diz; uma palavra cortada que você não reconhece fica de fora.
- tipo: o tipo do produto em uma ou duas palavras ("detergente", "creme dental", "cebola"), ou null.
- marca: só a marca ("Ypê", "Coca-Cola"), ou null se não houver (hortifruti, açougue, padaria da loja).
- variantes: o que diferencia o produto dentro da marca (sabor, zero, light, integral, sem gás, cor), sem repetir tipo, marca ou tamanho.
- tamanho: quantidade e unidade do conteúdo (g, kg, ml, L, un) quando a descrição diz, senão null.
- granel: true quando é vendido por peso ou unidade solta sem embalagem de marca (frutas, verduras, carnes no quilo).
Devolva um item por linha recebida, com i = número da linha.`;

const Tamanho = z.object({
  quantidade: z.number(),
  unidade: z.enum(['g', 'kg', 'ml', 'L', 'un']),
});

export const SaidaNome = z.object({
  itens: z.array(
    z.object({
      i: z.number().int(),
      nome: z.string(),
      tipo: z.string().nullable(),
      marca: z.string().nullable(),
      variantes: z.array(z.string()),
      tamanho: Tamanho.nullable(),
      granel: z.boolean(),
    }),
  ),
});

export type SaidaNome = z.infer<typeof SaidaNome>;

export function montarMensagemNomes(itens: readonly ItemNome[]): string {
  return itens.map((it) => `${it.i}. ${it.d}`).join('\n');
}

/** Descarta número desconhecido, repetido ou nome que não serve (vazio, sem letra, longo demais). */
export function traduzirNomes(itens: readonly ItemNome[], saida: SaidaNome): Map<number, NomeIa> {
  const conhecidos = new Set(itens.map((it) => it.i));
  const nomes = new Map<number, NomeIa>();
  for (const { i, nome, ...resto } of saida.itens) {
    const limpo = limparNomeProduto(nome);
    if (!conhecidos.has(i) || nomes.has(i) || !limpo) continue;
    nomes.set(i, { nome: limpo, ...resto });
  }
  return nomes;
}

export function interpretarMensagemNomes(
  itens: readonly ItemNome[],
  msg: MensagemIa<SaidaNome>,
  modelo: IdModeloIa = MODELO_IA_PADRAO,
): { nomes: Map<number, NomeIa>; custoUsd: number } {
  const custo = custoUsd(msg.usage, modelo);
  if (msg.stop_reason !== 'end_turn') throw new IaSemDecisaoError(`stop:${msg.stop_reason}`, custo);
  if (!msg.parsed_output) throw new IaSemDecisaoError('sem-json', custo);
  return { nomes: traduzirNomes(itens, msg.parsed_output), custoUsd: custo };
}

export function partes<T>(itens: readonly T[], tamanho = MAX_ITENS_POR_PARTE): T[][] {
  const saida: T[][] = [];
  for (let k = 0; k < itens.length; k += tamanho) saida.push(itens.slice(k, k + tamanho));
  return saida;
}

/**
 * Junta as partes respondidas; parte que falhou só fica sem nome. Sem nenhuma resposta,
 * relança a primeira falha (com o custo de quem recusou somado ao erro).
 */
export async function normalizarEmPartes(
  itens: readonly ItemNome[],
  chamar: (parte: ItemNome[]) => Promise<{ nomes: Map<number, NomeIa>; custoUsd: number }>,
): Promise<RespostaNomes> {
  const resposta: RespostaNomes = { nomes: new Map(), custoUsd: 0, chamadas: 0 };
  const lista = partes(itens);
  let respondeu = false;
  for (const onda of partes(lista, MAX_PARTES_EM_PARALELO)) {
    const resultados = await Promise.allSettled(onda.map(chamar));
    resposta.chamadas += onda.length;
    for (const r of resultados) {
      if (r.status === 'fulfilled') {
        respondeu = true;
        resposta.custoUsd += r.value.custoUsd;
        for (const [i, n] of r.value.nomes) resposta.nomes.set(i, n);
      } else {
        resposta.erro ??= r.reason;
        if (r.reason instanceof IaSemDecisaoError) resposta.custoUsd += r.reason.custoUsd;
      }
    }
  }
  if (!respondeu && resposta.erro) throw resposta.erro;
  return resposta;
}

export function criarNormalizador(apiKey: string): NormalizarNomes {
  const cliente = new Anthropic({ apiKey, timeout: IA_TIMEOUT_MS, maxRetries: 1 });
  return (itens, modelo) =>
    normalizarEmPartes(itens, async (parte) => {
      const msg = await cliente.beta.messages.parse({
        ...parametrosDoModelo(modelo),
        max_tokens: 8000,
        output_config: { effort: 'low', format: betaZodOutputFormat(SaidaNome) },
        system: SISTEMA_NOME,
        messages: [{ role: 'user', content: montarMensagemNomes(parte) }],
      });
      return interpretarMensagemNomes(parte, msg, modelo);
    });
}
