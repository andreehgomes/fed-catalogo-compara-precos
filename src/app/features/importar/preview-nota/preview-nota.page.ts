import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { sugerirApelido } from '@shared/apelido';
import { formatarCnpj } from '@shared/chave-acesso';
import { extrairConteudo, precoPorUnidadeBase } from '@shared/unidade';
import { CampoApelido } from '../../../shared/ui/campo-apelido/campo-apelido';
import { Preco } from '../../../shared/ui/preco/preco';
import { ImportarStore } from '../importar.store';
import { mensagemDe } from '../mensagens';

@Component({
  selector: 'cp-preview-nota',
  imports: [CampoApelido, CurrencyPipe, DatePipe, DecimalPipe, MatIconModule, Preco],
  templateUrl: './preview-nota.page.html',
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
  protected readonly titulo = computed(() => {
    const n = this.nota();
    return this.store.apelido() || n?.emitente.fantasia || n?.emitente.nome || '';
  });
  protected readonly mostrarCampo = computed(() => {
    const n = this.nota();
    return !!n && !n.emitente.fantasia && !this.store.apelido();
  });
  protected readonly apelido = linkedSignal({
    source: () => this.nota()?.chave,
    computation: () => sugerirApelido(this.nota()?.emitente.nome ?? '') ?? '',
  });
  private readonly campo = viewChild(CampoApelido);
  protected readonly apelidoInvalido = computed(
    () => this.mostrarCampo() && !(this.campo()?.valido() ?? true),
  );

  protected readonly confirmando = computed(() => this.store.estado().tipo === 'confirmando');
  protected readonly erro = computed(() => {
    const e = this.store.estado();
    return e.tipo === 'erro' ? mensagemDe(e.erro).texto : null;
  });
  protected readonly erroApelido = computed(() => {
    const e = this.store.estado();
    return e.tipo === 'preview' && e.erro ? mensagemDe(e.erro).texto : null;
  });

  protected confirmar(): void {
    if (this.apelidoInvalido()) return;
    void this.store.confirmar(this.mostrarCampo() ? this.apelido().trim() || null : undefined);
  }

  protected cancelar(): void {
    this.store.reiniciar();
    void this.router.navigate(['/importar']);
  }
}
