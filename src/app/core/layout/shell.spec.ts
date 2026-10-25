import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { botao, texto } from '../../../testing/dom';
import { SwUpdateFalso, provideSwUpdateFalso } from '../../../testing/sw-update-falso';
import { temaFalso } from '../../../testing/tema';
import { AtualizacaoService } from '../atualizacao/atualizacao.service';
import { AuthStore } from '../auth/auth.store';
import { BreakpointService } from './breakpoint.service';
import { ITEM_CONFIG_IA, ITENS_NAV, Shell } from './shell';

@Component({ template: 'pagina' })
class Pagina {}

async function montar(
  estreito: boolean,
  admin = false,
  sw = new SwUpdateFalso(),
  tema = temaFalso(),
) {
  const recarregar = vi.fn();
  const bp = { estreito: signal(estreito) };
  const auth = {
    usuario: signal({ displayName: 'Ana Souza', email: 'ana@exemplo.com' }),
    sair: vi.fn(async () => undefined),
    admin: signal(admin),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: Pagina }]),
      { provide: BreakpointService, useValue: bp },
      { provide: AuthStore, useValue: auth },
      ...provideSwUpdateFalso(sw, recarregar),
      ...tema.providers,
    ],
  });
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(Shell);
  await router.navigateByUrl('/notas');
  fixture.detectChanges();
  await fixture.whenStable();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    router,
    auth,
    bp,
    sw,
    recarregar,
    tema,
  };
}

describe('Shell', () => {
  it('lista os itens de navegação da análise', async () => {
    const { el } = await montar(false);
    const rotulos = [...el.querySelectorAll('.cp-nav-label')].map((x) => texto(x));
    expect(rotulos).toEqual([
      ...ITENS_NAV.map((i) => i.rotulo),
      'Verificar atualizações',
      'Aparência',
      'Sair',
    ]);
    expect(texto(el.querySelector('.cp-header-avatar'))).toBe('A');
  });

  it('administrador vê "Configurações de IA" no fim do menu', async () => {
    const { el } = await montar(false, true);
    const rotulos = [...el.querySelectorAll('.cp-nav-label')].map((x) => texto(x));
    expect(rotulos).toEqual([
      ...ITENS_NAV.map((i) => i.rotulo),
      ITEM_CONFIG_IA.rotulo,
      'Verificar atualizações',
      'Aparência',
      'Sair',
    ]);
  });

  it('desktop: alterna entre expandido e rail, sem FAB', async () => {
    const { fixture, el } = await montar(false);
    const nav = el.querySelector('.cp-nav')!;
    expect(nav.classList).toContain('expandido');
    botao(el, 'Fechar menu').click();
    fixture.detectChanges();
    expect(nav.classList).toContain('rail');
    expect(el.querySelector('.cp-fab')).toBeNull();
    expect(nav.getAttribute('inert')).toBeNull();
  });

  it('estreito: drawer fechado e inerte, FAB "Importar nota" visível', async () => {
    const { el } = await montar(true);
    const nav = el.querySelector('.cp-nav')!;
    expect(nav.classList).not.toContain('expandido');
    expect(nav.getAttribute('inert')).toBe('');
    expect(el.querySelector('.cp-fab')?.getAttribute('aria-label')).toBe('Importar nota');
  });

  it('estreito: FAB some nas telas de importação (não cobre o "Confirmar importação")', async () => {
    const { fixture, el, router } = await montar(true);
    for (const url of [
      '/importar',
      '/importar/preview',
      '/importar?x=1',
      '/sugestoes?visao=mercado',
    ]) {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      expect(el.querySelector('.cp-fab')).toBeNull();
    }
    await router.navigateByUrl('/importacoes');
    fixture.detectChanges();
    expect(el.querySelector('.cp-fab')).not.toBeNull();
  });

  it('estreito: FAB some na lista e na conferência, mas fica em Minhas listas', async () => {
    const { fixture, el, router } = await montar(true);
    for (const url of ['/listas/abc', '/listas/abc/conferir?chave=1', '/listas/abc?x=1']) {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      expect(el.querySelector('.cp-fab')).toBeNull();
    }
    for (const url of ['/listas', '/listas?x=1']) {
      await router.navigateByUrl(url);
      fixture.detectChanges();
      expect(el.querySelector('.cp-fab')).not.toBeNull();
    }
  });

  it('estreito: o drawer fecha ao navegar', async () => {
    const { fixture, el, router } = await montar(true);
    botao(el, 'Abrir menu').click();
    fixture.detectChanges();
    expect(el.querySelector('.cp-nav')!.classList).toContain('expandido');
    expect(el.querySelector('.cp-scrim')!.classList).toContain('ativo');
    await router.navigateByUrl('/produtos');
    fixture.detectChanges();
    expect(el.querySelector('.cp-nav')!.classList).not.toContain('expandido');
  });

  it('estreito: Esc fecha o drawer e devolve o foco ao botão de menu', async () => {
    const { fixture, el } = await montar(true);
    const menu = botao(el, 'Abrir menu');
    menu.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('.cp-nav')!.classList).not.toContain('expandido');
    expect(document.activeElement).toBe(menu);
  });

  it('clique no scrim fecha o drawer', async () => {
    const { fixture, el } = await montar(true);
    botao(el, 'Abrir menu').click();
    fixture.detectChanges();
    (el.querySelector('.cp-scrim') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.cp-nav')!.classList).not.toContain('expandido');
  });

  it('sair desloga e vai para o login', async () => {
    const { el, auth, router } = await montar(false);
    const navegar = vi.spyOn(router, 'navigateByUrl');
    botao(el, /Sair$/).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(auth.sair).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith('/login');
  });
});

describe('Shell: aparência', () => {
  const opcoes = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];

  afterEach(() => {
    delete document.documentElement.dataset['tema'];
  });

  it('abre as três opções com a atual marcada', async () => {
    const { fixture, el } = await montar(false);
    botao(el, 'Aparência: Sistema').click();
    fixture.detectChanges();
    const rotulos = opcoes().map((o) => o.querySelector('.cp-menu-opcao')?.firstChild?.textContent);
    expect(rotulos.map((r) => r?.trim())).toEqual(['Sistema', 'Claro', 'Escuro']);
    expect(opcoes()[0].querySelector('.cp-menu-opcao mat-icon')).not.toBeNull();
    expect(opcoes()[1].querySelector('.cp-menu-opcao mat-icon')).toBeNull();
    expect(opcoes().map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('escolher "Escuro" aplica e guarda a preferência; o item mostra a escolha', async () => {
    const { fixture, el, tema } = await montar(false);
    botao(el, 'Aparência: Sistema').click();
    fixture.detectChanges();
    opcoes()[2].click();
    TestBed.tick();
    fixture.detectChanges();
    expect(tema.armazenamento.getItem('cp-tema')).toBe('escuro');
    expect(document.documentElement.dataset['tema']).toBe('escuro');
    expect(botao(el, 'Aparência: Escuro')).toBeTruthy();
  });

  it('a preferência salva já aparece marcada', async () => {
    const { fixture, el } = await montar(
      true,
      false,
      new SwUpdateFalso(),
      temaFalso({ salvo: 'claro' }),
    );
    botao(el, 'Aparência: Claro').click();
    fixture.detectChanges();
    expect(opcoes()[1].getAttribute('aria-checked')).toBe('true');
  });
});

describe('Shell: atualização do app', () => {
  const esperar = () => new Promise((r) => setTimeout(r));
  const snack = () => texto([...document.querySelectorAll('.mat-mdc-snack-bar-label')].at(-1));

  it('versão nova pronta: faixa "Nova versão disponível" com "Atualizar" ativa e recarrega', async () => {
    const { fixture, el, sw, recarregar } = await montar(true);
    TestBed.inject(AtualizacaoService).iniciar();
    expect(el.querySelector('.cp-atualizacao')).toBeNull();
    sw.versaoPronta();
    fixture.detectChanges();
    const faixa = el.querySelector('.cp-atualizacao')!;
    expect(faixa.getAttribute('role')).toBe('status');
    expect(texto(faixa)).toContain('Nova versão disponível.');
    botao(el, 'Atualizar').click();
    await esperar();
    expect(sw.activateUpdate).toHaveBeenCalled();
    expect(recarregar).toHaveBeenCalled();
  });

  it('estado irrecuperável: faixa pede "Recarregar"', async () => {
    const { fixture, el, sw, recarregar } = await montar(false);
    TestBed.inject(AtualizacaoService).iniciar();
    sw.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'hash' });
    fixture.detectChanges();
    expect(texto(el.querySelector('.cp-atualizacao'))).toContain('precisa ser recarregado');
    botao(el, 'Recarregar').click();
    await esperar();
    expect(sw.activateUpdate).not.toHaveBeenCalled();
    expect(recarregar).toHaveBeenCalled();
  });

  it('"Verificar atualizações" sem versão nova avisa que está na mais recente', async () => {
    const { fixture, el, sw } = await montar(false);
    botao(el, /Verificar atualizações$/).click();
    await esperar();
    fixture.detectChanges();
    expect(sw.checkForUpdate).toHaveBeenCalled();
    expect(snack()).toBe('Você já está na versão mais recente.');
    expect(el.querySelector('.cp-atualizacao')).toBeNull();
  });

  it('"Verificar atualizações" com versão nova fecha o drawer e mostra a faixa', async () => {
    const sw = new SwUpdateFalso();
    sw.checkForUpdate.mockResolvedValue(true);
    const { fixture, el } = await montar(true, false, sw);
    botao(el, 'Abrir menu').click();
    fixture.detectChanges();
    botao(el, /Verificar atualizações$/).click();
    await esperar();
    fixture.detectChanges();
    expect(el.querySelector('.cp-nav')!.classList).not.toContain('expandido');
    expect(texto(el.querySelector('.cp-atualizacao'))).toContain('Nova versão disponível.');
  });

  it('"Verificar atualizações" com falha ou sem service worker avisa', async () => {
    const sw = new SwUpdateFalso();
    sw.checkForUpdate.mockRejectedValue(new Error('offline'));
    const { fixture, el, recarregar } = await montar(false, false, sw);
    botao(el, /Verificar atualizações$/).click();
    await esperar();
    expect(snack()).toBe('Não foi possível verificar agora. Confira a conexão.');
    sw.isEnabled = false;
    botao(el, /Verificar atualizações$/).click();
    await esperar();
    fixture.detectChanges();
    expect(snack()).toBe('A atualização automática não está disponível aqui.');
    [...document.querySelectorAll<HTMLButtonElement>('.mat-mdc-snack-bar-action')].at(-1)!.click();
    await esperar();
    expect(recarregar).toHaveBeenCalled();
  });

  it('mostra a versão do build no rodapé do menu', async () => {
    const script = document.createElement('script');
    script.setAttribute('src', 'main-XYZ98765.js');
    script.type = 'text/plain';
    document.body.append(script);
    try {
      const { el } = await montar(false);
      expect(texto(el.querySelector('.cp-nav-footer-versao'))).toBe('Versão XYZ98765');
    } finally {
      script.remove();
    }
  });
});

describe('BreakpointService', () => {
  it('lê o matchMedia inicial e acompanha as mudanças', () => {
    let ouvinte: ((e: MediaQueryListEvent) => void) | null = null;
    const mql = {
      matches: true,
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => (ouvinte = cb),
      removeEventListener: () => undefined,
    };
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => mql as unknown as MediaQueryList);
    try {
      const s = TestBed.inject(BreakpointService);
      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 900px)');
      expect(s.estreito()).toBe(true);
      ouvinte!({ matches: false } as MediaQueryListEvent);
      expect(s.estreito()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });

  it('sem matchMedia, assume tela larga', () => {
    const original = window.matchMedia;
    (window as { matchMedia?: unknown }).matchMedia = undefined;
    try {
      expect(TestBed.inject(BreakpointService).estreito()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
