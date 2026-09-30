import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WAKE_LOCK, WakeLockApi, manterTelaAcesa } from './tela-acesa';

@Component({ template: '' })
class Host {
  readonly ativo = signal(true);
  constructor() {
    manterTelaAcesa(this.ativo);
  }
}

function wakeLockFalso() {
  const travas: { release: ReturnType<typeof vi.fn> }[] = [];
  const pendentes: ((t: unknown) => void)[] = [];
  let adiar = false;
  const request = vi.fn(() => {
    const trava = { release: vi.fn(async () => undefined) };
    travas.push(trava);
    if (!adiar) return Promise.resolve(trava);
    return new Promise((resolve) => pendentes.push(() => resolve(trava)));
  });
  return {
    api: { request } as unknown as WakeLockApi,
    request,
    travas,
    adiar: (v: boolean) => (adiar = v),
    resolver: () => pendentes.shift()?.(undefined),
  };
}

function visibilidade(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: estado, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function montar(wake: WakeLockApi | null) {
  TestBed.configureTestingModule({ providers: [{ provide: WAKE_LOCK, useValue: wake }] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('manterTelaAcesa', () => {
  afterEach(() => visibilidade('visible'));

  it('pede com pendentes, solta ao zerar e pede de novo', async () => {
    const w = wakeLockFalso();
    const fixture = await montar(w.api);
    expect(w.request).toHaveBeenCalledWith('screen');
    fixture.componentInstance.ativo.set(false);
    await fixture.whenStable();
    expect(w.travas[0].release).toHaveBeenCalled();
    fixture.componentInstance.ativo.set(true);
    await fixture.whenStable();
    expect(w.request).toHaveBeenCalledTimes(2);
  });

  it('solta ao ocultar a aba, pede ao voltar e solta ao destruir', async () => {
    const w = wakeLockFalso();
    const fixture = await montar(w.api);
    visibilidade('hidden');
    await fixture.whenStable();
    expect(w.travas[0].release).toHaveBeenCalled();
    visibilidade('visible');
    await fixture.whenStable();
    expect(w.request).toHaveBeenCalledTimes(2);
    fixture.destroy();
    expect(w.travas[1].release).toHaveBeenCalled();
  });

  it('trava que chega depois de desligar é solta na hora; falha do pedido é ignorada', async () => {
    const w = wakeLockFalso();
    w.adiar(true);
    const fixture = await montar(w.api);
    fixture.componentInstance.ativo.set(false);
    await fixture.whenStable();
    w.resolver();
    await Promise.resolve();
    expect(w.travas[0].release).toHaveBeenCalled();

    w.request.mockImplementationOnce(() => Promise.reject(new Error('negado')));
    fixture.componentInstance.ativo.set(true);
    await fixture.whenStable();
    fixture.componentInstance.ativo.set(false);
    await fixture.whenStable();
    fixture.componentInstance.ativo.set(true);
    await fixture.whenStable();
    expect(w.request).toHaveBeenCalledTimes(3);
  });

  it('soltar que falha é ignorado', async () => {
    const w = wakeLockFalso();
    const fixture = await montar(w.api);
    w.travas[0].release.mockRejectedValueOnce(new Error('já solta'));
    fixture.componentInstance.ativo.set(false);
    await fixture.whenStable();
    w.adiar(true);
    fixture.componentInstance.ativo.set(true);
    await fixture.whenStable();
    fixture.componentInstance.ativo.set(false);
    await fixture.whenStable();
    w.travas[1].release.mockRejectedValueOnce(new Error('já solta'));
    w.resolver();
    await Promise.resolve();
    expect(w.travas[1].release).toHaveBeenCalled();
  });

  it('sem suporte, nada acontece', async () => {
    const fixture = await montar(null);
    fixture.componentInstance.ativo.set(false);
    await fixture.whenStable();
    fixture.destroy();
  });

  it('o token é null sem navigator.wakeLock', () => {
    expect(TestBed.inject(WAKE_LOCK)).toBeNull();
  });

  it('o token lê o navigator.wakeLock', () => {
    const api = { request: vi.fn() };
    Object.defineProperty(navigator, 'wakeLock', { value: api, configurable: true });
    try {
      expect(TestBed.inject(WAKE_LOCK)).toBe(api);
    } finally {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
    }
  });
});
