import { Injectable } from '@angular/core';
import { Observable, defer, finalize, of, shareReplay, tap } from 'rxjs';

export const TTL_CACHE_MS = 30 * 60 * 1000;
const PREFIXO = 'cp-mp:';

interface Entrada {
  expira: number;
  valor: unknown;
}

export type ParteChave = string | number | null | undefined;

export function chaveCache(
  tipo: string,
  consulta: ParteChave,
  local: string,
  raioKm: number,
  offset = 0,
): string {
  return [
    tipo,
    String(consulta ?? '')
      .trim()
      .toLowerCase(),
    local.slice(0, 5),
    raioKm,
    offset,
  ].join('|');
}

@Injectable({ providedIn: 'root' })
export class MenorPrecoCache {
  private readonly memoria = new Map<string, Entrada>();
  private readonly emVoo = new Map<string, Observable<unknown>>();

  obter<T>(
    chave: string,
    buscar: () => Observable<T>,
    reviver: (bruto: unknown) => T = (x) => x as T,
  ): Observable<T> {
    return defer(() => {
      const guardado = this.ler(chave);
      if (guardado !== undefined) return of(reviver(guardado));
      const voando = this.emVoo.get(chave) as Observable<T> | undefined;
      if (voando) return voando;
      const pedido = buscar().pipe(
        tap((valor) => this.gravar(chave, valor)),
        finalize(() => this.emVoo.delete(chave)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.emVoo.set(chave, pedido);
      return pedido;
    });
  }

  limpar(): void {
    this.memoria.clear();
    try {
      for (const k of Object.keys(sessionStorage))
        if (k.startsWith(PREFIXO)) sessionStorage.removeItem(k);
    } catch {
      /* sessionStorage indisponível: só a memória vale */
    }
  }

  private ler(chave: string): unknown {
    const agora = Date.now();
    const m = this.memoria.get(chave);
    if (m && m.expira > agora) return m.valor;
    try {
      const bruto = sessionStorage.getItem(PREFIXO + chave);
      if (!bruto) return undefined;
      const e = JSON.parse(bruto) as Entrada;
      if (e.expira > agora) {
        this.memoria.set(chave, e);
        return e.valor;
      }
      sessionStorage.removeItem(PREFIXO + chave);
    } catch {
      return undefined;
    }
    return undefined;
  }

  private gravar(chave: string, valor: unknown): void {
    const e: Entrada = { expira: Date.now() + TTL_CACHE_MS, valor };
    this.memoria.set(chave, e);
    try {
      sessionStorage.setItem(PREFIXO + chave, JSON.stringify(e));
    } catch {
      /* cota cheia ou storage bloqueado: fica só em memória */
    }
  }
}
