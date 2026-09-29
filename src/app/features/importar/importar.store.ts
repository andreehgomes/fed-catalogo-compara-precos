import { Injectable, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { ErroImportacao, NfceParsed, PreviewEntrada } from '@shared/model';
import { HistoricoPessoalStore } from '../notas/data-access/historico-pessoal.store';
import { ImportarService } from './data-access/importar.service';
import { interpretarEntrada } from './mensagens';

export type EstadoImportacao =
  | { tipo: 'ocioso' }
  | { tipo: 'buscando'; entrada: PreviewEntrada }
  | { tipo: 'preview'; entrada: PreviewEntrada; nota: NfceParsed }
  | { tipo: 'confirmando'; entrada: PreviewEntrada; nota: NfceParsed }
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
      this._estado.set({ tipo: 'erro', entrada, erro: r.erro });
      return;
    }
    this._estado.set({ tipo: 'preview', entrada, nota: r.valor });
    await this.router.navigate(['/importar/preview']);
  }

  async confirmar(): Promise<void> {
    const e = this._estado();
    if (e.tipo !== 'preview') return;
    this._estado.set({ tipo: 'confirmando', entrada: e.entrada, nota: e.nota });
    let r = await this.service.confirmar(e.nota.chave);
    if (!r.ok && r.erro.codigo === 'preview-expirado') {
      const refeito = await this.service.preview(e.entrada);
      if (refeito.ok) r = await this.service.confirmar(refeito.valor.chave);
    }
    if (!r.ok) {
      this._estado.set({ tipo: 'erro', entrada: e.entrada, erro: r.erro, nota: e.nota });
      return;
    }
    this.historico.invalidar();
    this._estado.set({ tipo: 'ocioso' });
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
    this.snack.open('Nota guardada. Vamos importar quando a SEFAZ-PR voltar.', 'OK', {
      duration: 5000,
    });
  }

  reiniciar(): void {
    this._estado.set({ tipo: 'ocioso' });
  }
}
