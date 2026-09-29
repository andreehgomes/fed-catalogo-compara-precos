import {
  MAX_CANDIDATOS_IA,
  compararEtiquetas,
  compararVariantes,
  decidirPorEtiquetas,
  etiquetar,
  tokensContidos,
  type Candidato,
} from './etiquetas';

describe('etiquetar', () => {
  it.each([
    ['Det Ype 500ml Coco', 'YPE|0.5L', ['COCO']],
    ['YPE COCO DETERGENTE 500ML', 'YPE|0.5L', ['COCO']],
    ['Cafe Itamaraty 500g', 'ITAMARATY|0.5kg', []],
    ['Leite Lider 1l Desn', 'LIDER|1L', ['DESNATADO']],
    ['LEITE LIDER 1L S DES', 'LIDER|1L', ['SEMIDESNATADO']],
    ['LEITE INTEGRAL LIDER 1 LT', 'LIDER|1L', ['INTEGRAL']],
    ['Cr d Close Up 130g', 'CLOSE UP|0.13kg', []],
    ['REFR COCA COLA ZERO 2L', 'COCA COLA|2L', ['ZERO']],
    ['Coca Cola 2l Zero', 'COCA COLA|2L', ['ZERO']],
    ['AGUA MIN STA INES 1 5L S G', 'SANTA INES|1.5L', ['SEMGAS']],
    ['OLEO DE SOJA COAMO 900ML', 'COAMO|0.9L', []],
    ['Pap Hig Duetto 12r p', null, []],
  ])('%s → %s %j', (descricao, bloco, variantes) => {
    const e = etiquetar(descricao);
    expect(e.bloco).toBe(bloco);
    expect(e.variantes).toEqual(variantes);
  });

  it('tipo, marca e tamanho separados', () => {
    expect(etiquetar('Cr d Close Up 130g')).toMatchObject({
      tipo: 'CREME DENTAL',
      marca: 'CLOSE UP',
      tamanho: '0.13kg',
    });
  });

  it('sem tamanho ou sem marca → bloco null; sem tipo ainda tem bloco', () => {
    expect(etiquetar('DETERGENTE YPE COCO').bloco).toBeNull();
    expect(etiquetar('BANANINHA 96G').bloco).toBeNull();
    expect(etiquetar('Coca Cola 2l Zero')).toMatchObject({ tipo: null, bloco: 'COCA COLA|2L' });
  });

  it('1,5 L sem vírgula não vira 5 L', () => {
    expect(etiquetar('REFR COCA COLA 1 5 L').tamanho).toBe('1.5L');
    expect(etiquetar('REFR COCA COLA 2 5L').tamanho).toBe('2.5L');
  });

  it('"DES" só é desodorante na primeira palavra', () => {
    expect(etiquetar('Des Rexona 50ml Form').tipo).toBe('DESODORANTE');
    expect(etiquetar('LEITE LIDER 1L S DES').variantes).toEqual(['SEMIDESNATADO']);
  });
});

describe('tokensContidos', () => {
  it('compara por prefixo de 3 letras ou mais', () => {
    expect(tokensContidos(['INTEG'], ['INTEGRAL'])).toBe(true);
    expect(tokensContidos(['AA'], ['AAA'])).toBe(false);
    expect(tokensContidos([], ['X'])).toBe(true);
  });
});

describe('compararVariantes', () => {
  const v = (d: string) => etiquetar(d).variantes;

  it('pares reais', () => {
    expect(compararVariantes(v('LEITE LIDER 1L INTEGRA'), v('LEITE LIDER 1L INTEG'))).toBe('igual');
    expect(compararVariantes(v('REFR COCA COLA 1L'), v('REFR COCA COLA ZERO 1L'))).toBe('duvida');
    expect(compararVariantes(v('DET YPE COCO 500ML'), v('DET YPE LIMAO 500ML'))).toBe('conflito');
  });

  it('tipos diferentes são conflito; tipo faltando de um lado não decide', () => {
    const e = (d: string) => etiquetar(d);
    expect(compararEtiquetas(e('Refr Coca Cola 2l Ze'), e('Coca Cola 2l Zero'))).toBe('igual');
    expect(compararEtiquetas(e('CREME LEITE LIDER 1L'), e('LEITE LIDER 1L'))).toBe('conflito');
  });

  it('os dois vazios são iguais; um lado contido no outro é dúvida', () => {
    expect(compararVariantes([], [])).toBe('igual');
    expect(compararVariantes(['TRIPLE'], ['MENTA', 'TRIPLE'])).toBe('duvida');
  });
});

describe('decidirPorEtiquetas', () => {
  const c = (id: string, variantes: string[]): Candidato => ({
    id,
    descricao: id,
    tipo: null,
    variantes,
  });
  const alvo = (variantes: string[]) => ({ tipo: null, variantes });

  it('sem candidatos → nenhum', () => {
    expect(decidirPorEtiquetas(alvo(['COCO']), [])).toEqual({ tipo: 'nenhum' });
  });

  it('um igual e nenhuma dúvida → ligar', () => {
    expect(decidirPorEtiquetas(alvo(['COCO']), [c('a', ['COCO']), c('b', ['LIMAO'])])).toEqual({
      tipo: 'ligar',
      id: 'a',
    });
  });

  it('só conflito → nenhum', () => {
    expect(decidirPorEtiquetas(alvo(['COCO']), [c('a', ['LIMAO']), c('b', ['LAVANDA'])])).toEqual({
      tipo: 'nenhum',
    });
  });

  it('igual com dúvida, vários iguais ou sem variante → IA, sem os conflitos', () => {
    expect(decidirPorEtiquetas(alvo(['COCO']), [c('a', ['COCO']), c('b', []), c('x', ['LIMAO'])]))
      .toEqual({ tipo: 'ia', candidatos: [c('a', ['COCO']), c('b', [])] });
    expect(decidirPorEtiquetas(alvo([]), [c('a', [])])).toEqual({ tipo: 'ia', candidatos: [c('a', [])] });
  });

  it('Coca Cola 2L Zero com e sem "REFR" liga pela regra', () => {
    const coca = etiquetar('Refr Coca Cola 2l Ze');
    const outra = etiquetar('Coca Cola 2l Zero');
    expect(
      decidirPorEtiquetas(coca, [{ id: 'b', descricao: 'Coca Cola 2l Zero', ...outra }]),
    ).toEqual({ tipo: 'ligar', id: 'b' });
  });

  it(`no máximo ${MAX_CANDIDATOS_IA} candidatos, os iguais primeiro`, () => {
    const candidatos = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => c(id, []));
    const d = decidirPorEtiquetas(alvo(['ZERO']), [...candidatos, c('z', ['ZERO'])]);
    expect(d.tipo).toBe('ia');
    if (d.tipo !== 'ia') return;
    expect(d.candidatos).toHaveLength(MAX_CANDIDATOS_IA);
    expect(d.candidatos[0].id).toBe('z');
  });
});
