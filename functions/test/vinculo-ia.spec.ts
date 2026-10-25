import { APIConnectionError, APIConnectionTimeoutError, APIError } from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  IaSemDecisaoError,
  SISTEMA_IA,
  custoUsd,
  erroIa,
  interpretarMensagem,
  montarMensagem,
  traduzirDecisoes,
  type ItemIa,
} from '../src/vinculo/ia';

const COCA = 'loc:11111111000111:10';
const COCA_ZERO = 'loc:22222222000122:20';
const CAFE_TRAD = 'loc:11111111000111:30';
const CAFE_EXTRA = 'loc:22222222000122:40';

const ITENS: ItemIa[] = [
  {
    i: 1,
    d: 'REFR COCA COLA 2L',
    c: [
      { id: COCA, d: 'REFR COCA COLA 2L PET' },
      { id: COCA_ZERO, d: 'REFR COCA COLA ZERO 2L' },
    ],
  },
  {
    i: 2,
    d: 'CAFE ITAMARATY 500G',
    c: [
      { id: CAFE_TRAD, d: 'CAFE ITAMARATY TRAD 500G' },
      { id: CAFE_EXTRA, d: 'CAFE ITAMARATY EXTRA FORTE 500G' },
    ],
  },
];

describe('cliente da IA do vínculo', () => {
  it('monta uma linha por item e por candidato, com ids curtos e sem id real', () => {
    const msg = montarMensagem(ITENS);
    expect(msg).toBe(
      [
        '1. REFR COCA COLA 2L',
        '  c1: REFR COCA COLA 2L PET',
        '  c2: REFR COCA COLA ZERO 2L',
        '2. CAFE ITAMARATY 500G',
        '  c1: CAFE ITAMARATY TRAD 500G',
        '  c2: CAFE ITAMARATY EXTRA FORTE 500G',
      ].join('\n'),
    );
    expect(msg).not.toMatch(/loc:|\d{14}/);
    expect(SISTEMA_IA).not.toMatch(/\$\{/);
  });

  it('traduz c{k} para o id real; N e A passam; desconhecido e repetido são descartados', () => {
    expect(
      traduzirDecisoes(ITENS, {
        decisoes: [
          { i: 1, r: 'c1' },
          { i: 2, r: 'A' },
          { i: 1, r: 'c2' },
          { i: 3, r: 'c1' },
        ],
      }),
    ).toEqual([
      { i: 1, r: COCA },
      { i: 2, r: 'A' },
    ]);
    expect(
      traduzirDecisoes(ITENS, {
        decisoes: [
          { i: 1, r: 'c9' },
          { i: 2, r: 'n' },
        ],
      }),
    ).toEqual([{ i: 2, r: 'N' }]);
  });

  it('custo pelo preço do Opus 5.5 ($4 entrada, $20 saída por milhão)', () => {
    expect(custoUsd({ input_tokens: 1000, output_tokens: 500 })).toBeCloseTo(0.014, 10);
  });

  it('resposta completa vira decisões com o custo', () => {
    const r = interpretarMensagem(ITENS, {
      stop_reason: 'end_turn',
      parsed_output: {
        decisoes: [
          { i: 1, r: 'c2' },
          { i: 2, r: 'A' },
        ],
      },
      usage: { input_tokens: 500, output_tokens: 100 },
    });
    expect(r).toEqual({
      decisoes: [
        { i: 1, r: COCA_ZERO },
        { i: 2, r: 'A' },
      ],
      custoUsd: (500 * 4 + 100 * 20) / 1e6,
    });
  });

  it('recusa, corte ou JSON inválido lançam IaSemDecisaoError com o custo', () => {
    const uso = { input_tokens: 1000, output_tokens: 0 };
    for (const msg of [
      { stop_reason: 'refusal', parsed_output: null, usage: uso },
      { stop_reason: 'max_tokens', parsed_output: null, usage: uso },
      { stop_reason: 'end_turn', parsed_output: null, usage: uso },
    ]) {
      let erro: unknown;
      try {
        interpretarMensagem(ITENS, msg);
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(IaSemDecisaoError);
      expect((erro as IaSemDecisaoError).custoUsd).toBeCloseTo(0.004, 10);
    }
  });
});

describe('erroIa', () => {
  const corpo = (type: string) => ({
    type: 'error',
    error: { type, message: 'texto livre da API' },
  });

  it('status e tipo da API; rede e timeout; sem decisão; resto genérico', () => {
    expect(
      erroIa(APIError.generate(401, corpo('authentication_error'), undefined, new Headers())),
    ).toEqual({
      erro: 'ia-401',
      tipo: 'authentication_error',
    });
    expect(
      erroIa(APIError.generate(529, corpo('overloaded_error'), undefined, new Headers())),
    ).toEqual({
      erro: 'ia-529',
      tipo: 'overloaded_error',
    });
    expect(erroIa(new APIConnectionTimeoutError())).toEqual({ erro: 'ia-timeout' });
    expect(erroIa(new APIConnectionError({ message: 'x' }))).toEqual({ erro: 'ia-conexao' });
    expect(erroIa(new IaSemDecisaoError('stop:refusal', 0.01))).toEqual({
      erro: 'ia-stop:refusal',
    });
    expect(erroIa(new Error('qualquer'))).toEqual({ erro: 'ia-erro' });
  });
});
