import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { formatarChave, limparChave } from '@shared/chave-acesso';
import { ConexaoService } from '../../core/layout/conexao.service';
import { Scanner } from '../../shared/ui/scanner/scanner';
import { ListasStore } from '../listas/data-access/listas.store';
import { PendentesBloco } from '../notas/ui/pendentes-bloco';
import { ImportarStore } from './importar.store';
import { AcaoErro, mensagemDe } from './mensagens';

type Origem = 'scanner' | 'url' | 'chave';

@Component({
  selector: 'cp-importar',
  imports: [FormField, MatIconModule, PendentesBloco, Scanner],
  templateUrl: './importar.page.html',
  styleUrl: './importar.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ImportarPage {
  protected readonly store = inject(ImportarStore);
  protected readonly conexao = inject(ConexaoService);
  private readonly router = inject(Router);
  private readonly listas = inject(ListasStore);

  /** `?lista=<id>`: a nota vai ser conferida com essa lista de compras (RF-09). */
  readonly lista = input<string>();

  protected readonly nomeDaLista = computed(() => {
    const id = this.store.lista();
    return id ? (this.listas.listas().find((l) => l.id === id)?.nome ?? 'de compras') : null;
  });
  protected readonly jaImportadaComLista = computed(() => {
    const e = this.store.estado();
    return !!this.store.lista() && e.tipo === 'erro' && e.erro.codigo === 'ja-importada';
  });

  protected readonly lendo = signal(false);
  protected readonly origem = signal<Origem | null>(null);
  protected readonly chave = signal('');
  protected readonly colarIndisponivel = signal(false);
  protected readonly formUrl = form(signal({ url: '' }));

  protected readonly erro = computed(() => {
    const e = this.store.estado();
    return e.tipo === 'erro' ? e.erro : null;
  });
  protected readonly mensagem = computed(() => {
    const e = this.erro();
    return e ? mensagemDe(e) : null;
  });
  protected readonly erroLocal = computed(() => {
    const e = this.store.estado();
    return e.tipo === 'erro' && !e.entrada ? mensagemDe(e.erro).texto : null;
  });
  protected readonly qtdDigitos = computed(() => limparChave(this.chave()).length);

  constructor() {
    this.store.reiniciar();
    effect(() => this.store.definirLista(this.lista() ?? null));
  }

  protected naoConferir(): void {
    void this.router.navigate([], { queryParams: { lista: null }, replaceUrl: true });
  }

  protected async conferirComLista(): Promise<void> {
    const e = this.store.estado();
    const lista = this.store.lista();
    if (e.tipo === 'erro' && e.erro.codigo === 'ja-importada' && lista) {
      await this.router.navigate(['/listas', lista, 'conferir'], {
        queryParams: { chave: e.erro.chave },
      });
    }
  }

  protected abrirScanner(): void {
    this.store.reiniciar();
    this.lendo.set(true);
  }

  protected async qrLido(valor: string): Promise<void> {
    this.lendo.set(false);
    this.origem.set('scanner');
    await this.store.importarTexto(valor);
  }

  protected async colar(): Promise<void> {
    try {
      const texto = (await navigator.clipboard.readText()).trim();
      this.formUrl.url().value.set(texto);
      if (texto) await this.importarUrl();
    } catch {
      this.colarIndisponivel.set(true);
    }
  }

  protected async importarUrl(): Promise<void> {
    this.origem.set('url');
    await this.store.importarTexto(this.formUrl.url().value());
  }

  protected digitarChave(evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const formatado = formatarChave(limparChave(campo.value).slice(0, 44));
    this.chave.set(formatado);
    campo.value = formatado;
  }

  protected async importarChave(): Promise<void> {
    this.origem.set('chave');
    await this.store.importarTexto(this.chave());
  }

  protected async executarAcao(acao: AcaoErro): Promise<void> {
    const e = this.store.estado();
    switch (acao) {
      case 'ler-de-novo':
      case 'abrir-scanner':
        this.abrirScanner();
        break;
      case 'abrir-nota':
        if (e.tipo === 'erro' && e.erro.codigo === 'ja-importada') {
          await this.router.navigate(['/notas', e.erro.chave]);
        }
        break;
      case 'guardar':
        await this.store.guardar();
        break;
      case 'entrar':
        await this.router.navigate(['/login'], { queryParams: { voltar: '/importar' } });
        break;
    }
  }

  protected rotuloAcao(acao: AcaoErro): string {
    switch (acao) {
      case 'ler-de-novo':
        return 'Ler de novo';
      case 'abrir-nota':
        return 'Abrir a nota';
      case 'guardar':
        return 'Guardar e importar quando voltar';
      case 'abrir-scanner':
        return 'Ler o QR Code';
      case 'entrar':
        return 'Entrar';
      default:
        return '';
    }
  }
}
