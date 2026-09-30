import { Injectable, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { nomeExibido } from '@shared/apelido';
import type { ApelidoEstabelecimento, DefinirApelidoResposta } from '@shared/model';
import { Observable, catchError, of, switchMap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { CHAMAR_FUNCTION } from '../../../core/firebase/callable';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';
import { erroDeFunctions, type Resultado } from '../../importar/data-access/importar.service';
import { HistoricoPessoalStore } from '../../notas/data-access/historico-pessoal.store';

const VAZIO: ReadonlyMap<string, string> = new Map();

/** Apelidos pessoais das lojas (`usuarios/{uid}/estabelecimentos`), em tempo real. */
@Injectable({ providedIn: 'root' })
export class ApelidosService {
  private readonly db = inject(FIRESTORE);
  private readonly api = inject(FIRESTORE_API);
  private readonly auth = inject(AuthStore);
  private readonly chamar = inject(CHAMAR_FUNCTION);
  private readonly historico = inject(HistoricoPessoalStore);

  readonly apelidos = toSignal(
    toObservable(this.auth.uid).pipe(switchMap((uid) => (uid ? this.observar(uid) : of(VAZIO)))),
    { initialValue: VAZIO },
  );

  nome(estab: { cnpj: string; nome: string; fantasia?: string }): string {
    return nomeExibido(estab, this.apelidos().get(estab.cnpj));
  }

  async definir(
    cnpj: string,
    apelido: string | null,
  ): Promise<Resultado<{ apelido: string | null; notasAtualizadas: number }>> {
    try {
      const r = await this.chamar<DefinirApelidoResposta>('definirApelido', { cnpj, apelido });
      if (!r || typeof r !== 'object' || !('ok' in r))
        return { ok: false, erro: { codigo: 'desconhecido' } };
      if (!r.ok) return r;
      this.historico.invalidar();
      return { ok: true, valor: { apelido: r.apelido, notasAtualizadas: r.notasAtualizadas } };
    } catch (e) {
      return { ok: false, erro: erroDeFunctions(e) };
    }
  }

  private observar(uid: string): Observable<ReadonlyMap<string, string>> {
    return new Observable<ReadonlyMap<string, string>>((sub) =>
      this.api.onSnapshot(
        this.api.collection(this.db, `usuarios/${uid}/estabelecimentos`),
        (snap) =>
          sub.next(
            new Map(
              snap.docs.map((d) => {
                const a = d.data() as ApelidoEstabelecimento;
                return [a.cnpj ?? d.id, a.apelido];
              }),
            ),
          ),
        (erro) => sub.error(erro),
      ),
    ).pipe(catchError(() => of(VAZIO)));
  }
}
