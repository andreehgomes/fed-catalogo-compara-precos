import { describe, expect, it, vi } from 'vitest';
import type { NomeIa } from '@shared/nome-produto';
import {
  MAX_ITENS_POR_PARTE,
  SaidaNome,
  interpretarMensagemNomes,
  montarMensagemNomes,
  normalizarEmPartes,
  partes,
  traduzirNomes,
  type ItemNome,
} from '../src/nome/ia-nome';
import { IaSemDecisaoError } from '../src/vinculo/ia';

const ITENS: ItemNome[] = [
  { i: 1, d: 'Det Ype 500ml Coco' },
  { i: 2, d: 'FEIRA CEBOLA KG' },
];

const DETERGENTE = {
  i: 1,
  nome: 'Detergente Ypê Coco 500 ml',
  tipo: 'detergente',
  marca: 'Ypê',
  variantes: ['coco'],
  tamanho: { quantidade: 500, unidade: 'ml' as const },
  granel: false,
};
const CEBOLA = {
  i: 2,
  nome: 'Cebola',
  tipo: 'cebola',
  marca: null,
  variantes: [],
  tamanho: null,
  granel: true,
};

const uso = { input_tokens: 1000, output_tokens: 500 };

describe('mensagem e tradução', () => {
  it('uma linha por item, só número e descrição', () => {
    expect(montarMensagemNomes(ITENS)).toBe('1. Det Ype 500ml Coco\n2. FEIRA CEBOLA KG');
  });

  it('a saída valida pelo schema e vira o mapa por número', () => {
    const saida = SaidaNome.parse({ itens: [DETERGENTE, CEBOLA] });
    const nomes = traduzirNomes(ITENS, saida);
    expect(nomes.get(1)).toEqual({
      ...DETERGENTE,
      i: undefined,
      nome: 'Detergente Ypê Coco 500 ml',
    });
    expect(nomes.get(2)?.granel).toBe(true);
  });

  it('descarta número desconhecido, repetido e nome que não serve', () => {
    const nomes = traduzirNomes(ITENS, {
      itens: [
        DETERGENTE,
        { ...DETERGENTE, nome: 'Outro nome' },
        { ...CEBOLA, nome: '  ' },
        { ...CEBOLA, i: 9, nome: 'Fantasma' },
      ],
    });
    expect([...nomes.keys()]).toEqual([1]);
    expect(nomes.get(1)?.nome).toBe('Detergente Ypê Coco 500 ml');
  });

  it('interpreta end_turn; recusa e JSON ausente lançam com o custo', () => {
    const ok = interpretarMensagemNomes(ITENS, {
      stop_reason: 'end_turn',
      parsed_output: { itens: [CEBOLA] },
      usage: uso,
    });
    expect(ok.custoUsd).toBeCloseTo(0.014);
    expect(ok.nomes.get(2)?.nome).toBe('Cebola');

    const recusa = () =>
      interpretarMensagemNomes(ITENS, { stop_reason: 'refusal', parsed_output: null, usage: uso });
    expect(recusa).toThrow(IaSemDecisaoError);
    expect(recusa).toThrow('stop:refusal');
    expect(() =>
      interpretarMensagemNomes(ITENS, { stop_reason: 'end_turn', parsed_output: null, usage: uso }),
    ).toThrow('sem-json');
  });
});

describe('normalizarEmPartes', () => {
  const muitos = (n: number): ItemNome[] =>
    Array.from({ length: n }, (_, k) => ({ i: k + 1, d: `ITEM ${k + 1}` }));
  const nomeDe = (it: ItemNome): NomeIa => ({
    nome: `Item ${it.i}`,
    tipo: null,
    marca: null,
    variantes: [],
    tamanho: null,
    granel: false,
  });
  const responder = vi.fn(async (parte: ItemNome[]) => ({
    nomes: new Map(parte.map((it) => [it.i, nomeDe(it)])),
    custoUsd: 0.01,
  }));

  it('partes de 40, no máximo 3 em paralelo, tudo junto no fim', async () => {
    expect(partes(muitos(81)).map((p) => p.length)).toEqual([40, 40, 1]);
    let emVoo = 0;
    let pico = 0;
    const r = await normalizarEmPartes(muitos(4 * MAX_ITENS_POR_PARTE + 5), async (parte) => {
      pico = Math.max(pico, ++emVoo);
      await Promise.resolve();
      emVoo--;
      return responder(parte);
    });
    expect(pico).toBe(3);
    expect(r).toMatchObject({ chamadas: 5, custoUsd: 0.05 });
    expect(r.nomes.size).toBe(165);
    expect(r.erro).toBeUndefined();
  });

  it('parte que falha fica sem nome e o erro volta junto; a recusa soma o custo', async () => {
    const recusa = new IaSemDecisaoError('stop:refusal', 0.002);
    const r = await normalizarEmPartes(muitos(80), async (parte) => {
      if (parte[0].i === 1) throw recusa;
      return responder(parte);
    });
    expect(r.nomes.size).toBe(40);
    expect(r.nomes.has(1)).toBe(false);
    expect(r.erro).toBe(recusa);
    expect(r.custoUsd).toBeCloseTo(0.012);
  });

  it('nenhuma parte respondeu: lança a primeira falha; sem itens não chama', async () => {
    const erro = new Error('401');
    await expect(
      normalizarEmPartes(muitos(50), async () => {
        throw erro;
      }),
    ).rejects.toBe(erro);
    const chamar = vi.fn();
    expect(await normalizarEmPartes([], chamar)).toEqual({
      nomes: new Map(),
      custoUsd: 0,
      chamadas: 0,
    });
    expect(chamar).not.toHaveBeenCalled();
  });
});
