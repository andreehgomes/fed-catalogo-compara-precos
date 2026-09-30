import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormField, form, maxLength } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { MAX_TEXTO, SugestaoAutocompletar, rotuloQuantidade } from '../../lista';

let sequencia = 0;

@Component({
  selector: 'cp-adicionar-item',
  imports: [FormField, MatIconModule],
  template: `
    <form class="adicionar" (submit)="$event.preventDefault(); enviar()">
      <label class="cp-field adicionar-campo">
        <span>Adicionar item</span>
        <input
          #campo
          type="text"
          role="combobox"
          autocomplete="off"
          enterkeyhint="done"
          placeholder="Ex.: leite, pão, detergente"
          aria-autocomplete="list"
          [attr.aria-expanded]="aberto()"
          [attr.aria-controls]="id + '-opcoes'"
          [attr.aria-activedescendant]="ativo() >= 0 ? id + '-opcao-' + ativo() : null"
          [formField]="form.texto"
          (input)="mostrar.set(true)"
          (focus)="foco.emit()"
          (blur)="mostrar.set(false)"
          (keydown)="tecla($event)"
        />
      </label>
      <button
        type="submit"
        class="cp-btn-primary adicionar-botao"
        aria-label="Adicionar"
        [disabled]="!form.texto().value().trim()"
      >
        <mat-icon aria-hidden="true">add</mat-icon>
      </button>
      <ul
        class="adicionar-opcoes"
        role="listbox"
        aria-label="Você já comprou"
        [id]="id + '-opcoes'"
        [hidden]="!aberto()"
      >
        @for (o of opcoes(); track o.grupo; let i = $index) {
          <li
            role="option"
            tabindex="-1"
            [id]="id + '-opcao-' + i"
            [attr.aria-selected]="i === ativo()"
            [class.ativa]="i === ativo()"
            (mousedown)="$event.preventDefault()"
            (click)="escolher(o)"
            (keydown.enter)="escolher(o)"
          >
            <span class="adicionar-descricao">{{ o.descricao }}</span>
            <span class="adicionar-qtd">≈ {{ quantidade(o) }}</span>
          </li>
        }
      </ul>
    </form>
  `,
  styles: `
    @use '../../../../shared/style/tokens' as *;

    .adicionar {
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .adicionar-campo {
      flex: 1;
      min-width: 0;
    }

    .adicionar-botao {
      min-width: 48px;
      min-height: 48px;
      padding: 0;
    }

    .adicionar-opcoes {
      position: absolute;
      top: 100%;
      right: 0;
      left: 0;
      z-index: 6;
      margin: 4px 0 0;
      padding: 4px;
      list-style: none;
      background: $cp-surface;
      border: 1px solid $cp-border;
      border-radius: $cp-radius-input;
      box-shadow: $cp-shadow-panel;

      li {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        align-items: center;
        padding: 0 12px;
        border-radius: $cp-radius-sm;
        font-size: 14px;
        cursor: pointer;

        &.ativa,
        &:hover {
          background: $cp-accent-soft;
        }
      }
    }

    .adicionar-qtd {
      flex-shrink: 0;
      color: $cp-text-muted;
      font-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdicionarItem {
  /** Busca no histórico (o autocompletar); lê signals, então as opções reagem ao índice. */
  readonly buscar = input.required<(texto: string) => SugestaoAutocompletar[]>();
  readonly texto = output<string>();
  readonly historico = output<string>();
  readonly foco = output();

  protected readonly id = `adicionar-${++sequencia}`;
  private readonly campo = viewChild.required<ElementRef<HTMLInputElement>>('campo');

  protected readonly form = form(signal({ texto: '' }), (p) => {
    maxLength(p.texto, MAX_TEXTO);
  });
  protected readonly mostrar = signal(false);
  protected readonly opcoes = computed(() => this.buscar()(this.form.texto().value()));
  protected readonly aberto = computed(() => this.mostrar() && this.opcoes().length > 0);
  protected readonly ativo = linkedSignal({ source: this.opcoes, computation: () => -1 });

  protected quantidade(o: SugestaoAutocompletar): string {
    return rotuloQuantidade({ quantidade: o.quantidade.valor, unidade: o.quantidade.unidade });
  }

  protected tecla(e: KeyboardEvent): void {
    const n = this.opcoes().length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!n) return;
        e.preventDefault();
        this.mostrar.set(true);
        this.ativo.update((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
        break;
      case 'Enter':
        if (this.aberto() && this.ativo() >= 0) {
          e.preventDefault();
          this.escolher(this.opcoes()[this.ativo()]);
        }
        break;
      case 'Escape':
        if (this.aberto()) {
          e.preventDefault();
          e.stopPropagation();
          this.mostrar.set(false);
        }
        break;
    }
  }

  protected enviar(): void {
    const texto = this.form.texto().value().trim();
    if (!texto) return;
    this.texto.emit(texto);
    this.limpar();
  }

  protected escolher(o: SugestaoAutocompletar): void {
    this.historico.emit(o.grupo);
    this.limpar();
  }

  private limpar(): void {
    this.form.texto().value.set('');
    this.mostrar.set(false);
    this.campo().nativeElement.focus();
  }
}
