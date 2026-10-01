import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import {
  ComparacaoHistorico,
  JANELA_MELHOR_PRECO_DIAS,
  Tendencia,
  comValores,
  sufixoDaBase,
} from './historico-pessoal';

let proximoId = 0;

const ICONE_TENDENCIA: Record<Tendencia['tendencia'], string> = {
  subiu: 'trending_up',
  baixou: 'trending_down',
  igual: 'trending_flat',
};

@Component({
  selector: 'cp-historico-item',
  imports: [
    BadgePreco,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FontePrecoInfo,
    MatIconModule,
    RouterLink,
  ],
  template: `
    <div class="historico">
      <div class="historico-linha">
        @if (valores(); as v) {
          @if (v.tipo === 'acima') {
            <cp-badge-preco
              tipo="mais-caro"
              [rotulo]="(v.impacto | currency) + ' acima do seu melhor'"
            />
            <span class="item-detalhe">
              Seu melhor em {{ janela }} dias {{ v.melhor | currency }}{{ sufixoValor() }} ({{
                v.referencia.emissao | date: 'dd/MM'
              }}
              · {{ v.referencia.mercado }}) · +{{ v.diferenca | currency }}{{ sufixo() }} (+{{
                v.percentual | number: '1.1-1'
              }}
              %)
            </span>
          } @else if (v.novoMelhor) {
            <cp-badge-preco tipo="mais-barato" rotulo="Novo melhor preço" />
            <span class="item-detalhe">
              Antes {{ v.melhor | currency }}{{ sufixoValor() }} ({{
                v.referencia.emissao | date: 'dd/MM'
              }}
              · {{ v.referencia.mercado }})
            </span>
          } @else {
            <cp-badge-preco tipo="igual" rotulo="Seu melhor preço" />
            <span class="item-detalhe">
              Igual a {{ v.referencia.emissao | date: 'dd/MM' }} · {{ v.referencia.mercado }}
            </span>
          }
        } @else if (semRecente(); as u) {
          <span class="item-detalhe historico-neutro">
            <mat-icon aria-hidden="true">history</mat-icon>
            Última compra há mais de {{ janela }} dias: {{ u.vlUnit | currency }} ({{
              u.emissao | date: 'dd/MM/yy'
            }}
            · {{ u.mercado }})
          </span>
        } @else if (comparacao().tipo === 'primeira-compra') {
          <span class="item-detalhe historico-neutro">
            <mat-icon aria-hidden="true">history</mat-icon>
            Primeira compra
          </span>
        } @else {
          <span class="item-detalhe historico-neutro">Unidade diferente das compras recentes</span>
        }
        @if (compras().length) {
          <cp-fonte-preco fonte="minhas-notas" />
          <button
            type="button"
            class="historico-expandir"
            [attr.aria-expanded]="aberto()"
            [attr.aria-controls]="id"
            (click)="aberto.set(!aberto())"
          >
            {{ aberto() ? 'Ocultar compras' : 'Ver compras' }}
            <mat-icon aria-hidden="true">{{ aberto() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
        }
      </div>
      @if (tendencia(); as t) {
        <p class="item-detalhe historico-neutro historico-tendencia">
          <mat-icon aria-hidden="true">{{ ICONE_TENDENCIA[t.tendencia] }}</mat-icon>
          Última vez {{ t.valor | currency }}{{ sufixoValor() }} ({{
            t.compra.emissao | date: 'dd/MM'
          }}
          · {{ t.compra.mercado }}) ·
          @switch (t.tendencia) {
            @case ('subiu') {
              subiu {{ t.diferenca | currency }}{{ sufixo() }}
            }
            @case ('baixou') {
              baixou {{ -t.diferenca | currency }}{{ sufixo() }}
            }
            @default {
              mesmo preço
            }
          }
        </p>
      }
      @if (compras().length) {
        <div class="historico-expansao" [id]="id" [hidden]="!aberto()">
          <ul aria-label="Compras anteriores">
            @for (c of compras(); track c.chave + '-' + c.n) {
              <li>
                <span>{{ c.emissao | date: 'dd/MM/yy' }} · {{ c.mercado }}</span>
                <span class="cp-price">
                  {{ c.qtd | number: '1.0-3' }} {{ c.unidade }} × {{ c.vlUnit | currency }}
                </span>
              </li>
            }
          </ul>
          @if (valores(); as v) {
            <p>
              Menor preço nos últimos 12 meses:
              <strong>{{ v.menor | currency }}{{ sufixo() }}</strong>
              @if (v.valorAtual <= v.menor) {
                (nesta compra)
              }
            </p>
            <p>
              Média
              {{ v.vezes === 1 ? 'da compra anterior' : 'das ' + v.vezes + ' compras anteriores' }}:
              <strong>{{ v.media | currency }}{{ sufixo() }}</strong>
            </p>
          }
          <a [routerLink]="['/produtos', produtoId()]">Ver histórico completo</a>
        </div>
      }
    </div>
  `,
  styles: `
    @use '../../../shared/style/tokens' as *;

    .historico-linha {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
    }

    .historico-neutro {
      display: inline-flex;
      align-items: center;
      gap: 4px;

      mat-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
    }

    .historico-tendencia {
      margin: 2px 0 0;
    }

    .historico-expandir {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      min-height: 32px;
      padding: 2px 6px;
      border: none;
      border-radius: $cp-radius-sm;
      background: transparent;
      color: $cp-accent-ink;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;

      &:hover {
        background: $cp-accent-soft;
      }

      mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
    }

    .historico-expansao {
      margin-top: 6px;
      padding: 8px 10px;
      border-radius: $cp-radius-input;
      background: $cp-surface-subtle;
      font-size: 12.5px;
      color: $cp-text-secondary;

      ul {
        margin: 0 0 6px;
        padding: 0;
        list-style: none;
      }

      li {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 0;
      }

      p {
        margin: 0 0 6px;
      }

      a {
        color: $cp-accent-ink;
        font-weight: 600;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricoItem {
  readonly comparacao = input.required<ComparacaoHistorico>();
  readonly produtoId = input.required<string>();

  protected readonly id = `historico-${++proximoId}`;
  protected readonly aberto = signal(false);
  protected readonly janela = JANELA_MELHOR_PRECO_DIAS;
  protected readonly ICONE_TENDENCIA = ICONE_TENDENCIA;

  protected readonly valores = computed(() => comValores(this.comparacao()));
  protected readonly semRecente = computed(() => {
    const c = this.comparacao();
    return c.tipo === 'sem-recente' ? c.ultima : null;
  });
  protected readonly compras = computed(() => {
    const c = this.comparacao();
    return c.tipo === 'primeira-compra' ? [] : c.compras;
  });
  /** A última compra só aparece quando não é a própria referência do melhor preço. */
  protected readonly tendencia = computed(() => {
    const v = this.valores();
    const u = v?.ultima;
    return u && (u.compra.chave !== v.referencia.chave || u.compra.n !== v.referencia.n) ? u : null;
  });
  protected readonly sufixo = computed(() => {
    const v = this.valores();
    return v ? sufixoDaBase(v) : '';
  });
  /** No preço da última vez, "/un" é implícito. */
  protected readonly sufixoValor = computed(() => (this.sufixo() === '/un' ? '' : this.sufixo()));
}
