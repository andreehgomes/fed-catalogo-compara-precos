import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { FormField, debounce, form } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { normalizarGtin } from '@shared/index';
import type { Produto } from '@shared/model';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Scanner } from '../../../shared/ui/scanner/scanner';
import { ProdutosService } from '../data-access/produtos.service';

export const DEBOUNCE_MS = 400;

@Component({
  selector: 'cp-produtos-busca',
  imports: [CurrencyPipe, EmptyState, FormField, MatIconModule, RouterLink, Scanner],
  templateUrl: './produtos-busca.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProdutosBuscaPage {
  private readonly service = inject(ProdutosService);
  private readonly router = inject(Router);

  readonly q = input<string>();

  protected readonly lendo = signal(false);
  private readonly modelo = linkedSignal(() => ({ texto: this.q() ?? '' }));
  protected readonly form = form(this.modelo, (p) => debounce(p.texto, DEBOUNCE_MS));

  protected readonly consulta = computed(() => (this.q() ?? '').trim());
  protected readonly resultados = resource<Produto[], string | undefined>({
    params: () => this.consulta() || undefined,
    loader: ({ params }) => this.service.buscar(params),
  });
  protected readonly gtin = computed(() => normalizarGtin(this.consulta()));
  protected readonly linkRegiao = computed(() =>
    this.gtin() ? { gtin: this.gtin() } : { termo: this.consulta() },
  );

  constructor() {
    effect(() => {
      const texto = this.form.texto().value().trim();
      untracked(() => {
        if (texto !== this.consulta() && (texto.length >= 3 || !texto)) this.navegar(texto);
      });
    });
  }

  protected codigoLido(valor: string): void {
    this.lendo.set(false);
    this.modelo.set({ texto: valor });
    this.navegar(valor);
  }

  private navegar(texto: string): void {
    void this.router.navigate([], { queryParams: { q: texto || null }, replaceUrl: true });
  }
}
