import { Injectable, inject } from '@angular/core';
import type {
  CodigoErroImportacao,
  ConfirmarResposta,
  EnfileirarResposta,
  ErroImportacao,
  NfceParsed,
  PreviewEntrada,
  PreviewResposta,
} from '@shared/model';
import { CHAMAR_FUNCTION } from '../../../core/firebase/callable';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: ErroImportacao };

const POR_CODIGO_FUNCTIONS: Readonly<
  Record<string, Exclude<CodigoErroImportacao, 'ja-importada'>>
> = {
  'functions/unauthenticated': 'nao-autenticado',
  'functions/resource-exhausted': 'rate-limit',
  'functions/unavailable': 'sefaz-indisponivel',
  'functions/deadline-exceeded': 'sefaz-indisponivel',
};

/** Converte `FunctionsError` (ou falha de rede) em `ErroImportacao`. */
export function erroDeFunctions(e: unknown): ErroImportacao {
  const codigo = (e as { code?: unknown } | null)?.code;
  return { codigo: (typeof codigo === 'string' && POR_CODIGO_FUNCTIONS[codigo]) || 'desconhecido' };
}

/** Único ponto da feature que conhece as callables. */
@Injectable({ providedIn: 'root' })
export class ImportarService {
  private readonly chamar = inject(CHAMAR_FUNCTION);

  preview(entrada: PreviewEntrada): Promise<Resultado<NfceParsed>> {
    return this.executar<PreviewResposta, NfceParsed>('previewNfce', entrada, (r) =>
      r.ok ? { ok: true, valor: r.nota } : r,
    );
  }

  confirmar(chave: string): Promise<Resultado<string>> {
    return this.executar<ConfirmarResposta, string>('confirmarNfce', { chave }, (r) =>
      r.ok ? { ok: true, valor: r.chave } : r,
    );
  }

  enfileirar(
    entrada: PreviewEntrada,
  ): Promise<Resultado<{ chave: string; proximaTentativa: string }>> {
    return this.executar<EnfileirarResposta, { chave: string; proximaTentativa: string }>(
      'enfileirarNfce',
      entrada,
      (r) =>
        r.ok ? { ok: true, valor: { chave: r.chave, proximaTentativa: r.proximaTentativa } } : r,
    );
  }

  retentar(chave: string): Promise<Resultado<string>> {
    return this.executar<EnfileirarResposta, string>('retentarPendente', { chave }, (r) =>
      r.ok ? { ok: true, valor: r.proximaTentativa } : r,
    );
  }

  private async executar<R extends { ok: boolean }, T>(
    nome: string,
    dados: unknown,
    mapear: (r: R) => Resultado<T>,
  ): Promise<Resultado<T>> {
    try {
      const resposta = await this.chamar<R>(nome, dados);
      if (!resposta || typeof resposta !== 'object' || !('ok' in resposta)) {
        return { ok: false, erro: { codigo: 'desconhecido' } };
      }
      return mapear(resposta);
    } catch (e) {
      return { ok: false, erro: erroDeFunctions(e) };
    }
  }
}
