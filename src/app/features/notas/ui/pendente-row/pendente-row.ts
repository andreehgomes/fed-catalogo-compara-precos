import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { extrairChave, formatarChave, formatarCnpj } from '@shared/chave-acesso';
import type { Pendente } from '@shared/model';
import { MENSAGENS } from '../../../importar/mensagens';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const MODELOS: Readonly<Record<string, string>> = { '65': 'NFC-e (65)', '55': 'NF-e (55)' };

const TIPOS_EMISSAO: Readonly<Record<string, string>> = {
  '1': 'Normal',
  '9': 'Contingência off-line',
};

export function mesDaChave(chave: string): string {
  const { anoMes } = extrairChave(chave);
  return `${MESES[Number(anoMes.slice(2, 4)) - 1] ?? '?'}/20${anoMes.slice(0, 2)}`;
}

@Component({
  selector: 'cp-pendente-row',
  imports: [DatePipe, MatIconModule],
  template: `
    <div class="item-principal">
      <span class="item-nome">NFC-e nº {{ numero() }} · CNPJ {{ cnpj() }}</span>
      <span class="item-detalhe">Nota de {{ mes() }}</span>
      @if (pendente().status === 'aguardando') {
        <span class="cp-status--aguardando">
          <mat-icon aria-hidden="true">schedule</mat-icon>
          Próxima tentativa às {{ pendente().proximaTentativa | date: 'HH:mm' }}
        </span>
      } @else {
        <span class="cp-status--falhou">
          <mat-icon aria-hidden="true">error</mat-icon>
          Não foi possível importar
        </span>
      }

      <details class="pendente-detalhes">
        <summary>Detalhes da nota</summary>
        <dl>
          <div class="pendente-chave">
            <dt>Chave de acesso</dt>
            <dd>
              <code>{{ chaveFormatada() }}</code>
              <button
                type="button"
                class="cp-btn-icon"
                aria-label="Copiar chave de acesso"
                (click)="copiarChave()"
              >
                <mat-icon aria-hidden="true">content_copy</mat-icon>
              </button>
            </dd>
          </div>
          <div>
            <dt>Número</dt>
            <dd>{{ numero() }}</dd>
          </div>
          <div>
            <dt>Série</dt>
            <dd>{{ info().serie }}</dd>
          </div>
          <div>
            <dt>Modelo</dt>
            <dd>{{ modelo() }}</dd>
          </div>
          <div>
            <dt>Emissão</dt>
            <dd>{{ mes() }} · {{ info().uf }}</dd>
          </div>
          <div>
            <dt>Tipo de emissão</dt>
            <dd>{{ tipoEmissao() }}</dd>
          </div>
          <div>
            <dt>CNPJ do emitente</dt>
            <dd>{{ cnpj() }}</dd>
          </div>
          <div>
            <dt>Guardada em</dt>
            <dd>{{ pendente().criadaEm | date: 'dd/MM/yyyy HH:mm' }}</dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{{ pendente().tentativas }}</dd>
          </div>
          @if (pendente().status === 'aguardando') {
            <div>
              <dt>Próxima tentativa</dt>
              <dd>{{ pendente().proximaTentativa | date: 'dd/MM/yyyy HH:mm' }}</dd>
            </div>
          }
          @if (pendente().retentadaEm; as retentada) {
            <div>
              <dt>Nova tentativa pedida em</dt>
              <dd>{{ retentada | date: 'dd/MM/yyyy HH:mm' }}</dd>
            </div>
          }
          @if (ultimoErro(); as erro) {
            <div>
              <dt>Último erro</dt>
              <dd>{{ erro }}</dd>
            </div>
          }
        </dl>
        <a class="cp-btn-ghost" [href]="pendente().url" target="_blank" rel="noopener noreferrer">
          <mat-icon aria-hidden="true">link</mat-icon>
          Abrir no site da SEFAZ-PR
        </a>
      </details>
    </div>
    <div class="item-lado pendente-acoes">
      @if (pendente().status === 'falhou') {
        <button type="button" class="cp-btn-ghost" (click)="retentar.emit(pendente().chave)">
          Tentar de novo
        </button>
      }
      <button
        type="button"
        class="cp-btn-ghost"
        [attr.aria-label]="'Excluir nota pendente de ' + mes()"
        (click)="excluir.emit(pendente().chave)"
      >
        Excluir
      </button>
    </div>
  `,
  styles: `
    .pendente-acoes {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-self: flex-start;
    }

    mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .pendente-detalhes {
      margin-top: 8px;

      summary {
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
      }

      dl {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 8px 16px;
        margin: 12px 0;
      }

      dt {
        font-size: 0.75rem;
        opacity: 0.75;
      }

      dd {
        margin: 2px 0 0;
        font-size: 0.875rem;
      }

      .pendente-chave {
        grid-column: 1 / -1;

        dd {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        code {
          overflow-wrap: anywhere;
        }
      }
    }
  `,
  host: { class: 'cp-list-row' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendenteRow {
  private readonly snack = inject(MatSnackBar);

  readonly pendente = input.required<Pendente>();
  readonly retentar = output<string>();
  readonly excluir = output<string>();

  protected readonly info = computed(() => extrairChave(this.pendente().chave));
  protected readonly cnpj = computed(() => formatarCnpj(this.info().cnpj));
  protected readonly mes = computed(() => mesDaChave(this.pendente().chave));
  protected readonly numero = computed(() => String(Number(this.info().numero)));
  protected readonly chaveFormatada = computed(() => formatarChave(this.pendente().chave));
  protected readonly modelo = computed(() => MODELOS[this.info().modelo] ?? this.info().modelo);
  protected readonly tipoEmissao = computed(
    () => TIPOS_EMISSAO[this.info().tpEmis] ?? this.info().tpEmis,
  );
  protected readonly ultimoErro = computed(() => {
    const codigo = this.pendente().ultimoErro;
    return codigo ? (MENSAGENS[codigo]?.texto ?? codigo) : null;
  });

  protected async copiarChave(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pendente().chave);
      this.snack.open('Chave copiada.', 'OK', { duration: 2000 });
    } catch {
      this.snack.open('Não foi possível copiar.', 'OK', { duration: 3000 });
    }
  }
}
