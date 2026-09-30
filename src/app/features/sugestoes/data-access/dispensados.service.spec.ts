import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthStore, limparDispensados } from '../../../core/auth/auth.store';
import { DispensadosService } from './dispensados.service';

const HOJE = new Date('2026-09-29T15:00:00.000Z');

function montar(uidInicial: string | null = 'u1') {
  const uid = signal<string | null>(uidInicial);
  TestBed.configureTestingModule({ providers: [{ provide: AuthStore, useValue: { uid } }] });
  return { service: TestBed.inject(DispensadosService), uid };
}

describe('DispensadosService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('persiste entre instâncias', () => {
    const { service } = montar();
    service.marcarJaTenho('ean:1', HOJE);
    service.naoSugerir('ean:2');
    expect(service.jaTenho().get('ean:1')).toBe(HOJE.toISOString());
    expect(service.nunca().has('ean:2')).toBe(true);

    TestBed.resetTestingModule();
    const outra = montar().service;
    expect(outra.jaTenho().get('ean:1')).toBe(HOJE.toISOString());
    expect([...outra.nunca()]).toEqual(['ean:2']);

    outra.voltarASugerir('ean:2');
    outra.voltarASugerir('ean:1');
    expect(outra.dispensados()).toEqual({ jaTenho: new Map(), nunca: new Set() });
    expect(JSON.parse(localStorage.getItem('cp-sugestao-dispensados:u1')!)).toEqual({
      jaTenho: {},
      nunca: [],
    });
  });

  it('separa por uid e relê quando o usuário muda', () => {
    const { service, uid } = montar();
    service.naoSugerir('ean:1');
    uid.set('u2');
    expect(service.nunca().size).toBe(0);
    service.naoSugerir('ean:9');
    uid.set('u1');
    expect([...service.nunca()]).toEqual(['ean:1']);
    uid.set(null);
    expect(service.nunca().size).toBe(0);
    service.naoSugerir('ean:3');
    expect(localStorage.length).toBe(2);
  });

  it('registro gravado sem os campos vira vazio', () => {
    localStorage.setItem('cp-sugestao-dispensados:u1', '{}');
    expect(montar().service.dispensados()).toEqual({ jaTenho: new Map(), nunca: new Set() });
  });

  it('storage bloqueado: vale só na sessão', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { service } = montar();
    expect(service.nunca().size).toBe(0);
    service.naoSugerir('ean:1');
    expect(service.nunca().has('ean:1')).toBe(true);
  });

  it('limparDispensados apaga só as chaves da sugestão', () => {
    localStorage.setItem('cp-sugestao-dispensados:u1', '{}');
    localStorage.setItem('cp-sugestao-dispensados:u2', '{}');
    localStorage.setItem('cp-notas-abertas', '[]');
    limparDispensados();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('cp-notas-abertas')).toBe('[]');
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => limparDispensados()).not.toThrow();
  });
});
