import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { BreakpointService } from './breakpoint.service';

export interface ItemNav {
  rota: string;
  icone: string;
  rotulo: string;
  exato?: boolean;
}

export const ITENS_NAV: readonly ItemNav[] = [
  { rota: '/', icone: 'space_dashboard', rotulo: 'Painel', exato: true },
  { rota: '/importar', icone: 'qr_code_scanner', rotulo: 'Importar nota' },
  { rota: '/notas', icone: 'receipt_long', rotulo: 'Minhas notas' },
  { rota: '/sugestoes', icone: 'event_repeat', rotulo: 'Sugestão de compra' },
  { rota: '/regiao', icone: 'near_me', rotulo: 'Preços perto de mim' },
  { rota: '/produtos', icone: 'inventory_2', rotulo: 'Produtos' },
  { rota: '/estabelecimentos', icone: 'storefront', rotulo: 'Estabelecimentos' },
];

@Component({
  selector: 'cp-shell',
  imports: [MatIconModule, MatTooltipModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'fecharComEsc()' },
})
export class Shell {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointService);

  private readonly botaoMenu = viewChild.required<ElementRef<HTMLButtonElement>>('botaoMenu');

  protected readonly itens = ITENS_NAV;
  protected readonly estreito = this.breakpoints.estreito;
  protected readonly expandido = signal(true);
  protected readonly drawerAberto = signal(false);

  protected readonly rail = computed(() => !this.estreito() && !this.expandido());
  protected readonly navAberta = computed(() =>
    this.estreito() ? this.drawerAberto() : this.expandido(),
  );
  protected readonly inicial = computed(() => {
    const u = this.auth.usuario();
    return (u?.displayName || u?.email || '?').trim().charAt(0).toUpperCase();
  });
  protected readonly nomeUsuario = computed(() => {
    const u = this.auth.usuario();
    return u?.displayName || u?.email || '';
  });

  private readonly url = signal(this.router.url);
  /** Some onde há ação fixa no rodapé: importação e sugestão de compra. */
  protected readonly mostrarFab = computed(
    () => this.estreito() && !/^\/(importar|sugestoes)(\/|\?|$)/.test(this.url()),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.drawerAberto.set(false);
        this.url.set(e.urlAfterRedirects);
      });
  }

  protected alternarNav(): void {
    if (this.estreito()) this.drawerAberto.update((v) => !v);
    else this.expandido.update((v) => !v);
  }

  protected fecharDrawer(): void {
    if (!this.drawerAberto()) return;
    this.drawerAberto.set(false);
    this.botaoMenu().nativeElement.focus();
  }

  protected fecharComEsc(): void {
    if (this.estreito()) this.fecharDrawer();
  }

  protected async sair(): Promise<void> {
    await this.auth.sair();
    await this.router.navigateByUrl('/login');
  }
}
