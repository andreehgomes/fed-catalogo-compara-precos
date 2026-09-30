import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { ComparacaoHistorico, comValores, sufixoDaBase } from './historico-pessoal';

let proximoId = 0;

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
          <cp-badge-preco [tipo]="v.tipo" [diferenca]="impactoAbs()" />
          <span class="item-detalhe">
            Última vez {{ v.valorAnterior | currency }}{{ sufixoValor() }} ({{
              v.referencia.emissao | date: 'dd/MM'
            }}
            · {{ v.referencia.mercado }})
            @if (v.tipo !== 'igual') {
              · {{ sinal() }}{{ diferencaAbs() | currency }}{{ sufixo() }} ({{ sinal()
              }}{{ percentualAbs() | number: '1.1-1' }} %)
            }
          </span>
        } @else if (comparacao().tipo === 'primeira-compra') {
          <span class="item-detalhe historico-neutro">
            <mat-icon aria-hidden="true">history</mat-icon>
            Primeira compra
          </span>
        } @else {
          <span class="item-detalhe historico-neutro">Unidade diferente da última compra</span>
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
              Menor preço que você já pagou:
              <strong>{{ v.menor | currency }}{{ sufixo() }}</strong>
              @if (v.menorNestaCompra) {
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

  protected readonly valores = computed(() => comValores(this.comparacao()));
  protected readonly compras = computed(() => {
    const c = this.comparacao();
    return c.tipo === 'primeira-compra' ? [] : c.compras;
  });
  protected readonly impactoAbs = computed(() => Math.abs(this.valores()?.impacto ?? 0));
  protected readonly diferencaAbs = computed(() => Math.abs(this.valores()?.diferenca ?? 0));
  protected readonly percentualAbs = computed(() => Math.abs(this.valores()?.percentual ?? 0));
  protected readonly sinal = computed(() => ((this.valores()?.diferenca ?? 0) > 0 ? '+' : '−'));
  protected readonly sufixo = computed(() => {
    const v = this.valores();
    return v ? sufixoDaBase(v) : '';
  });
  /** No preço da última vez, "/un" é implícito. */
  protected readonly sufixoValor = computed(() => (this.sufixo() === '/un' ? '' : this.sufixo()));
}
