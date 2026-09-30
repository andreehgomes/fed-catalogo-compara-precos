import { Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { ErroImportacao, NfceParsed, PreviewEntrada } from '@shared/model';
import { ListasService } from '../listas/data-access/listas.service';
import { HistoricoPessoalStore } from '../notas/data-access/historico-pessoal.store';
import { ImportarService } from './data-access/importar.service';
import { estabelecimentoAtualizado, interpretarEntrada } from './mensagens';

export type EstadoImportacao =
  | { tipo: 'ocioso' }
  | { tipo: 'buscando'; entrada: PreviewEntrada }
  | {
      tipo: 'preview';
      entrada: PreviewEntrada;
      nota: NfceParsed;
      apelido: string | null;
      erro?: ErroImportacao;
    }
  | { tipo: 'confirmando'; entrada: PreviewEntrada; nota: NfceParsed; apelido: string | null }
  | { tipo: 'guardando'; entrada: PreviewEntrada; erro: ErroImportacao }
  | { tipo: 'guardada'; chave: string; proximaTentativa: string }
  | { tipo: 'erro'; entrada: PreviewEntrada | null; erro: ErroImportacao; nota?: NfceParsed };

/** Estado do fluxo "ler → prévia → confirmar". Singleton: a prévia sobrevive à navegação. */
@Injectable({ providedIn: 'root' })
export class ImportarStore {
  private readonly service = inject(ImportarService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly historico = inject(HistoricoPessoalStore);
  private readonly listas = inject(ListasService);

  private readonly _lista = signal<string | null>(null);
  /** Lista de compras em contexto (RF-09): a nota importada vai ser conferida com ela. */
  readonly lista = this._lista.asReadonly();

  private readonly _estado = signal<EstadoImportacao>({ tipo: 'ocioso' });
  readonly estado = this._estado.asReadonly();
  readonly ocupado = computed(() =>
    ['buscando', 'confirmando', 'guardando'].includes(this._estado().tipo),
  );
  readonly nota = computed(() => {
    const e = this._estado();
    return e.tipo === 'preview' || e.tipo === 'confirmando'
      ? e.nota
      : e.tipo === 'erro'
        ? (e.nota ?? null)
        : null;
  });
  /** Apelido que o usuário já deu à loja (vem da prévia). */
  readonly apelido = computed(() => {
    const e = this._estado();
    return e.tipo === 'preview' || e.tipo === 'confirmando' ? e.apelido : null;
  });

  /** Valida localmente e, se passar, busca a prévia. Devolve o erro local, se houver. */
  async importarTexto(texto: string): Promise<ErroImportacao | null> {
    const r = interpretarEntrada(texto);
    if (!r.ok) {
      this._estado.set({ tipo: 'erro', entrada: null, erro: r.erro });
      return r.erro;
    }
    await this.buscar(r.entrada);
    return null;
  }

  async buscar(entrada: PreviewEntrada): Promise<void> {
    if (this.ocupado()) return;
    this._estado.set({ tipo: 'buscando', entrada });
    const r = await this.service.preview(entrada);
    if (!r.ok) {
      if (estabelecimentoAtualizado(r.erro)) this.historico.invalidar();
      this._estado.set({ tipo: 'erro', entrada, erro: r.erro });
      return;
    }
    this._estado.set({ tipo: 'preview', entrada, ...r.valor });
    await this.router.navigate(['/importar/preview']);
  }

  /** `apelido`: `undefined` quando o campo não aparece; `null` quando foi apagado. */
  async confirmar(apelido?: string | null): Promise<void> {
    const e = this._estado();
    if (e.tipo !== 'preview') return;
    const { entrada, nota } = e;
    this._estado.set({ tipo: 'confirmando', entrada, nota, apelido: e.apelido });
    let r = await this.service.confirmar(nota.chave, apelido);
    if (!r.ok && r.erro.codigo === 'preview-expirado') {
      const refeito = await this.service.preview(entrada);
      if (refeito.ok) r = await this.service.confirmar(refeito.valor.nota.chave, apelido);
    }
    if (!r.ok && r.erro.codigo === 'apelido-invalido') {
      this._estado.set({ tipo: 'preview', entrada, nota, apelido: e.apelido, erro: r.erro });
      return;
    }
    if (!r.ok) {
      this._estado.set({ tipo: 'erro', entrada, erro: r.erro, nota });
      return;
    }
    this.historico.invalidar();
    this._estado.set({ tipo: 'ocioso' });
    const lista = this._lista();
    if (lista) {
      await this.router.navigate(['/listas', lista, 'conferir'], {
        queryParams: { chave: r.valor },
      });
      this.snack.open('Nota importada — confira com a lista', 'OK', { duration: 4000 });
      return;
    }
    await this.router.navigate(['/notas', r.valor]);
    this.snack.open('Nota importada', 'OK', { duration: 4000 });
  }

  async guardar(): Promise<void> {
    const e = this._estado();
    if (e.tipo !== 'erro' || !e.entrada) return;
    this._estado.set({ tipo: 'guardando', entrada: e.entrada, erro: e.erro });
    const r = await this.service.enfileirar(e.entrada);
    if (!r.ok) {
      this._estado.set({ tipo: 'erro', entrada: e.entrada, erro: r.erro });
      return;
    }
    this._estado.set({ tipo: 'guardada', ...r.valor });
    const lista = this._lista();
    if (lista) this.listas.aguardarNota(lista, r.valor.chave).catch(() => undefined);
    this.snack.open('Nota guardada. Vamos importar quando a SEFAZ-PR voltar.', 'OK', {
      duration: 5000,
    });
  }

  /** Só `definirLista(null)` tira a lista de contexto; `reiniciar()` a mantém. */
  definirLista(id: string | null): void {
    this._lista.set(id);
  }

  reiniciar(): void {
    this._estado.set({ tipo: 'ocioso' });
  }
}
