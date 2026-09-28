import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormField, debounce, form } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { normalizarGtin } from '@shared/index';
import type { Produto } from '@shared/model';
import type { DocumentSnapshot } from 'firebase/firestore';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Scanner } from '../../../shared/ui/scanner/scanner';
import { ProdutosService } from '../data-access/produtos.service';

export const DEBOUNCE_MS = 400;

/** Página do catálogo: sobrevive à ida e volta para o detalhe do produto. */
@Injectable({ providedIn: 'root' })
export class CatalogoProdutosEstado {
  /** `cursores[i]` abre a página `i` (a primeira não tem cursor). */
  readonly cursores = signal<(DocumentSnapshot | null)[]>([null]);
  readonly pagina = signal(0);
}

@Component({
  selector: 'cp-produtos-busca',
  imports: [CurrencyPipe, EmptyState, FormField, MatIconModule, RouterLink, Scanner],
  templateUrl: './produtos-busca.page.html',
  styles: `
    .paginacao {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 8px;
      padding-top: 4px;

      button {
        min-width: 0;
        padding-inline: 10px;
        gap: 2px;
        white-space: nowrap;
      }

      button:last-child {
        justify-self: end;
      }

      span {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProdutosBuscaPage {
  private readonly service = inject(ProdutosService);
  private readonly router = inject(Router);
  private readonly estado = inject(CatalogoProdutosEstado);
  private readonly topoLista = viewChild<ElementRef<HTMLElement>>('topoLista');

  readonly q = input<string>();

  protected readonly lendo = signal(false);
  private readonly modelo = linkedSignal(() => ({ texto: this.q() ?? '' }));
  protected readonly form = form(this.modelo, (p) => debounce(p.texto, DEBOUNCE_MS));

  protected readonly consulta = computed(() => (this.q() ?? '').trim());
  protected readonly resultados = resource<Produto[], string | undefined>({
    params: () => this.consulta() || undefined,
    loader: ({ params }) => this.service.buscar(params),
  });
  protected readonly pagina = this.estado.pagina.asReadonly();
  protected readonly catalogo = resource({
    params: () =>
      this.consulta() ? undefined : { cursor: this.estado.cursores()[this.pagina()] ?? null },
    loader: ({ params }) => this.service.listar(params.cursor),
  });
  protected readonly lista = computed(() => (this.consulta() ? this.resultados : this.catalogo));
  protected readonly itens = computed<Produto[]>(() => {
    if (this.consulta()) return this.resultados.hasValue() ? this.resultados.value() : [];
    return this.catalogo.hasValue() ? this.catalogo.value().itens : [];
  });
  protected readonly temProxima = computed(
    () => !this.consulta() && this.catalogo.hasValue() && this.catalogo.value().temMais,
  );
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

  protected irPara(pagina: number): void {
    if (pagina > this.pagina()) {
      const cursor = this.catalogo.hasValue() ? this.catalogo.value().cursor : null;
      if (!cursor) return;
      this.estado.cursores.update((c) => [...c.slice(0, pagina), cursor]);
    }
    this.estado.pagina.set(Math.max(0, pagina));
    this.topoLista()?.nativeElement.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  private navegar(texto: string): void {
    void this.router.navigate([], { queryParams: { q: texto || null }, replaceUrl: true });
  }
}
