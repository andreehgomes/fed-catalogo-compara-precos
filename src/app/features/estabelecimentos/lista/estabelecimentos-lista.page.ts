import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { semAcento } from '@shared/normalizar';
import type { Estabelecimento } from '@shared/model';
import type { DocumentSnapshot } from 'firebase/firestore';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { EstabelecimentosService } from '../data-access/estabelecimentos.service';

const normalizar = (s: string) => semAcento(s).toLowerCase();

@Component({
  selector: 'cp-estabelecimentos-lista',
  imports: [DatePipe, EmptyState, MatIconModule, RouterLink],
  template: `
    <main class="cp-page">
      <header class="cp-page-header">
        <div>
          <h1>Estabelecimentos</h1>
          <p>Mercados que apareceram nas notas importadas.</p>
        </div>
      </header>

      <section class="cp-block">
        <label class="cp-field">
          <span>Buscar por nome</span>
          <input type="search" autocomplete="off" [value]="filtro()" (input)="digitar($event)" />
        </label>
      </section>

      <section class="cp-block" aria-live="polite" [attr.aria-busy]="pagina.isLoading()">
        @if (pagina.isLoading() && !itens().length) {
          <div class="cp-loading" role="status" aria-label="Carregando"><div></div></div>
        } @else if (pagina.error()) {
          <cp-empty-state icone="cloud_off" titulo="Não foi possível carregar" />
        } @else if (visiveis().length) {
          <ul class="cp-list" aria-label="Estabelecimentos">
            @for (e of visiveis(); track e.cnpj) {
              <li>
                <a class="cp-list-row" [routerLink]="['/estabelecimentos', e.cnpj]">
                  <span class="item-principal">
                    <span class="item-nome">{{ e.fantasia || e.nome }}</span>
                    <span class="item-detalhe"
                      >{{ e.cidade }} · última nota em
                      {{ e.atualizadoEm | date: 'dd/MM/yyyy' }}</span
                    >
                  </span>
                  <mat-icon aria-hidden="true">chevron_right</mat-icon>
                </a>
              </li>
            }
          </ul>
          @if (temMais()) {
            <button
              type="button"
              class="cp-btn-secondary"
              [disabled]="carregando()"
              (click)="carregarMais()"
            >
              {{ carregando() ? 'Carregando…' : 'Carregar mais' }}
            </button>
          }
        } @else {
          <cp-empty-state
            icone="storefront"
            [titulo]="
              filtro() ? 'Nenhum estabelecimento com esse nome' : 'Nenhum estabelecimento ainda'
            "
            texto="Eles aparecem aqui quando alguém importa uma nota."
          />
        }
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EstabelecimentosListaPage {
  private readonly service = inject(EstabelecimentosService);

  protected readonly filtro = signal('');
  protected readonly pagina = resource({ loader: () => this.service.listar() });
  private readonly extras = signal<Estabelecimento[]>([]);
  private readonly cursor = signal<DocumentSnapshot | null | undefined>(undefined);
  private readonly _temMais = signal<boolean | undefined>(undefined);
  protected readonly carregando = signal(false);

  protected readonly itens = computed(() => [
    ...(this.pagina.hasValue() ? this.pagina.value().itens : []),
    ...this.extras(),
  ]);
  protected readonly visiveis = computed(() => {
    const f = normalizar(this.filtro().trim());
    return f
      ? this.itens().filter((e) => normalizar(`${e.fantasia ?? ''} ${e.nome}`).includes(f))
      : this.itens();
  });
  protected readonly temMais = computed(
    () => this._temMais() ?? (this.pagina.hasValue() && this.pagina.value().temMais),
  );

  protected digitar(evento: Event): void {
    this.filtro.set((evento.target as HTMLInputElement).value);
  }

  protected async carregarMais(): Promise<void> {
    if (this.carregando() || !this.pagina.hasValue()) return;
    this.carregando.set(true);
    try {
      const p = await this.service.listar(this.cursor() ?? this.pagina.value().cursor);
      this.extras.update((a) => [...a, ...p.itens]);
      this.cursor.set(p.cursor);
      this._temMais.set(p.temMais);
    } finally {
      this.carregando.set(false);
    }
  }
}
