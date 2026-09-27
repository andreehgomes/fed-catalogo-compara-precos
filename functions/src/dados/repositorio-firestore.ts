import type { Pendente } from '@shared/model';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  LIMITE_LOTE,
  type Dados,
  type Filtro,
  type OpcoesGravacao,
  type Operacao,
  type PendenteVencido,
  type Repositorio,
  type Transacao,
} from './repositorio';

export class RepositorioFirestore implements Repositorio {
  constructor(private readonly db: Firestore = getFirestore()) {}

  async obter<T>(caminho: string): Promise<T | null> {
    const snap = await this.db.doc(caminho).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  async obterVarios<T>(caminhos: readonly string[]): Promise<(T | null)[]> {
    if (!caminhos.length) return [];
    const snaps = await this.db.getAll(...caminhos.map((c) => this.db.doc(c)));
    return snaps.map((s) => (s.exists ? (s.data() as T) : null));
  }

  async gravar(caminho: string, dados: Dados, opcoes: OpcoesGravacao = {}): Promise<void> {
    await this.db.doc(caminho).set(dados, { merge: !!opcoes.merge });
  }

  async apagar(caminho: string): Promise<void> {
    await this.db.doc(caminho).delete();
  }

  async lote(operacoes: readonly Operacao[]): Promise<void> {
    for (let i = 0; i < operacoes.length; i += LIMITE_LOTE) {
      const batch = this.db.batch();
      for (const op of operacoes.slice(i, i + LIMITE_LOTE)) {
        const ref = this.db.doc(op.caminho);
        if (op.tipo === 'apagar') batch.delete(ref);
        else batch.set(ref, op.dados ?? {}, { merge: !!op.opcoes?.merge });
      }
      await batch.commit();
    }
  }

  transacao<R>(fn: (tx: Transacao) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (t) =>
      fn({
        obter: async <T>(caminho: string) => {
          const snap = await t.get(this.db.doc(caminho));
          return snap.exists ? (snap.data() as T) : null;
        },
        gravar: (caminho, dados, opcoes = {}) => {
          t.set(this.db.doc(caminho), dados, { merge: !!opcoes.merge });
        },
        apagar: (caminho) => {
          t.delete(this.db.doc(caminho));
        },
      }),
    );
  }

  async consultarPendentesVencidos(agora: Date, limite: number): Promise<PendenteVencido[]> {
    const snap = await this.db
      .collectionGroup('pendentes')
      .where('status', '==', 'aguardando')
      .where('proximaTentativa', '<=', agora.toISOString())
      .orderBy('proximaTentativa')
      .limit(limite)
      .get();
    return snap.docs.map((d) => ({
      uid: d.ref.parent.parent!.id,
      pendente: d.data() as Pendente,
    }));
  }

  async consultar<T>(
    colecao: string,
    filtros: readonly Filtro[],
  ): Promise<{ caminho: string; dados: T }[]> {
    let q: FirebaseFirestore.Query = this.db.collection(colecao);
    for (const f of filtros) q = q.where(f.campo, f.op, f.valor);
    const snap = await q.get();
    return snap.docs.map((d) => ({ caminho: d.ref.path, dados: d.data() as T }));
  }
}
