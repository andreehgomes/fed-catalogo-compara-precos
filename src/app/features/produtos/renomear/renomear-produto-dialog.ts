import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { CodigoErroRenomear } from '@shared/model';
import { MAX_NOME_PRODUTO, limparNomeProduto } from '@shared/nome-produto';
import { ProdutosService } from '../data-access/produtos.service';

export interface DadosRenomearProduto {
  id: string;
  descricao: string;
  nome?: string;
}

/** O nome gravado, ou `undefined` se cancelado. */
export type ResultadoRenomearProduto = string;

const MENSAGEM = `Esse nome não serve. Use de 2 a ${MAX_NOME_PRODUTO} caracteres, com letras.`;

const ERROS: Record<CodigoErroRenomear, string> = {
  'nome-invalido': MENSAGEM,
  'produto-invalido': 'Não deu para renomear este produto.',
  'produto-inexistente': 'Este produto não existe mais.',
  'rate-limit': 'Muitas alterações seguidas. Tente de novo daqui a pouco.',
};

@Component({
  selector: 'cp-renomear-produto-dialog',
  imports: [FormField, MatDialogModule],
  template: `
    <form class="renomear" (submit)="$event.preventDefault(); salvar()">
      <h2 mat-dialog-title class="cp-section-title">Nome do produto</h2>
      <label class="cp-field">
        <span>Nome</span>
        <input
          type="text"
          autocomplete="off"
          [formField]="campo"
          [attr.aria-invalid]="!!erro()"
          [attr.aria-describedby]="
            erro() ? 'renomear-produto-erro renomear-produto-ajuda' : 'renomear-produto-ajuda'
          "
        />
      </label>
      <span id="renomear-produto-ajuda" class="cp-field-hint">Na nota: {{ dados.descricao }}</span>
      @if (erro(); as msg) {
        <span id="renomear-produto-erro" class="cp-field-error" role="alert">{{ msg }}</span>
      }
      <div class="cp-form-actions">
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button type="submit" class="cp-btn-primary" [disabled]="salvando() || !valido()">
          {{ salvando() ? 'Salvando…' : 'Salvar' }}
        </button>
      </div>
    </form>
  `,
  styles: `
    .renomear {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 22px;
    }

    h2 {
      margin: 0;
      padding: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RenomearProdutoDialog {
  protected readonly dados = inject<DadosRenomearProduto>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RenomearProdutoDialog, ResultadoRenomearProduto>);
  private readonly service = inject(ProdutosService);

  private readonly valor = signal(this.dados.nome ?? this.dados.descricao);
  protected readonly campo = form(this.valor, (p) =>
    validate(p, ({ value }) =>
      limparNomeProduto(value()) ? undefined : { kind: 'nome', message: MENSAGEM },
    ),
  );
  protected readonly valido = computed(() => this.campo().valid());
  protected readonly salvando = signal(false);
  private readonly erroServidor = signal<string | null>(null);

  protected readonly erro = computed(() => {
    const estado = this.campo();
    if (estado.invalid() && (estado.dirty() || estado.touched()))
      return estado.errors()[0]?.message ?? MENSAGEM;
    return this.erroServidor();
  });

  protected async salvar(): Promise<void> {
    const nome = limparNomeProduto(this.valor());
    if (this.salvando() || !nome) return;
    this.salvando.set(true);
    this.erroServidor.set(null);
    try {
      const r = await this.service.renomear(this.dados.id, nome);
      if (r.ok) this.ref.close(r.nome);
      else this.erroServidor.set(ERROS[r.erro.codigo]);
    } catch {
      this.erroServidor.set('Não foi possível salvar agora. Tente de novo.');
    } finally {
      this.salvando.set(false);
    }
  }
}
