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
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Logo } from '../../shared/ui/logo/logo';
import { AtualizacaoService } from '../atualizacao/atualizacao.service';
import { AuthStore } from '../auth/auth.store';
import { PreferenciaTema } from '../tema/tema-ambiente';
import { TemaService } from '../tema/tema.service';
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
  { rota: '/listas', icone: 'checklist', rotulo: 'Lista de compras' },
  { rota: '/regiao', icone: 'near_me', rotulo: 'Preços perto de mim' },
  { rota: '/produtos', icone: 'inventory_2', rotulo: 'Produtos' },
  { rota: '/estabelecimentos', icone: 'storefront', rotulo: 'Estabelecimentos' },
];

export const OPCOES_TEMA: readonly { valor: PreferenciaTema; icone: string; rotulo: string }[] = [
  { valor: 'sistema', icone: 'brightness_auto', rotulo: 'Sistema' },
  { valor: 'claro', icone: 'light_mode', rotulo: 'Claro' },
  { valor: 'escuro', icone: 'dark_mode', rotulo: 'Escuro' },
];

/** Só para o administrador (`AuthStore.admin`). */
export const ITEM_CONFIG_IA: ItemNav = {
  rota: '/configuracoes/ia',
  icone: 'tune',
  rotulo: 'Configurações de IA',
};

@Component({
  selector: 'cp-shell',
  imports: [
    Logo,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'fecharComEsc()' },
})
export class Shell {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly breakpoints = inject(BreakpointService);
  private readonly atualizacao = inject(AtualizacaoService);
  private readonly snack = inject(MatSnackBar);
  private readonly tema = inject(TemaService);

  private readonly botaoMenu = viewChild.required<ElementRef<HTMLButtonElement>>('botaoMenu');

  protected readonly itens = computed(() =>
    this.auth.admin() ? [...ITENS_NAV, ITEM_CONFIG_IA] : ITENS_NAV,
  );
  protected readonly estreito = this.breakpoints.estreito;
  protected readonly avisoAtualizacao = this.atualizacao.aviso;
  protected readonly verificando = this.atualizacao.verificando;
  protected readonly versao = this.atualizacao.versao;
  protected readonly opcoesTema = OPCOES_TEMA;
  protected readonly preferenciaTema = this.tema.preferencia;
  protected readonly opcaoTema = computed(
    () => OPCOES_TEMA.find((o) => o.valor === this.preferenciaTema()) ?? OPCOES_TEMA[0],
  );
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
  /** Some onde há ação fixa no rodapé: importação, sugestão de compra, a lista e a conferência. */
  protected readonly mostrarFab = computed(
    () => this.estreito() && !/^\/(importar|sugestoes|listas\/[^/?]+)(\/|\?|$)/.test(this.url()),
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

  protected async verificarAtualizacoes(): Promise<void> {
    const resultado = await this.atualizacao.verificar();
    if (resultado === 'nova-versao') {
      this.drawerAberto.set(false);
    } else if (resultado === 'atualizado') {
      this.snack.open('Você já está na versão mais recente.', 'OK', { duration: 4000 });
    } else if (resultado === 'indisponivel') {
      this.snack
        .open('A atualização automática não está disponível aqui.', 'Recarregar', {
          duration: 6000,
        })
        .onAction()
        .subscribe(() => this.atualizacao.atualizar());
    } else {
      this.snack.open('Não foi possível verificar agora. Confira a conexão.', 'OK', {
        duration: 5000,
      });
    }
  }

  protected definirTema(preferencia: PreferenciaTema): void {
    this.tema.definir(preferencia);
  }

  protected atualizar(): Promise<void> {
    return this.atualizacao.atualizar();
  }

  protected async sair(): Promise<void> {
    await this.auth.sair();
    await this.router.navigateByUrl('/login');
  }
}
