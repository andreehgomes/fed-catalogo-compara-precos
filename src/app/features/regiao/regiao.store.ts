import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import {
  Categoria,
  FonteIndisponivelError,
  FontePrecosRegiao,
  OfertaRegiao,
  ResultadoBusca,
} from './data-access/fonte-precos-regiao';
import { LocalizacaoStore } from './localizacao/localizacao.store';

export const TAMANHO_PAGINA = 29;

export type Busca =
  { tipo: 'gtin'; valor: string } | { tipo: 'termo'; valor: string; categoria: number | null };

interface Consulta {
  busca: Busca;
  local: string;
  raioKm: number;
}

function unirSemRepetir(
  atual: readonly OfertaRegiao[],
  novas: readonly OfertaRegiao[],
): OfertaRegiao[] {
  const ids = new Set(atual.map((o) => o.id));
  return [...atual, ...novas.filter((o) => !ids.has(o.id))];
}

/** Estado de uma busca na região. Provido por tela (não é singleton). */
@Injectable()
export class RegiaoStore {
  private readonly fonte = inject(FontePrecosRegiao);
  private readonly loc = inject(LocalizacaoStore);

  private readonly _busca = signal<Busca | null>(null);
  readonly busca = this._busca.asReadonly();

  private readonly consulta = computed<Consulta | undefined>(() => {
    const busca = this._busca();
    const local = this.loc.geohash();
    if (!busca || !busca.valor || !local) return undefined;
    return { busca, local, raioKm: this.loc.raioKm() };
  });

  private readonly primeira = rxResource<ResultadoBusca, Consulta | undefined>({
    params: () => this.consulta(),
    stream: ({ params }) => this.primeiraPagina(params),
  });

  readonly categorias = rxResource<Categoria[], Consulta | undefined>({
    params: () => {
      const c = this.consulta();
      return c?.busca.tipo === 'termo' ? c : undefined;
    },
    stream: ({ params }) =>
      this.fonte.categorias({
        termo: params.busca.valor,
        local: params.local,
        raioKm: params.raioKm,
      }),
  });

  private readonly extras = linkedSignal<Consulta | undefined, OfertaRegiao[]>({
    source: this.consulta,
    computation: () => [],
  });
  private readonly proximoOffset = linkedSignal<Consulta | undefined, number>({
    source: this.consulta,
    computation: () => TAMANHO_PAGINA,
  });
  private readonly _carregandoMais = signal(false);
  private readonly _erroMais = signal(false);
  private readonly _esgotado = linkedSignal<Consulta | undefined, boolean>({
    source: this.consulta,
    computation: () => false,
  });

  readonly carregando = computed(() => this.primeira.isLoading());
  readonly carregandoMais = this._carregandoMais.asReadonly();
  readonly indisponivel = computed(
    () => this.primeira.error() instanceof FonteIndisponivelError || this._erroMais(),
  );
  readonly erroInesperado = computed(() => {
    const e = this.primeira.error();
    return !!e && !(e instanceof FonteIndisponivelError);
  });
  readonly resultado = computed(() => (this.primeira.hasValue() ? this.primeira.value() : null));
  readonly ofertas = computed(() => unirSemRepetir(this.resultado()?.ofertas ?? [], this.extras()));
  readonly total = computed(() => this.resultado()?.total ?? 0);
  readonly temMais = computed(
    () => !!this.resultado() && !this._esgotado() && this.proximoOffset() < this.total(),
  );

  buscar(busca: Busca | null): void {
    this._erroMais.set(false);
    this._busca.set(busca);
  }

  tentarDeNovo(): void {
    this._erroMais.set(false);
    this.primeira.reload();
  }

  carregarMais(): void {
    const consulta = this.consulta();
    if (!consulta || this._carregandoMais() || !this.temMais() || this.indisponivel()) return;
    this._carregandoMais.set(true);
    const offset = this.proximoOffset();
    this.buscar$(consulta, offset).subscribe({
      next: (r) => {
        const vistos = new Set(this.ofertas().map((o) => o.id));
        const novas = r.ofertas.filter((o) => !vistos.has(o.id));
        this.extras.update((atual) => [...atual, ...novas]);
        this.proximoOffset.set(offset + TAMANHO_PAGINA);
        if (r.ofertas.length === 0) this._esgotado.set(true);
        this._carregandoMais.set(false);
      },
      error: () => {
        this._erroMais.set(true);
        this._carregandoMais.set(false);
      },
    });
  }

  private primeiraPagina(params: Consulta | undefined): Observable<ResultadoBusca> {
    return params
      ? this.buscar$(params, 0)
      : of({ total: 0, min: null, max: null, ofertas: [], descartados: 0 });
  }

  private buscar$(c: Consulta, offset: number): Observable<ResultadoBusca> {
    return c.busca.tipo === 'gtin'
      ? this.fonte.porGtin({ gtin: c.busca.valor, local: c.local, raioKm: c.raioKm, offset })
      : this.fonte.porTermo({
          termo: c.busca.valor,
          categoria: c.busca.categoria,
          local: c.local,
          raioKm: c.raioKm,
          offset,
        });
  }
}
