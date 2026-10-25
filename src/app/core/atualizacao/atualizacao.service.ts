import { DOCUMENT, DestroyRef, Injectable, InjectionToken, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter, fromEvent } from 'rxjs';
import { RELOGIO } from '../relogio';

export type AvisoAtualizacao = 'nova-versao' | 'irrecuperavel';
export type ResultadoVerificacao = 'nova-versao' | 'atualizado' | 'indisponivel' | 'erro';

/** Checagem automática (ao abrir e ao voltar para o app) no máximo uma vez por minuto. */
export const INTERVALO_CHECAGEM_MS = 60_000;
/** O `checkForUpdate` espera o service worker; sem ele a promessa nunca resolve. */
export const TEMPO_LIMITE_VERIFICACAO_MS = 20_000;

export const RECARREGAR_PAGINA = new InjectionToken<() => void>('RECARREGAR_PAGINA', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return () => doc.location.reload();
  },
});

/** Hash do `main-*.js` do build em uso (muda a cada versão publicada). */
export function versaoDoBuild(doc: Document): string | null {
  const src = doc.querySelector('script[src*="main-"]')?.getAttribute('src') ?? '';
  return /main-([A-Z0-9]+)\.js/i.exec(src)?.[1]?.slice(0, 8) ?? null;
}

/**
 * A PWA instalada no iOS quase nunca é recarregada do zero: volta da memória sem navegação,
 * e o service worker só procura versão nova quando alguém pede. Por isso a checagem roda ao
 * abrir e toda vez que o app volta a ficar visível.
 */
@Injectable({ providedIn: 'root' })
export class AtualizacaoService {
  private readonly sw = inject(SwUpdate);
  private readonly doc = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly relogio = inject(RELOGIO);
  private readonly recarregar = inject(RECARREGAR_PAGINA);

  private readonly _aviso = signal<AvisoAtualizacao | null>(null);
  private readonly _verificando = signal(false);
  private ultimaChecagem = Number.NEGATIVE_INFINITY;
  private iniciado = false;

  readonly aviso = this._aviso.asReadonly();
  readonly verificando = this._verificando.asReadonly();
  readonly versao = versaoDoBuild(this.doc);

  iniciar(): void {
    if (this.iniciado || !this.sw.isEnabled) return;
    this.iniciado = true;
    this.sw.versionUpdates
      .pipe(
        filter((e) => e.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.marcarNovaVersao());
    this.sw.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this._aviso.set('irrecuperavel'));
    fromEvent(this.doc, 'visibilitychange')
      .pipe(
        filter(() => this.doc.visibilityState === 'visible'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.checarEmSegundoPlano());
    this.checarEmSegundoPlano();
  }

  async verificar(): Promise<ResultadoVerificacao> {
    if (!this.sw.isEnabled) return 'indisponivel';
    if (this._aviso()) return 'nova-versao';
    this._verificando.set(true);
    try {
      const nova = await this.checar();
      if (nova) this.marcarNovaVersao();
      return nova ? 'nova-versao' : 'atualizado';
    } catch {
      return 'erro';
    } finally {
      this._verificando.set(false);
    }
  }

  async atualizar(): Promise<void> {
    if (this.sw.isEnabled && this._aviso() === 'nova-versao') {
      try {
        await this.sw.activateUpdate();
      } catch {
        // O reload abaixo já entrega a versão mais recente que o service worker tiver.
      }
    }
    this.recarregar();
  }

  private checarEmSegundoPlano(): void {
    if (this._aviso() || this._verificando()) return;
    if (this.relogio().getTime() - this.ultimaChecagem < INTERVALO_CHECAGEM_MS) return;
    this.checar().then(
      (nova) => nova && this.marcarNovaVersao(),
      () => undefined,
    );
  }

  private checar(): Promise<boolean> {
    this.ultimaChecagem = this.relogio().getTime();
    return new Promise<boolean>((resolve, reject) => {
      const limite = setTimeout(
        () => reject(new Error('tempo-esgotado')),
        TEMPO_LIMITE_VERIFICACAO_MS,
      );
      this.sw.checkForUpdate().then(
        (nova) => {
          clearTimeout(limite);
          resolve(nova);
        },
        (erro: unknown) => {
          clearTimeout(limite);
          reject(erro);
        },
      );
    });
  }

  private marcarNovaVersao(): void {
    if (this._aviso() !== 'irrecuperavel') this._aviso.set('nova-versao');
  }
}
