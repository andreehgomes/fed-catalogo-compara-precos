import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ARMAZENAMENTO_TEMA, CONSULTA_ESCURO, PREFERE_ESCURO } from './tema-ambiente';

function comJanela(janela: object) {
  TestBed.configureTestingModule({
    providers: [{ provide: DOCUMENT, useValue: { defaultView: janela } }],
  });
}

describe('tema-ambiente', () => {
  it('ARMAZENAMENTO_TEMA usa o localStorage da janela', () => {
    const localStorage = { getItem: () => null };
    comJanela({ localStorage });
    expect(TestBed.inject(ARMAZENAMENTO_TEMA)).toBe(localStorage);
  });

  it('ARMAZENAMENTO_TEMA é null quando o acesso ao localStorage lança ou não há janela', () => {
    comJanela(
      Object.defineProperty({}, 'localStorage', {
        get: () => {
          throw new Error('SecurityError');
        },
      }),
    );
    expect(TestBed.inject(ARMAZENAMENTO_TEMA)).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: {} }] });
    expect(TestBed.inject(ARMAZENAMENTO_TEMA)).toBeNull();
  });

  it('PREFERE_ESCURO acompanha o prefers-color-scheme ao vivo', () => {
    const mql = new EventTarget() as EventTarget & { matches: boolean };
    mql.matches = true;
    const matchMedia = vi.fn(() => mql);
    comJanela({ matchMedia });
    const escuro = TestBed.inject(PREFERE_ESCURO);
    expect(matchMedia).toHaveBeenCalledWith(CONSULTA_ESCURO);
    expect(escuro()).toBe(true);
    mql.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(escuro()).toBe(false);
  });

  it('PREFERE_ESCURO é false sem matchMedia', () => {
    comJanela({});
    expect(TestBed.inject(PREFERE_ESCURO)()).toBe(false);
  });
});
