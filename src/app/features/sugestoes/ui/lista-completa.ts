import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Sugestao, TotaisDaLista } from '../sugestao';
import { SugestaoItem } from './sugestao-item';

export interface QuantidadeEditada {
  grupo: string;
  valor: number;
}

@Component({
  selector: 'cp-lista-completa',
  imports: [CurrencyPipe, MatIconModule, SugestaoItem],
  template: `
    @for (secao of secoes(); track secao.id) {
      @if (secao.itens.length) {
        <section class="cp-block" [attr.aria-labelledby]="secao.id">
          <h2 class="cp-section-title" [id]="secao.id">{{ secao.titulo }}</h2>
          <ul class="cp-list">
            @for (s of secao.itens; track s.grupo) {
              <li class="cp-list-row">
                <cp-sugestao-item
                  [sugestao]="s"
                  [selecionado]="selecao().has(s.grupo)"
                  [naLista]="naLista().has(s.grupo)"
                  [quantidade]="quantidades().get(s.grupo) ?? s.quantidade.valor"
                  (quantidadeChange)="quantidade.emit({ grupo: s.grupo, valor: $event })"
                  (alternar)="alternar.emit(s.grupo)"
                  (jaTenho)="jaTenho.emit(s.grupo)"
                  (naoSugerir)="naoSugerir.emit(s.grupo)"
                />
              </li>
            }
          </ul>
        </section>
      }
    }

    @if (parou().length) {
      <section class="cp-block" aria-labelledby="sug-parou">
        <div class="cp-section-top">
          <h2 class="cp-section-title" id="sug-parou">Parou de comprar?</h2>
          <button
            type="button"
            class="cp-btn-ghost"
            aria-controls="sug-parou-lista"
            [attr.aria-expanded]="mostrarParou()"
            (click)="mostrarParou.set(!mostrarParou())"
          >
            {{ mostrarParou() ? 'Ocultar' : 'Ver ' + parou().length }}
          </button>
        </div>
        <ul class="cp-list" id="sug-parou-lista" [hidden]="!mostrarParou()">
          @for (s of parou(); track s.grupo) {
            <li class="cp-list-row">
              <span class="item-principal">
                <span class="item-nome">{{ s.descricao }}</span>
                <span class="item-detalhe">
                  Costumava comprar a cada {{ s.cicloDias }} dias · última vez há
                  {{ s.diasDesdeUltima }} dias
                </span>
              </span>
              <button
                type="button"
                class="cp-btn-ghost"
                [attr.aria-label]="'Não sugerir mais ' + s.descricao"
                (click)="naoSugerir.emit(s.grupo)"
              >
                Não sugerir mais
              </button>
            </li>
          }
        </ul>
      </section>
    }

    @if (ocultos().length) {
      <section class="cp-block" aria-labelledby="sug-ocultos">
        <div class="cp-section-top">
          <h2 class="cp-section-title" id="sug-ocultos">Itens ocultos</h2>
          <button
            type="button"
            class="cp-btn-ghost"
            aria-controls="sug-ocultos-lista"
            [attr.aria-expanded]="mostrarOcultos()"
            (click)="mostrarOcultos.set(!mostrarOcultos())"
          >
            {{ mostrarOcultos() ? 'Ocultar' : 'Ver ' + ocultos().length }}
          </button>
        </div>
        <ul class="cp-list" id="sug-ocultos-lista" [hidden]="!mostrarOcultos()">
          @for (o of ocultos(); track o.grupo) {
            <li class="cp-list-row">
              <span class="item-principal">
                <span class="item-nome">{{ o.descricao }}</span>
              </span>
              <button
                type="button"
                class="cp-btn-ghost"
                [attr.aria-label]="'Voltar a sugerir ' + o.descricao"
                (click)="voltarASugerir.emit(o.grupo)"
              >
                Voltar a sugerir
              </button>
            </li>
          }
        </ul>
      </section>
    }

    <section class="cp-summary" role="status" aria-label="Total estimado">
      <div>
        <span class="cp-summary-label">Como da última vez</span>
        <span class="cp-summary-value">{{ totais().comoDaUltimaVez | currency }}</span>
      </div>
      <div>
        <span class="cp-summary-label">No seu menor preço</span>
        <span class="cp-summary-value">{{ totais().noMenorPreco | currency }}</span>
      </div>
      <div>
        <span class="cp-summary-label">Seu melhor cenário</span>
        <span class="cp-summary-value">{{ totais().economia | currency }} a menos</span>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListaCompleta {
  readonly repor = input.required<Sugestao[]>();
  readonly emBreve = input.required<Sugestao[]>();
  readonly parou = input<Sugestao[]>([]);
  readonly ocultos = input<{ grupo: string; descricao: string }[]>([]);
  readonly selecao = input.required<ReadonlySet<string>>();
  readonly naLista = input<ReadonlySet<string>>(new Set());
  readonly quantidades = input.required<ReadonlyMap<string, number>>();
  readonly totais = input.required<TotaisDaLista>();

  readonly alternar = output<string>();
  readonly quantidade = output<QuantidadeEditada>();
  readonly jaTenho = output<string>();
  readonly naoSugerir = output<string>();
  readonly voltarASugerir = output<string>();

  protected readonly mostrarParou = signal(false);
  protected readonly mostrarOcultos = signal(false);

  protected readonly secoes = computed(() => [
    { id: 'sug-repor', titulo: 'Hora de repor', itens: this.repor() },
    { id: 'sug-em-breve', titulo: 'Em breve', itens: this.emBreve() },
  ]);
}
