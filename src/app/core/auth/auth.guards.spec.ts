import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { authGuard, guestGuard } from './auth.guards';
import { AuthStore } from './auth.store';

function montar() {
  const usuario = signal<{ uid: string } | null | undefined>(undefined);
  const fake = {
    usuario,
    pronto: computed(() => usuario() !== undefined),
    logado: computed(() => !!usuario()),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthStore, useValue: fake }],
  });
  return usuario;
}

function rodar(guard: typeof authGuard, url = '/notas') {
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as Observable<boolean | UrlTree>;
}

describe('guards', () => {
  it('authGuard espera o SDK resolver antes de decidir (sem piscar o login)', async () => {
    const usuario = montar();
    let decidido: boolean | UrlTree | undefined;
    rodar(authGuard).subscribe((r) => (decidido = r));
    TestBed.tick();
    expect(decidido).toBeUndefined();
    usuario.set({ uid: 'u1' });
    TestBed.tick();
    expect(decidido).toBe(true);
  });

  it('authGuard manda para o login guardando a URL quando deslogado', async () => {
    const usuario = montar();
    usuario.set(null);
    const r = (await firstValueFrom(rodar(authGuard, '/notas/123'))) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/login?voltar=%2Fnotas%2F123');
  });

  it('guestGuard libera deslogado e manda logado para o painel', async () => {
    const usuario = montar();
    usuario.set(null);
    expect(await firstValueFrom(rodar(guestGuard))).toBe(true);
    usuario.set({ uid: 'u1' });
    const r = (await firstValueFrom(rodar(guestGuard))) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/');
  });
});
