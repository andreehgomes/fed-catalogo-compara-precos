import { Injectable, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { Nota, Pendente } from '@shared/model';
import { Observable, catchError, of, pairwise, startWith, switchMap, tap } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { FIRESTORE_API } from '../../../core/firebase/firestore-api';
import { FIRESTORE } from '../../../core/firebase/firestore.token';
import { ImportarService, type Resultado } from '../../importar/data-access/importar.service';

/** Notas aguardando a SEFAZ-PR (`usuarios/{uid}/pendentes`), em tempo real. */
@Injectable({ providedIn: 'root' })
export class PendentesService {
  private readonly db = inject(FIRESTORE);
  private readonly api = inject(FIRESTORE_API);
  private readonly auth = inject(AuthStore);
  private readonly snack = inject(MatSnackBar);
  private readonly importar = inject(ImportarService);

  readonly pendentes = toSignal(
    toObservable(this.auth.uid).pipe(switchMap((uid) => (uid ? this.observar(uid) : of([])))),
    { initialValue: [] as Pendente[] },
  );

  retentar(chave: string): Promise<Resultado<string>> {
    return this.importar.retentar(chave);
  }

  async excluir(chave: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    await this.api.deleteDoc(this.api.doc(this.db, `usuarios/${uid}/pendentes/${chave}`));
  }

  private observar(uid: string): Observable<Pendente[]> {
    const lista$ = new Observable<Pendente[]>((sub) => {
      const q = this.api.query(
        this.api.collection(this.db, `usuarios/${uid}/pendentes`),
        this.api.orderBy('criadaEm'),
      );
      return this.api.onSnapshot(
        q,
        (snap) => sub.next(snap.docs.map((d) => d.data() as Pendente)),
        (erro) => sub.error(erro),
      );
    });
    return lista$.pipe(
      startWith(null),
      pairwise(),
      tap(([antes, agora]) => {
        if (!antes || !agora) return;
        const restantes = new Set(agora.map((p) => p.chave));
        for (const p of antes)
          if (!restantes.has(p.chave)) void this.avisarSeImportada(uid, p.chave);
      }),
      switchMap(([, agora]) => (agora ? of(agora) : of<Pendente[]>([]))),
      catchError(() => of([])),
    );
  }

  private async avisarSeImportada(uid: string, chave: string): Promise<void> {
    try {
      const snap = await this.api.getDoc(this.api.doc(this.db, `usuarios/${uid}/notas/${chave}`));
      const nota = snap.exists() ? (snap.data() as Nota) : null;
      if (nota?.veioDaFila) {
        this.snack.open(`Nota de ${nota.estabelecimentoNome} importada`, 'OK', { duration: 5000 });
      }
    } catch {
      /* sem conexão: a nota aparece na lista de qualquer jeito */
    }
  }
}
