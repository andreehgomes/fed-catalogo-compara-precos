import {
  MODELOS_IA,
  MODELO_IA_PADRAO,
  configIaDe,
  custoDoModelo,
  idModeloValido,
  modeloIa,
} from './modelos-ia';

describe('modelos de IA', () => {
  it('lista fechada: só Opus e Sonnet têm fallback; padrão é o Opus 5.5', () => {
    expect(MODELOS_IA.map((m) => [m.id, m.fallback])).toEqual([
      ['claude-opus-5-5', true],
      ['claude-sonnet-5-5', true],
      ['claude-haiku-5-5', false],
    ]);
    expect(MODELO_IA_PADRAO).toBe('claude-opus-5-5');
    expect(idModeloValido('claude-haiku-5-5')).toBe(true);
    expect(idModeloValido('gpt-5')).toBe(false);
    expect(modeloIa('qualquer').id).toBe('claude-opus-5-5');
  });

  it('config: campo inválido ou ausente vira o padrão naquele campo', () => {
    expect(configIaDe(null)).toEqual({
      modeloNome: 'claude-opus-5-5',
      modeloVinculo: 'claude-opus-5-5',
    });
    expect(configIaDe({ modeloNome: 'claude-haiku-5-5', modeloVinculo: 'x' })).toEqual({
      modeloNome: 'claude-haiku-5-5',
      modeloVinculo: 'claude-opus-5-5',
    });
  });

  it('custo pelo preço do modelo', () => {
    const uso = { input_tokens: 1_000_000, output_tokens: 100_000 };
    expect(custoDoModelo('claude-opus-5-5', uso)).toBeCloseTo(6);
    expect(custoDoModelo('claude-sonnet-5-5', uso)).toBeCloseTo(3);
    expect(custoDoModelo('claude-haiku-5-5', uso)).toBeCloseTo(0.15);
  });
});
