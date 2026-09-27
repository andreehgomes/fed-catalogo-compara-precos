import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  extrairConteudo,
  jaccard,
  normalizarDescricao,
  separarDivergentes,
  tokensSemMedida,
} from '@shared/index';
import type { ItemNota } from '@shared/model';
import {
  Observable,
  Subscription,
  catchError,
  concatMap,
  from,
  map,
  of,
  takeWhile,
  tap,
} from 'rxjs';
import { FontePrecosRegiao } from '../../regiao/data-access/fonte-precos-regiao';
import { FonteIndisponivelError, OfertaRegiao } from '../../regiao/data-access/regiao.model';
import { LocalizacaoStore } from '../../regiao/localizacao/localizacao.store';

export const CENTAVO = 0.005;
export const SIMILARIDADE_MINIMA = 0.3;

/** Ofertas que parecem o mesmo produto: descrição parecida e, se houver, mesmo conteúdo. */
export function equivalentesPorTexto(
  descricao: string,
  ofertas: readonly OfertaRegiao[],
): OfertaRegiao[] {
  const alvo = tokensSemMedida(descricao);
  const conteudo = extrairConteudo(descricao);
  return ofertas.filter((o) => {
    if (jaccard(alvo, tokensSemMedida(o.descricao)) < SIMILARIDADE_MINIMA) return false;
    if (!conteudo) return true;
    const outro = extrairConteudo(o.descricao);
    return (
      !outro ||
      (outro.unidadeBase === conteudo.unidadeBase &&
        Math.abs(outro.quantidade - conteudo.quantidade) < 1e-6)
    );
  });
}

export type Comparacao =
  | { tipo: 'mais-barato'; diferenca: number; oferta: OfertaRegiao; aproximado: boolean }
  | { tipo: 'menor-preco'; aproximado: boolean }
  | { tipo: 'sem-oferta' }
  | { tipo: 'sem-codigo' };

export type EstadoComparacao = 'ocioso' | 'comparando' | 'concluido' | 'indisponivel';

/**
 * RF-28: compara cada item da nota com o menor preço coerente da região, sob demanda e
 * em sequência (no máximo 1 requisição em voo; o cache do client evita repetir).
 * Itens sem EAN usam a busca por texto com a descrição normalizada, marcada como
 * "aproximado" (o PR pode não trazer EAN na página da nota).
 */
@Injectable()
export class MaisBaratoPerto {
  private readonly fonte = inject(FontePrecosRegiao);
  private readonly loc = inject(LocalizacaoStore);
  private assinatura: Subscription | null = null;

  private readonly _estado = signal<EstadoComparacao>('ocioso');
  private readonly _resultados = signal<ReadonlyMap<number, Comparacao>>(new Map());
  private itensComparados: readonly ItemNota[] = [];

  readonly estado = this._estado.asReadonly();
  readonly resultados = this._resultados.asReadonly();
  readonly economia = computed(() => {
    let total = 0;
    for (const item of this.itensComparados) {
      const r = this._resultados().get(item.n);
      if (r?.tipo === 'mais-barato') total += r.diferenca * item.qtd;
    }
    return Math.round(total * 100) / 100;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.assinatura?.unsubscribe());
  }

  comparar(itens: readonly ItemNota[]): void {
    const local = this.loc.geohash();
    if (!local || this._estado() === 'comparando') return;
    this.itensComparados = itens;
    this._resultados.set(new Map());
    this._estado.set('comparando');
    this.assinatura = from(itens)
      .pipe(
        concatMap((item) => this.compararItem(item, local).pipe(map((r) => [item.n, r] as const))),
        takeWhile(([, r]) => r !== 'indisponivel', true),
        tap(([n, r]) => {
          if (r === 'indisponivel') this._estado.set('indisponivel');
          else this._resultados.update((m) => new Map(m).set(n, r));
        }),
      )
      .subscribe({
        complete: () => {
          if (this._estado() === 'comparando') this._estado.set('concluido');
        },
      });
  }

  private compararItem(item: ItemNota, local: string): Observable<Comparacao | 'indisponivel'> {
    const raioKm = this.loc.raioKm();
    const aproximado = !item.ean;
    const termo = normalizarDescricao(item.descricao);
    if (aproximado && !termo) return of({ tipo: 'sem-codigo' });
    const busca$ = item.ean
      ? this.fonte.porGtin({ gtin: item.ean, local, raioKm })
      : this.fonte.porTermo({ termo, local, raioKm });
    return busca$.pipe(
      map((r) => {
        const candidatas = item.ean
          ? separarDivergentes(r.ofertas, (o) => o.descricao).coerentes
          : equivalentesPorTexto(item.descricao, r.ofertas);
        const menor = [...candidatas].sort((a, b) => a.valor - b.valor)[0];
        if (!menor) return { tipo: 'sem-oferta' } as const;
        const diferenca = Math.round((item.vlUnit - menor.valor) * 100) / 100;
        return diferenca > CENTAVO
          ? ({ tipo: 'mais-barato', diferenca, oferta: menor, aproximado } as const)
          : ({ tipo: 'menor-preco', aproximado } as const);
      }),
      catchError((e: unknown) =>
        of(
          e instanceof FonteIndisponivelError
            ? ('indisponivel' as const)
            : ({ tipo: 'sem-oferta' } as const),
        ),
      ),
    );
  }
}
