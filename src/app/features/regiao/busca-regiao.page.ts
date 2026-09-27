import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { FormField, debounce, form } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { normalizarGtin } from '@shared/index';
import { CurrencyPipe } from '@angular/common';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Scanner } from '../../shared/ui/scanner/scanner';
import { Visivel } from '../../shared/ui/visivel/visivel';
import { LocalizacaoSeletor } from './localizacao/localizacao-seletor';
import { LocalizacaoStore } from './localizacao/localizacao.store';
import { Busca, RegiaoStore } from './regiao.store';
import { ResultadoGtin } from './resultado-gtin/resultado-gtin';
import { OfertaRow } from './ui/oferta-row';

export const DEBOUNCE_MS = 400;
const MINIMO_TERMO = 3;

@Component({
  selector: 'cp-busca-regiao',
  imports: [
    CurrencyPipe,
    EmptyState,
    FormField,
    LocalizacaoSeletor,
    MatIconModule,
    OfertaRow,
    ResultadoGtin,
    Scanner,
    Visivel,
  ],
  templateUrl: './busca-regiao.page.html',
  styleUrl: './busca-regiao.page.scss',
  providers: [RegiaoStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class BuscaRegiaoPage {
  private readonly router = inject(Router);
  protected readonly store = inject(RegiaoStore);
  protected readonly loc = inject(LocalizacaoStore);

  readonly gtin = input<string>();
  readonly termo = input<string>();
  readonly categoria = input<string>();

  protected readonly lendoCodigo = signal(false);
  protected readonly alterandoLocal = signal(false);

  private readonly busca = computed<Busca | null>(() => {
    const g = normalizarGtin(this.gtin());
    if (g) return { tipo: 'gtin', valor: g };
    const t = this.termo()?.trim();
    if (!t) return null;
    const c = Number(this.categoria());
    return { tipo: 'termo', valor: t, categoria: Number.isInteger(c) && c > 0 ? c : null };
  });

  private readonly modelo = linkedSignal(() => ({ texto: this.gtin() ?? this.termo() ?? '' }));
  protected readonly form = form(this.modelo, (p) => debounce(p.texto, DEBOUNCE_MS));

  protected readonly categoriaAtiva = computed(() => {
    const b = this.busca();
    return b?.tipo === 'termo' ? b.categoria : null;
  });
  protected readonly porGtin = computed(() => this.busca()?.tipo === 'gtin');

  constructor() {
    effect(() => {
      const busca = this.busca();
      untracked(() => this.store.buscar(busca));
    });
    effect(() => {
      const texto = this.form.texto().value();
      untracked(() => this.aplicarTexto(texto));
    });
  }

  protected codigoLido(valor: string): void {
    this.lendoCodigo.set(false);
    this.modelo.set({ texto: valor });
    this.aplicarTexto(valor);
  }

  protected filtrarCategoria(id: number | null): void {
    void this.router.navigate([], {
      queryParams: { categoria: id ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private aplicarTexto(bruto: string): void {
    const texto = bruto.trim();
    const gtin = /^[\d\s-]+$/.test(texto) ? normalizarGtin(texto) : null;
    const atual = this.busca();
    if (gtin) {
      if (atual?.tipo === 'gtin' && atual.valor === gtin) return;
      this.navegar({ gtin, termo: null, categoria: null });
    } else if (texto.length >= MINIMO_TERMO) {
      if (atual?.tipo === 'termo' && atual.valor === texto) return;
      this.navegar({ termo: texto, gtin: null, categoria: null });
    } else if (!texto && atual) {
      this.navegar({ termo: null, gtin: null, categoria: null });
    }
  }

  private navegar(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
