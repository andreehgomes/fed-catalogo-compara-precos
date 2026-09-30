import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ListasStore } from '../listas/data-access/listas.store';
import { itensDaSugestao } from '../listas/lista';
import { SugestoesStore } from './data-access/sugestoes.store';
import { HORIZONTES, Horizonte, VisaoSugestao, textoDaLista } from './sugestao';
import { ListaCompleta } from './ui/lista-completa';
import { PorMercado } from './ui/por-mercado';

const ROTULO_HORIZONTE: Record<Horizonte, string> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  quinzena: 'Próximos 15 dias',
  mes: 'Próximo mês',
};

const VISOES: readonly { valor: VisaoSugestao; rotulo: string }[] = [
  { valor: 'lista', rotulo: 'Lista completa' },
  { valor: 'mercado', rotulo: 'Por mercado' },
];

@Component({
  selector: 'cp-sugestoes',
  imports: [CurrencyPipe, EmptyState, ListaCompleta, MatIconModule, PorMercado, RouterLink],
  templateUrl: './sugestoes.page.html',
  styleUrl: './sugestoes.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SugestoesPage {
  protected readonly store = inject(SugestoesStore);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly listas = inject(ListasStore);

  readonly horizonte = input<string>();
  readonly visao = input<string>();

  protected readonly horizontes = HORIZONTES.map((valor) => ({
    valor,
    rotulo: ROTULO_HORIZONTE[valor],
  }));
  protected readonly visoes = VISOES;

  protected readonly horizonteAtual = computed<Horizonte>(() => {
    const h = this.horizonte();
    return HORIZONTES.includes(h as Horizonte) ? (h as Horizonte) : 'semana';
  });
  protected readonly visaoAtual = computed<VisaoSugestao>(() =>
    this.visao() === 'mercado' ? 'mercado' : 'lista',
  );
  protected readonly vazio = computed(
    () => !this.store.repor().length && !this.store.emBreve().length,
  );
  protected readonly rotuloVazio = computed(
    () =>
      ({
        hoje: 'hoje',
        semana: 'esta semana',
        quinzena: 'nos próximos 15 dias',
        mes: 'no próximo mês',
      })[this.horizonteAtual()],
  );
  protected readonly podeCompartilhar = typeof navigator.share === 'function';

  constructor() {
    effect(() => this.store.definirHorizonte(this.horizonteAtual()));
    this.store.recarregarNaLista();
  }

  /** RF-03: os selecionados, com a quantidade ajustada, viram uma lista nova. */
  protected criarLista(): void {
    if (this.listas.cheia()) return;
    const itens = itensDaSugestao(this.store.selecionados());
    const id = this.listas.criar(itens);
    this.store.recarregarNaLista();
    void this.router.navigate(['/listas', id]);
    const n = itens.length;
    this.snack.open(`Lista criada com ${n} ${n === 1 ? 'item' : 'itens'}`, 'OK', {
      duration: 4000,
    });
  }

  protected async adicionarALista(): Promise<void> {
    const id = await this.listas.adicionarEmLista(itensDaSugestao(this.store.selecionados()));
    if (id) this.store.recarregarNaLista();
  }

  protected escolherHorizonte(h: Horizonte): void {
    this.navegar({ horizonte: h === 'semana' ? null : h });
  }

  protected escolherVisao(v: VisaoSugestao): void {
    this.navegar({ visao: v === 'lista' ? null : v });
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.texto());
      this.snack.open('Lista copiada', 'OK', { duration: 2500 });
    } catch {
      this.snack.open('Não foi possível copiar.', 'OK', { duration: 3000 });
    }
  }

  protected async compartilhar(): Promise<void> {
    try {
      await navigator.share({ title: 'Lista de compras', text: this.texto() });
    } catch {
      /* compartilhamento cancelado */
    }
  }

  private texto(): string {
    return textoDaLista(this.visaoAtual(), this.store.selecionados());
  }

  private navegar(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
