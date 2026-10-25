import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SwUpdateFalso, provideSwUpdateFalso } from '../../../testing/sw-update-falso';
import { RELOGIO } from '../relogio';
import {
  AtualizacaoService,
  INTERVALO_CHECAGEM_MS,
  TEMPO_LIMITE_VERIFICACAO_MS,
  versaoDoBuild,
} from './atualizacao.service';

function montar(sw = new SwUpdateFalso()) {
  const recarregar = vi.fn();
  let agora = new Date('2026-10-25T10:00:00');
  TestBed.configureTestingModule({
    providers: [
      ...provideSwUpdateFalso(sw, recarregar),
      { provide: RELOGIO, useValue: () => agora },
    ],
  });
  const servico = TestBed.inject(AtualizacaoService);
  const avancar = (ms: number) => (agora = new Date(agora.getTime() + ms));
  return { servico, sw, recarregar, avancar };
}

function voltarParaOApp(estado: DocumentVisibilityState = 'visible') {
  const doc = TestBed.inject(DOCUMENT);
  vi.spyOn(doc, 'visibilityState', 'get').mockReturnValue(estado);
  doc.dispatchEvent(new Event('visibilitychange'));
}

const esperar = () => new Promise((r) => setTimeout(r));

describe('AtualizacaoService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ao iniciar procura versão nova e mostra o aviso quando ela fica pronta', async () => {
    const { servico, sw } = montar();
    servico.iniciar();
    servico.iniciar();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(servico.aviso()).toBeNull();
    sw.versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'nova' } });
    expect(servico.aviso()).toBeNull();
    sw.versaoPronta();
    expect(servico.aviso()).toBe('nova-versao');
  });

  it('checagem que já encontra a versão nova mostra o aviso', async () => {
    const sw = new SwUpdateFalso();
    sw.checkForUpdate.mockResolvedValue(true);
    const { servico } = montar(sw);
    servico.iniciar();
    await esperar();
    expect(servico.aviso()).toBe('nova-versao');
  });

  it('volta a checar quando o app fica visível, no máximo uma vez por minuto', async () => {
    const { servico, sw, avancar } = montar();
    servico.iniciar();
    await esperar();
    avancar(INTERVALO_CHECAGEM_MS - 1);
    voltarParaOApp();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    avancar(1);
    voltarParaOApp('hidden');
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    voltarParaOApp();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('falha na checagem automática é silenciosa', async () => {
    const sw = new SwUpdateFalso();
    sw.checkForUpdate.mockRejectedValue(new Error('offline'));
    const { servico } = montar(sw);
    servico.iniciar();
    await esperar();
    expect(servico.aviso()).toBeNull();
  });

  it('sem service worker não escuta nada e "verificar" responde indisponível', async () => {
    const sw = new SwUpdateFalso();
    sw.isEnabled = false;
    const { servico, recarregar } = montar(sw);
    servico.iniciar();
    expect(sw.checkForUpdate).not.toHaveBeenCalled();
    expect(await servico.verificar()).toBe('indisponivel');
    await servico.atualizar();
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(recarregar).toHaveBeenCalled();
  });

  it('verificar: atualizado, nova versão ou erro', async () => {
    const { servico, sw } = montar();
    expect(await servico.verificar()).toBe('atualizado');
    sw.checkForUpdate.mockRejectedValueOnce(new Error('offline'));
    expect(await servico.verificar()).toBe('erro');
    sw.checkForUpdate.mockResolvedValueOnce(true);
    const pendente = servico.verificar();
    expect(servico.verificando()).toBe(true);
    expect(await pendente).toBe('nova-versao');
    expect(servico.verificando()).toBe(false);
    expect(servico.aviso()).toBe('nova-versao');
    expect(await servico.verificar()).toBe('nova-versao');
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(3);
  });

  it('verificar desiste quando o service worker não responde', async () => {
    vi.useFakeTimers();
    try {
      const { servico, sw } = montar();
      sw.checkForUpdate.mockReturnValue(new Promise(() => undefined));
      const pendente = servico.verificar();
      await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_VERIFICACAO_MS);
      expect(await pendente).toBe('erro');
      expect(servico.verificando()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('atualizar ativa a versão nova e recarrega, mesmo se a ativação falhar', async () => {
    const { servico, sw, recarregar } = montar();
    servico.iniciar();
    sw.versaoPronta();
    await servico.atualizar();
    expect(sw.activateUpdate).toHaveBeenCalledTimes(1);
    expect(recarregar).toHaveBeenCalledTimes(1);
    sw.activateUpdate.mockRejectedValueOnce(new Error('falhou'));
    await servico.atualizar();
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it('estado irrecuperável pede recarregar sem ativar versão', async () => {
    const { servico, sw, recarregar } = montar();
    servico.iniciar();
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'hash' });
    sw.versaoPronta();
    expect(servico.aviso()).toBe('irrecuperavel');
    voltarParaOApp();
    expect(sw.checkForUpdate).toHaveBeenCalledTimes(1);
    await servico.atualizar();
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(recarregar).toHaveBeenCalled();
  });
});

describe('versaoDoBuild', () => {
  it('lê o hash do main-*.js', () => {
    const doc = document.implementation.createHTMLDocument();
    expect(versaoDoBuild(doc)).toBeNull();
    const s = doc.createElement('script');
    s.setAttribute('src', 'main-ABCD1234.js');
    doc.body.append(s);
    expect(versaoDoBuild(doc)).toBe('ABCD1234');
  });
});
