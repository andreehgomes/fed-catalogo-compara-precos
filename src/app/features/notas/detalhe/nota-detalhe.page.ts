import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { formatarChave, formatarCnpj } from '@shared/chave-acesso';
import type { Nota } from '@shared/model';
import { firstValueFrom } from 'rxjs';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { ConfirmDialog, DadosConfirmacao } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { Preco } from '../../../shared/ui/preco/preco';
import { ListasStore } from '../../listas/data-access/listas.store';
import { LocalizacaoSeletor } from '../../regiao/localizacao/localizacao-seletor';
import { LocalizacaoStore } from '../../regiao/localizacao/localizacao.store';
import { formatarDistancia } from '../../regiao/ui/oferta-row';
import { HistoricoPessoalStore } from '../data-access/historico-pessoal.store';
import { NotasAbertasService } from '../data-access/notas-abertas.service';
import { NotasService } from '../data-access/notas.service';
import { HistoricoItem } from './historico-item';
import {
  ComparacaoHistorico,
  FILTROS_HISTORICO,
  FiltroHistorico,
  JANELA_MELHOR_PRECO_DIAS,
  consolidarItens,
  contarPorFiltro,
  filtrarItens,
  resumirHistorico,
} from './historico-pessoal';
import { MaisBaratoPerto } from './mais-barato-perto';

const ROTULOS_FILTRO: Record<FiltroHistorico, string> = {
  todos: 'Todos',
  acima: 'Acima do melhor',
  melhor: 'Melhor preço',
  primeira: 'Primeira compra',
};

const SEM_HISTORICO: ReadonlyMap<number, ComparacaoHistorico> = new Map();

@Component({
  selector: 'cp-nota-detalhe',
  imports: [
    BadgePreco,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    EmptyState,
    FontePrecoInfo,
    HistoricoItem,
    LocalizacaoSeletor,
    MatIconModule,
    MatTooltipModule,
    Preco,
    RouterLink,
  ],
  templateUrl: './nota-detalhe.page.html',
  styleUrl: './nota-detalhe.page.scss',
  providers: [MaisBaratoPerto],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NotaDetalhePage {
  private readonly service = inject(NotasService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly historicoStore = inject(HistoricoPessoalStore);
  protected readonly comparacao = inject(MaisBaratoPerto);
  protected readonly loc = inject(LocalizacaoStore);
  protected readonly listas = inject(ListasStore);

  readonly chave = input.required<string>();
  /** Filtro da lista em `?itens=`. */
  readonly itens = input<string | undefined>();

  protected readonly nota = rxResource<Nota | null, string>({
    params: () => this.chave(),
    stream: ({ params }) => this.service.obter(params),
  });
  protected readonly escolhendoLocal = signal(false);
  protected readonly excluindo = signal(false);

  protected readonly dados = computed(() => (this.nota.hasValue() ? this.nota.value() : null));
  protected readonly cnpj = computed(() => formatarCnpj(this.dados()?.cnpj ?? ''));
  protected readonly chaveFormatada = computed(() => formatarChave(this.chave()));
  /** Lançamentos repetidos do mesmo produto e preço viram uma linha. */
  protected readonly itensConsolidados = computed(() => consolidarItens(this.dados()?.itens ?? []));
  protected readonly comEan = computed(
    () => this.itensConsolidados().filter((i) => !!i.ean).length,
  );
  protected readonly distancia = formatarDistancia;

  protected readonly historico = resource({
    params: () => this.dados() ?? undefined,
    loader: ({ params }) => this.historicoStore.comparar(params),
  });
  protected readonly comparacoes = computed(() =>
    this.historico.hasValue() ? this.historico.value() : SEM_HISTORICO,
  );
  protected readonly resumo = computed(() => {
    const n = this.dados();
    return n && this.historico.hasValue()
      ? resumirHistorico(this.itensConsolidados(), this.historico.value())
      : null;
  });
  protected readonly filtros = FILTROS_HISTORICO.map((valor) => ({
    valor,
    rotulo: ROTULOS_FILTRO[valor],
  }));
  protected readonly filtro = computed<FiltroHistorico>(() => {
    const f = this.itens();
    return FILTROS_HISTORICO.includes(f as FiltroHistorico) ? (f as FiltroHistorico) : 'todos';
  });
  protected readonly contagens = computed(() =>
    contarPorFiltro(this.itensConsolidados(), this.comparacoes()),
  );
  protected readonly itensVisiveis = computed(() =>
    filtrarItens(this.itensConsolidados(), this.comparacoes(), this.filtro()),
  );
  protected readonly janela = JANELA_MELHOR_PRECO_DIAS;

  constructor() {
    const abertas = inject(NotasAbertasService);
    effect(() => {
      const n = this.dados();
      if (n?.veioDaFila) abertas.marcar(n.chave);
    });
  }

  protected compararComMercados(): void {
    const n = this.dados();
    if (!n) return;
    if (!this.loc.pronta()) {
      this.escolhendoLocal.set(true);
      return;
    }
    this.escolhendoLocal.set(false);
    this.comparacao.comparar(this.itensConsolidados());
  }

  protected filtrar(filtro: FiltroHistorico): Promise<boolean> {
    return this.router.navigate([], {
      queryParams: { itens: filtro === 'todos' ? null : filtro },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** RF-14: nota importada sem passar pela lista também pode ser conferida. */
  protected async conferirComLista(): Promise<void> {
    const listas = this.listas.listas();
    let id = listas.length === 1 ? listas[0].id : null;
    if (listas.length > 1) {
      const r = await this.listas.escolher({
        listas,
        podeCriar: false,
        titulo: 'Conferir com qual lista?',
        confirmar: 'Conferir',
      });
      id = r && 'id' in r ? r.id : null;
    }
    if (id) {
      await this.router.navigate(['/listas', id, 'conferir'], {
        queryParams: { chave: this.chave() },
      });
    }
  }

  protected async copiarChave(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.chave());
      this.snack.open('Chave copiada', 'OK', { duration: 2500 });
    } catch {
      this.snack.open('Não foi possível copiar.', 'OK', { duration: 3000 });
    }
  }

  protected async excluir(): Promise<void> {
    const dados: DadosConfirmacao = {
      titulo: 'Excluir esta nota?',
      mensagem:
        'A nota sai da sua conta. Os preços dela continuam na comparação, sem nenhuma ligação com você.',
      confirmar: 'Excluir nota',
      perigo: true,
    };
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialog, { data: dados, maxWidth: '420px' }).afterClosed(),
    );
    if (!ok) return;
    this.excluindo.set(true);
    try {
      await this.service.excluir(this.chave());
      this.historicoStore.invalidar();
      await this.router.navigate(['/notas']);
      this.snack.open('Nota excluída', 'OK', { duration: 3000 });
    } catch {
      this.snack.open('Não foi possível excluir agora.', 'OK', { duration: 4000 });
    } finally {
      this.excluindo.set(false);
    }
  }
}
