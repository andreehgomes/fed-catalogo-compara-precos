import type { FirestoreApi } from '../app/core/firebase/firestore-api';

type Dados = Record<string, unknown>;

interface Alvo {
  tipo: 'doc' | 'col';
  path: string;
  id?: string;
  r?: Restricao[];
}

interface Restricao {
  orderBy?: [string, 'asc' | 'desc'];
  limit?: number;
  where?: [string, string, unknown];
}

export type OperacaoFalsa =
  | { op: 'set'; path: string; dados: Dados }
  | { op: 'update'; path: string; dados: Dados }
  | { op: 'delete'; path: string };

interface Ouvinte {
  alvo: Alvo;
  next: (snap: unknown) => void;
  error?: (erro: unknown) => void;
}

/** Como o commit responde: grava e confirma, a regra recusa, ou fica na fila (offline). */
export type ModoCommit = 'ok' | 'erro' | 'pendente';

const UNIAO = Symbol('arrayUnion');
const REMOCAO = Symbol('arrayRemove');

/**
 * Firestore em memória para os specs, no protocolo do `FIRESTORE_API`: documentos por caminho,
 * `onSnapshot` que reemite a cada escrita e `writeBatch` que registra as operações. Com
 * `modo = 'pendente'` a escrita aparece no snapshot (como o cache local) e o commit não resolve.
 */
export function firestoreFalso() {
  const docs = new Map<string, Dados>();
  const ouvintes = new Set<Ouvinte>();
  const batches: OperacaoFalsa[][] = [];
  const estado = { modo: 'ok' as ModoCommit, pendentes: false, seq: 0 };

  const filhos = (alvo: Alvo) => {
    const prefixo = `${alvo.path}/`;
    let lista = [...docs]
      .filter(([p]) => p.startsWith(prefixo) && !p.slice(prefixo.length).includes('/'))
      .map(([p, d]) => ({ id: p.slice(prefixo.length), dados: d }));
    for (const r of alvo.r ?? []) {
      if (r.where) {
        const [campo, op, valor] = r.where;
        lista = lista.filter((x) =>
          op === '==' ? x.dados[campo] === valor : (valor as unknown[]).includes(x.dados[campo]),
        );
      }
    }
    const ordem = alvo.r?.find((r) => r.orderBy)?.orderBy;
    if (ordem) {
      const [campo, dir] = ordem;
      lista.sort((a, b) => {
        const va = a.dados[campo] as string | number;
        const vb = b.dados[campo] as string | number;
        const c = va < vb ? -1 : va > vb ? 1 : 0;
        return dir === 'desc' ? -c : c;
      });
    }
    const limite = alvo.r?.find((r) => r.limit)?.limit;
    return limite ? lista.slice(0, limite) : lista;
  };

  const snapshot = (alvo: Alvo) => {
    const metadata = { hasPendingWrites: estado.pendentes, fromCache: false };
    if (alvo.tipo === 'doc') {
      const d = docs.get(alvo.path);
      return { id: alvo.id, exists: () => !!d, data: () => d && structuredClone(d), metadata };
    }
    return {
      metadata,
      docs: filhos(alvo).map((x) => ({ id: x.id, data: () => structuredClone(x.dados) })),
    };
  };

  const notificar = () => {
    for (const o of [...ouvintes]) o.next(snapshot(o.alvo));
  };

  const aplicarCampo = (atual: unknown, valor: unknown) => {
    if (valor && typeof valor === 'object' && UNIAO in valor) {
      const lista = (atual as unknown[] | undefined) ?? [];
      return [...lista, ...(valor[UNIAO] as unknown[]).filter((v) => !lista.includes(v))];
    }
    if (valor && typeof valor === 'object' && REMOCAO in valor) {
      return ((atual as unknown[] | undefined) ?? []).filter(
        (v) => !(valor[REMOCAO] as unknown[]).includes(v),
      );
    }
    return valor;
  };

  const aplicar = (ops: OperacaoFalsa[]) => {
    for (const o of ops) {
      if (o.op === 'delete') docs.delete(o.path);
      else if (o.op === 'set') docs.set(o.path, structuredClone(o.dados));
      else {
        const atual = docs.get(o.path);
        if (!atual) throw new Error(`update em documento inexistente: ${o.path}`);
        const novo = { ...atual };
        for (const [k, v] of Object.entries(o.dados)) novo[k] = aplicarCampo(atual[k], v);
        docs.set(o.path, novo);
      }
    }
  };

  const commit = (ops: OperacaoFalsa[]): Promise<void> => {
    batches.push(ops);
    if (estado.modo === 'erro') return Promise.reject(new Error('permission-denied'));
    aplicar(ops);
    if (estado.modo === 'pendente') {
      estado.pendentes = true;
      notificar();
      return new Promise<void>(() => undefined);
    }
    notificar();
    return Promise.resolve();
  };

  const api = {
    collection: (_db: unknown, path: string): Alvo => ({ tipo: 'col', path }),
    doc: (base: unknown, path?: string): Alvo => {
      const col = base as Alvo;
      const completo = path ?? `${col.path}/auto${++estado.seq}`;
      return { tipo: 'doc', path: completo, id: completo.split('/').at(-1) };
    },
    documentId: () => '__id__',
    query: (col: Alvo, ...r: Restricao[]): Alvo => ({ ...col, r }),
    orderBy: (campo: string, dir: 'asc' | 'desc' = 'asc'): Restricao => ({ orderBy: [campo, dir] }),
    limit: (n: number): Restricao => ({ limit: n }),
    where: (campo: string, op: string, valor: unknown): Restricao => ({
      where: [campo, op, valor],
    }),
    startAfter: () => ({}),
    arrayUnion: (...v: unknown[]) => ({ [UNIAO]: v }),
    arrayRemove: (...v: unknown[]) => ({ [REMOCAO]: v }),
    onSnapshot: (alvo: Alvo, ...args: unknown[]) => {
      const [next, error] = args.filter((a) => typeof a === 'function') as [
        (s: unknown) => void,
        (e: unknown) => void,
      ];
      const o: Ouvinte = { alvo, next, error };
      ouvintes.add(o);
      next(snapshot(alvo));
      return () => ouvintes.delete(o);
    },
    getDocs: async (alvo: Alvo) => snapshot(alvo),
    getDoc: async (alvo: Alvo) => snapshot(alvo),
    setDoc: (ref: Alvo, dados: Dados) => commit([{ op: 'set', path: ref.path, dados }]),
    updateDoc: (ref: Alvo, dados: Dados) => commit([{ op: 'update', path: ref.path, dados }]),
    deleteDoc: (ref: Alvo) => commit([{ op: 'delete', path: ref.path }]),
    writeBatch: () => {
      const ops: OperacaoFalsa[] = [];
      const b = {
        set: (ref: Alvo, dados: Dados) => (ops.push({ op: 'set', path: ref.path, dados }), b),
        update: (ref: Alvo, dados: Dados) => (ops.push({ op: 'update', path: ref.path, dados }), b),
        delete: (ref: Alvo) => (ops.push({ op: 'delete', path: ref.path }), b),
        commit: () => commit(ops),
      };
      return b;
    },
  };

  return {
    api: api as unknown as FirestoreApi,
    docs,
    batches,
    /** Troca o comportamento dos próximos commits. */
    modo(m: ModoCommit) {
      estado.modo = m;
      if (m === 'ok' && estado.pendentes) {
        estado.pendentes = false;
        notificar();
      }
    },
    /** Grava direto, como se viesse do servidor, e avisa os ouvintes. */
    gravar(path: string, dados: Dados) {
      docs.set(path, structuredClone(dados));
      notificar();
    },
    apagar(path: string) {
      docs.delete(path);
      notificar();
    },
    ouvintes: () => ouvintes.size,
    /** O `onSnapshot` dos alvos cujo caminho começa com `prefixo` falha (regra recusou a leitura). */
    falhar(prefixo: string, erro: unknown = new Error('permission-denied')) {
      for (const o of [...ouvintes]) {
        if (o.alvo.path.startsWith(prefixo)) {
          ouvintes.delete(o);
          o.error?.(erro);
        }
      }
    },
  };
}

export type FirestoreFalso = ReturnType<typeof firestoreFalso>;
