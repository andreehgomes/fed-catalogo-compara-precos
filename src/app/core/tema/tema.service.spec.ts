import { TestBed } from '@angular/core/testing';
import { temaFalso } from '../../../testing/tema';
import { ArmazenamentoTema, CHAVE_TEMA } from './tema-ambiente';
import { TemaService, aplicarTema } from './tema.service';

function metas(): HTMLMetaElement[] {
  return [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
}

function criarMetas(): void {
  for (const [tema, media] of [
    ['claro', '(prefers-color-scheme: light)'],
    ['escuro', '(prefers-color-scheme: dark)'],
  ]) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.dataset['tema'] = tema;
    meta.media = media;
    document.head.append(meta);
  }
}

function montar(fake = temaFalso()) {
  TestBed.configureTestingModule({ providers: fake.providers });
  const servico = TestBed.inject(TemaService);
  TestBed.tick();
  return { servico, ...fake };
}

describe('TemaService', () => {
  beforeEach(criarMetas);

  afterEach(() => {
    metas().forEach((m) => m.remove());
    delete document.documentElement.dataset['tema'];
  });

  it('sem preferência salva segue o sistema, sem data-tema e com as metas por media query', () => {
    const { servico, prefereEscuro } = montar();
    expect(servico.preferencia()).toBe('sistema');
    expect(servico.escuro()).toBe(false);
    expect(document.documentElement.dataset['tema']).toBeUndefined();
    expect(metas().map((m) => m.media)).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ]);
    prefereEscuro.set(true);
    expect(servico.escuro()).toBe(true);
  });

  it.each(['claro', 'escuro'] as const)('lê a preferência salva "%s" e a aplica', (salvo) => {
    const { servico, prefereEscuro } = montar(
      temaFalso({ salvo, sistemaEscuro: salvo === 'claro' }),
    );
    expect(servico.preferencia()).toBe(salvo);
    expect(servico.escuro()).toBe(salvo === 'escuro');
    prefereEscuro.set(salvo !== 'claro');
    expect(servico.escuro()).toBe(salvo === 'escuro');
    expect(document.documentElement.dataset['tema']).toBe(salvo);
    expect(metas().map((m) => m.media)).toEqual(
      salvo === 'claro' ? ['all', 'not all'] : ['not all', 'all'],
    );
  });

  it('valor desconhecido vira "sistema"', () => {
    const { servico } = montar(temaFalso({ salvo: 'roxo' }));
    expect(servico.preferencia()).toBe('sistema');
  });

  it('armazenamento que lança ou ausente: "sistema", e definir vale só na sessão', () => {
    const quebrado: ArmazenamentoTema = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    const { servico } = montar(temaFalso({}, quebrado));
    expect(servico.preferencia()).toBe('sistema');
    servico.definir('escuro');
    servico.definir('sistema');
    expect(servico.preferencia()).toBe('sistema');

    TestBed.resetTestingModule();
    const sem = montar(temaFalso({}, null)).servico;
    sem.definir('claro');
    expect(sem.escuro()).toBe(false);
  });

  it('definir grava, aplica e "sistema" remove a chave', () => {
    const { servico, armazenamento } = montar();
    servico.definir('escuro');
    TestBed.tick();
    expect(armazenamento.getItem(CHAVE_TEMA)).toBe('escuro');
    expect(document.documentElement.dataset['tema']).toBe('escuro');
    expect(servico.escuro()).toBe(true);

    servico.definir('sistema');
    TestBed.tick();
    expect(armazenamento.getItem(CHAVE_TEMA)).toBeNull();
    expect(document.documentElement.dataset['tema']).toBeUndefined();
    expect(metas().map((m) => m.media)).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ]);
  });

  it('aplicarTema ignora metas sem data-tema', () => {
    const avulsa = document.createElement('meta');
    avulsa.name = 'theme-color';
    avulsa.media = '(min-width: 1px)';
    document.head.append(avulsa);
    aplicarTema(document, 'escuro');
    expect(avulsa.media).toBe('(min-width: 1px)');
  });
});
