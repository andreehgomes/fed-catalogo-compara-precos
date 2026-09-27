import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { formatarCnpj } from '@shared/chave-acesso';
import { extrairConteudo, precoPorUnidadeBase } from '@shared/unidade';
import { Preco } from '../../../shared/ui/preco/preco';
import { ImportarStore } from '../importar.store';
import { mensagemDe } from '../mensagens';

@Component({
  selector: 'cp-preview-nota',
  imports: [CurrencyPipe, DatePipe, DecimalPipe, MatIconModule, Preco],
  templateUrl: './preview-nota.page.html',
  styleUrl: './preview-nota.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PreviewNotaPage {
  protected readonly store = inject(ImportarStore);
  private readonly router = inject(Router);

  protected readonly nota = this.store.nota;
  protected readonly cnpj = computed(() => formatarCnpj(this.nota()?.emitente.cnpj ?? ''));
  protected readonly itens = computed(() =>
    (this.nota()?.itens ?? []).map((i) => ({
      ...i,
      porUnidade: precoPorUnidadeBase(i.vlUnit, i.unidade, extrairConteudo(i.descricao)),
    })),
  );
  protected readonly confirmando = computed(() => this.store.estado().tipo === 'confirmando');
  protected readonly erro = computed(() => {
    const e = this.store.estado();
    return e.tipo === 'erro' ? mensagemDe(e.erro).texto : null;
  });

  protected confirmar(): void {
    void this.store.confirmar();
  }

  protected cancelar(): void {
    this.store.reiniciar();
    void this.router.navigate(['/importar']);
  }
}
