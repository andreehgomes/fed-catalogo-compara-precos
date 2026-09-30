import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { sugerirApelido } from '@shared/apelido';
import { CampoApelido } from '../../../shared/ui/campo-apelido/campo-apelido';
import { mensagemDe } from '../../importar/mensagens';
import { ApelidosService } from '../data-access/apelidos.service';

export interface DadosRenomear {
  cnpj: string;
  nome: string;
  fantasia?: string;
  apelido?: string;
}

/** Resultado do diálogo: o que foi gravado, ou `undefined` se cancelado. */
export interface ResultadoRenomear {
  apelido: string | null;
  notasAtualizadas: number;
}

@Component({
  selector: 'cp-renomear-dialog',
  imports: [CampoApelido, MatDialogModule],
  template: `
    <form class="renomear" (submit)="$event.preventDefault(); salvar(valor().trim() || null)">
      <h2 mat-dialog-title class="cp-section-title">Nome da loja</h2>
      <cp-campo-apelido [(valor)]="valor" [nomeOficial]="dados.nome" [erroServidor]="erro()" />
      <p class="cp-field-hint">Razão social: {{ dados.nome }}</p>
      <div class="cp-form-actions">
        @if (dados.apelido) {
          <button type="button" class="cp-btn-ghost" [disabled]="salvando()" (click)="salvar(null)">
            Usar o nome oficial
          </button>
        }
        <button type="button" class="cp-btn-secondary" mat-dialog-close>Cancelar</button>
        <button type="submit" class="cp-btn-primary" [disabled]="salvando() || !campoValido()">
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
export class RenomearDialog {
  protected readonly dados = inject<DadosRenomear>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<RenomearDialog, ResultadoRenomear>);
  private readonly apelidos = inject(ApelidosService);

  protected readonly valor = signal(
    this.dados.apelido ?? this.dados.fantasia ?? sugerirApelido(this.dados.nome) ?? '',
  );
  private readonly campo = viewChild(CampoApelido);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected campoValido(): boolean {
    return this.campo()?.valido() ?? true;
  }

  protected async salvar(apelido: string | null): Promise<void> {
    if (this.salvando() || (apelido !== null && !this.campoValido())) return;
    this.salvando.set(true);
    this.erro.set(null);
    try {
      const r = await this.apelidos.definir(this.dados.cnpj, apelido);
      if (r.ok) this.ref.close(r.valor);
      else this.erro.set(mensagemDe(r.erro).texto);
    } finally {
      this.salvando.set(false);
    }
  }
}
