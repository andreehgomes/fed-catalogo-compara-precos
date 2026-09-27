import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { formatarChave, formatarCnpj } from '@shared/chave-acesso';
import type { Nota } from '@shared/model';
import { firstValueFrom } from 'rxjs';
import { BadgePreco } from '../../../shared/ui/badge-preco/badge-preco';
import { ConfirmDialog, DadosConfirmacao } from '../../../shared/ui/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { FontePrecoInfo } from '../../../shared/ui/fonte-preco/fonte-preco';
import { Preco } from '../../../shared/ui/preco/preco';
import { LocalizacaoSeletor } from '../../regiao/localizacao/localizacao-seletor';
import { LocalizacaoStore } from '../../regiao/localizacao/localizacao.store';
import { formatarDistancia } from '../../regiao/ui/oferta-row';
import { NotasAbertasService } from '../data-access/notas-abertas.service';
import { NotasService } from '../data-access/notas.service';
import { MaisBaratoPerto } from './mais-barato-perto';

@Component({
  selector: 'cp-nota-detalhe',
  imports: [
    BadgePreco,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    EmptyState,
    FontePrecoInfo,
    LocalizacaoSeletor,
    MatIconModule,
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
  protected readonly comparacao = inject(MaisBaratoPerto);
  protected readonly loc = inject(LocalizacaoStore);

  readonly chave = input.required<string>();

  protected readonly nota = rxResource<Nota | null, string>({
    params: () => this.chave(),
    stream: ({ params }) => this.service.obter(params),
  });
  protected readonly escolhendoLocal = signal(false);
  protected readonly excluindo = signal(false);

  protected readonly dados = computed(() => (this.nota.hasValue() ? this.nota.value() : null));
  protected readonly cnpj = computed(() => formatarCnpj(this.dados()?.cnpj ?? ''));
  protected readonly chaveFormatada = computed(() => formatarChave(this.chave()));
  protected readonly comEan = computed(
    () => (this.dados()?.itens ?? []).filter((i) => !!i.ean).length,
  );
  protected readonly distancia = formatarDistancia;

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
    this.comparacao.comparar(n.itens);
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
      await this.router.navigate(['/notas']);
      this.snack.open('Nota excluída', 'OK', { duration: 3000 });
    } catch {
      this.snack.open('Não foi possível excluir agora.', 'OK', { duration: 4000 });
    } finally {
      this.excluindo.set(false);
    }
  }
}
