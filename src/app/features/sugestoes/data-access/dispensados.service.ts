import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import type { DataIso } from '@shared/model';
import { AuthStore, PREFIXO_DISPENSADOS } from '../../../core/auth/auth.store';

export interface Dispensados {
  /** grupo → dia em que o usuário disse "Já tenho". */
  jaTenho: ReadonlyMap<string, DataIso>;
  nunca: ReadonlySet<string>;
}

interface Gravado {
  jaTenho?: Record<string, DataIso>;
  nunca?: string[];
}

const VAZIO: Dispensados = { jaTenho: new Map(), nunca: new Set() };

function ler(uid: string | null): Dispensados {
  if (!uid) return VAZIO;
  try {
    const bruto = localStorage.getItem(PREFIXO_DISPENSADOS + uid);
    if (!bruto) return VAZIO;
    const g = JSON.parse(bruto) as Gravado;
    return { jaTenho: new Map(Object.entries(g.jaTenho ?? {})), nunca: new Set(g.nunca ?? []) };
  } catch {
    return VAZIO;
  }
}

/**
 * "Já tenho" e "Não sugerir mais" (D-03): ficam só neste aparelho, por `uid`, porque o cliente
 * não grava em `usuarios/{uid}`. O `AuthStore.sair()` apaga as chaves.
 */
@Injectable({ providedIn: 'root' })
export class DispensadosService {
  private readonly auth = inject(AuthStore);

  private readonly estado = linkedSignal({
    source: this.auth.uid,
    computation: (uid) => ler(uid),
  });
  readonly jaTenho = computed(() => this.estado().jaTenho);
  readonly nunca = computed(() => this.estado().nunca);
  readonly dispensados = this.estado.asReadonly();

  marcarJaTenho(grupo: string, hoje: Date): void {
    const jaTenho = new Map(this.estado().jaTenho);
    jaTenho.set(grupo, hoje.toISOString());
    this.gravar({ ...this.estado(), jaTenho });
  }

  naoSugerir(grupo: string): void {
    this.gravar({ ...this.estado(), nunca: new Set([...this.estado().nunca, grupo]) });
  }

  voltarASugerir(grupo: string): void {
    const nunca = new Set(this.estado().nunca);
    const jaTenho = new Map(this.estado().jaTenho);
    nunca.delete(grupo);
    jaTenho.delete(grupo);
    this.gravar({ jaTenho, nunca });
  }

  private gravar(d: Dispensados): void {
    this.estado.set(d);
    const uid = this.auth.uid();
    if (!uid) return;
    const g: Gravado = { jaTenho: Object.fromEntries(d.jaTenho), nunca: [...d.nunca] };
    try {
      localStorage.setItem(PREFIXO_DISPENSADOS + uid, JSON.stringify(g));
    } catch {
      /* storage bloqueado: vale só nesta sessão */
    }
  }
}
