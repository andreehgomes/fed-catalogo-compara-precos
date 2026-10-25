import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  ARMAZENAMENTO_TEMA,
  ArmazenamentoTema,
  CHAVE_TEMA,
  PREFERE_ESCURO,
  PreferenciaTema,
} from './tema-ambiente';

function lerPreferencia(armazenamento: ArmazenamentoTema | null): PreferenciaTema {
  try {
    const valor = armazenamento?.getItem(CHAVE_TEMA);
    return valor === 'claro' || valor === 'escuro' ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

/**
 * Espelha o script inline do `index.html`: `data-tema` no `<html>` e a `media` das duas
 * `<meta name="theme-color" data-tema>` (as cores ficam só lá).
 */
export function aplicarTema(doc: Document, preferencia: PreferenciaTema): void {
  const raiz = doc.documentElement;
  if (preferencia === 'sistema') delete raiz.dataset['tema'];
  else raiz.dataset['tema'] = preferencia;
  doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-tema]').forEach((meta) => {
    const tema = meta.dataset['tema'];
    meta.media =
      preferencia === 'sistema'
        ? `(prefers-color-scheme: ${tema === 'escuro' ? 'dark' : 'light'})`
        : tema === preferencia
          ? 'all'
          : 'not all';
  });
}

@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly doc = inject(DOCUMENT);
  private readonly armazenamento = inject(ARMAZENAMENTO_TEMA);
  private readonly prefereEscuro = inject(PREFERE_ESCURO);

  private readonly _preferencia = signal(lerPreferencia(this.armazenamento));

  readonly preferencia = this._preferencia.asReadonly();
  readonly escuro = computed(() => {
    const p = this._preferencia();
    return p === 'sistema' ? this.prefereEscuro() : p === 'escuro';
  });

  constructor() {
    effect(() => aplicarTema(this.doc, this._preferencia()));
  }

  definir(preferencia: PreferenciaTema): void {
    this._preferencia.set(preferencia);
    try {
      if (preferencia === 'sistema') this.armazenamento?.removeItem(CHAVE_TEMA);
      else this.armazenamento?.setItem(CHAVE_TEMA, preferencia);
    } catch {
      // Sem armazenamento (aba privada, cota): vale só nesta sessão.
    }
  }
}
