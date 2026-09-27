import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, TimeoutError, catchError, map, throwError, timeout } from 'rxjs';
import type { FontePrecosRegiao } from './fonte-precos-regiao';
import {
  FonteIndisponivelError,
  type Categoria,
  type ConsultaGtin,
  type ConsultaTermo,
  type ResultadoBusca,
} from './regiao.model';
import { MenorPrecoCache, chaveCache } from './menor-preco.cache';
import { FormatoInvalidoError, mapearCategorias, mapearProdutos } from './menor-preco.schema';

export const MENOR_PRECO_API = 'https://menorpreco.notaparana.pr.gov.br/api/v1';
export const TIMEOUT_MS = 10_000;
/** Período: -1 = últimos 2 meses (padrão do site oficial). */
const PERIODO = -1;

function reviverBusca(bruto: unknown): ResultadoBusca {
  const r = bruto as ResultadoBusca;
  return { ...r, ofertas: r.ofertas.map((o) => ({ ...o, dataHora: new Date(o.dataHora) })) };
}

function paraIndisponivel(erro: unknown): FonteIndisponivelError {
  if (erro instanceof FonteIndisponivelError) return erro;
  if (erro instanceof TimeoutError) return new FonteIndisponivelError('timeout', erro);
  if (erro instanceof FormatoInvalidoError) return new FonteIndisponivelError('formato', erro);
  const status = (erro as { status?: number } | null)?.status;
  return new FonteIndisponivelError(status ? 'http' : 'rede', erro);
}

@Injectable({ providedIn: 'root' })
export class MenorPrecoClient implements FontePrecosRegiao {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(MenorPrecoCache);

  porGtin(q: ConsultaGtin): Observable<ResultadoBusca> {
    const offset = q.offset ?? 0;
    return this.cache.obter(
      chaveCache('gtin', q.gtin, q.local, q.raioKm, offset),
      () => this.produtos({ gtin: q.gtin, local: q.local, raio: q.raioKm, offset }),
      reviverBusca,
    );
  }

  porTermo(q: ConsultaTermo): Observable<ResultadoBusca> {
    const offset = q.offset ?? 0;
    const termo = q.termo.trim();
    return this.cache.obter(
      chaveCache(`termo:${q.categoria ?? ''}`, termo, q.local, q.raioKm, offset),
      () =>
        this.produtos({
          termo,
          local: q.local,
          raio: q.raioKm,
          offset,
          ...(q.categoria ? { categoria: q.categoria } : {}),
        }),
      reviverBusca,
    );
  }

  categorias(q: Omit<ConsultaTermo, 'categoria' | 'offset'>): Observable<Categoria[]> {
    const termo = q.termo.trim();
    return this.cache.obter(chaveCache('categorias', termo, q.local, q.raioKm), () =>
      this.get(
        '/categorias',
        { local: q.local, termo, raio: q.raioKm, data: PERIODO },
        mapearCategorias,
      ),
    );
  }

  private produtos(params: Record<string, string | number>): Observable<ResultadoBusca> {
    return this.get('/produtos', { ...params, data: PERIODO }, mapearProdutos);
  }

  private get<T>(
    caminho: string,
    params: Record<string, string | number>,
    mapear: (json: unknown) => T,
  ): Observable<T> {
    return this.http
      .get<unknown>(MENOR_PRECO_API + caminho, { params: new HttpParams({ fromObject: params }) })
      .pipe(
        timeout(TIMEOUT_MS),
        map(mapear),
        catchError((e: unknown) => throwError(() => paraIndisponivel(e))),
      );
  }
}
