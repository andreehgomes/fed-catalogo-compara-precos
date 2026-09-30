import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import { Sugestao } from '../sugestao';
import { FaixaPreco } from './faixa-preco';

const OCASIOES_NA_EXPANSAO = 5;
let proximoId = 0;

@Component({
  selector: 'cp-sugestao-item',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FaixaPreco,
    MatIconModule,
    MatMenuModule,
    RouterLink,
  ],
  template: `
    @let s = sugestao();
    <div class="sug">
      <input
        type="checkbox"
        class="sug-check"
        [id]="id + '-sel'"
        [checked]="selecionado()"
        (change)="alternar.emit()"
      />
      <div class="sug-corpo">
        <div class="sug-topo">
          <label class="cp-sr-only" [for]="id + '-sel'">{{ s.descricao }}</label>
          <a class="item-nome" [routerLink]="['/produtos', s.grupo]">{{ s.descricao }}</a>
          @if (s.estado === 'repor') {
            <span class="cp-status--aguardando">
              <mat-icon aria-hidden="true">schedule</mat-icon>
              Hora de repor
            </span>
          } @else if (s.estado === 'em-breve') {
            <span class="cp-chip">
              <mat-icon aria-hidden="true">event_repeat</mat-icon>
              Em breve
            </span>
          }
        </div>
        <p class="item-detalhe">
          Costuma comprar a cada {{ s.cicloDias | number: '1.0-0' }} dias · última vez há
          {{ s.diasDesdeUltima }} {{ s.diasDesdeUltima === 1 ? 'dia' : 'dias' }}
          @if (s.confianca === 'baixa') {
            · estimativa com {{ s.ocasioes.length }}
            {{ s.ocasioes.length === 1 ? 'compra' : 'compras' }}
          }
        </p>
        <label class="sug-qtd">
          <span>≈</span>
          <input
            type="number"
            inputmode="decimal"
            [attr.aria-label]="'Quantidade de ' + s.descricao + ' (' + s.quantidade.unidade + ')'"
            [min]="passo()"
            [step]="passo()"
            [value]="quantidade()"
            (change)="mudarQuantidade($event)"
          />
          <span>{{ s.quantidade.unidade }}</span>
        </label>
        <cp-faixa-preco [faixa]="s.faixa" />
        <button
          type="button"
          class="sug-expandir"
          [attr.aria-expanded]="aberto()"
          [attr.aria-controls]="id + '-porque'"
          (click)="aberto.set(!aberto())"
        >
          Por que esta sugestão?
          <mat-icon aria-hidden="true">{{ aberto() ? 'expand_less' : 'expand_more' }}</mat-icon>
        </button>
        <div class="sug-expansao" [id]="id + '-porque'" [hidden]="!aberto()">
          <ul [attr.aria-label]="'Últimas compras de ' + s.descricao">
            @for (c of ultimas(); track c.chave + '-' + c.n) {
              <li>
                <span>{{ c.emissao | date: 'dd/MM/yy' }} · {{ c.mercado }}</span>
                <span class="cp-price">
                  {{ c.qtd | number: '1.0-3' }} {{ c.unidade }} × {{ c.vlUnit | currency }}
                </span>
              </li>
            }
          </ul>
        </div>
      </div>
      <button
        type="button"
        class="cp-btn-icon"
        [matMenuTriggerFor]="acoes"
        [attr.aria-label]="'Ações de ' + s.descricao"
      >
        <mat-icon aria-hidden="true">more_vert</mat-icon>
      </button>
      <mat-menu #acoes="matMenu">
        <button mat-menu-item type="button" (click)="jaTenho.emit()">
          <mat-icon aria-hidden="true">check</mat-icon>
          <span>Já tenho</span><span class="cp-sr-only">: {{ s.descricao }}</span>
        </button>
        <button mat-menu-item type="button" (click)="naoSugerir.emit()">
          <mat-icon aria-hidden="true">visibility_off</mat-icon>
          <span>Não sugerir mais</span><span class="cp-sr-only">: {{ s.descricao }}</span>
        </button>
      </mat-menu>
    </div>
  `,
  styleUrl: './sugestao-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SugestaoItem {
  readonly sugestao = input.required<Sugestao>();
  readonly selecionado = input(false);
  readonly quantidade = model.required<number>();
  readonly alternar = output();
  readonly jaTenho = output();
  readonly naoSugerir = output();

  protected readonly id = `sugestao-${++proximoId}`;
  protected readonly aberto = signal(false);

  protected readonly passo = computed(() => {
    const u = this.sugestao().quantidade.unidade;
    return u === 'kg' || u === 'L' ? 0.1 : 1;
  });
  protected readonly ultimas = computed(() =>
    this.sugestao()
      .ocasioes.slice(-OCASIOES_NA_EXPANSAO)
      .reverse()
      .flatMap((o) => o.compras),
  );

  protected mudarQuantidade(e: Event): void {
    const n = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n > 0) this.quantidade.set(n);
  }
}
