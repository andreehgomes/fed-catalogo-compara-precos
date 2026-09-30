import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { botao, texto } from '../../../testing/dom';
import { AuthStore } from '../auth/auth.store';
import { BreakpointService } from './breakpoint.service';
import { ITENS_NAV, Shell } from './shell';

@Component({ template: 'pagina' })
class Pagina {}

async function montar(estreito: boolean) {
  const bp = { estreito: signal(estreito) };
  const auth = {
    usuario: signal({ displayName: 'Ana Souza', email: 'ana@exemplo.com' }),
    sair: vi.fn(async () => undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: Pagina }]),
      { provide: BreakpointService, useValue: bp },
      { provide: AuthStore, useValue: auth },
    ],
  });
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(Shell);
  await router.navigateByUrl('/notas');
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, router, auth, bp };
}

describe('Shell', () => {
  it('lista os itens de navegação da análise', async () => {
    const { el } = await montar(false);
    const rotulos = [...el.querySelectorAll('.cp-nav-label')].map((x) => texto(x));
    expect(rotulos).toEqual([...ITENS_NAV.map((i) => i.rotulo), 'Sair']);
    expect(texto(el.querySelector('.cp-header-avatar'))).toBe('A');
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
