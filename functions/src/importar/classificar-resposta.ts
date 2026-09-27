import { extrairChave, validarChave } from '@shared/chave-acesso';
import type { CodigoErroImportacao } from '@shared/model';
import { semAcento } from '@shared/normalizar';

export type Classificacao = 'ok' | { erro: CodigoErroImportacao };

export const JANELA_NAO_CONSTA_MS = 48 * 60 * 60 * 1000;

export interface EntradaClassificacao {
  status: number;
  html: string;
  chave: string;
  agora: Date;
  pareceNota: (html: string) => boolean;
}

/**
 * Última emissão possível da nota: a chave só traz o mês (AAMM), então vale o fim do mês.
 * "Não consta" dentro de 48 h disso pode ser nota recém-emitida ainda não propagada.
 */
function fimDoMesDaChave(chave: string): Date {
  const { anoMes } = extrairChave(chave);
  const ano = 2000 + Number(anoMes.slice(0, 2));
  const mes = Number(anoMes.slice(2, 4));
  return new Date(Date.UTC(ano, mes, 1, 3));
}

/**
 * O portal responde erro com HTTP 200 (análise 6.1), então a classificação é pelo
 * conteúdo. "sefaz-indisponivel" vai para a fila de pendentes; o resto é definitivo.
 */
export function classificarResposta(e: EntradaClassificacao): Classificacao {
  if (e.status >= 500) return { erro: 'sefaz-indisponivel' };
  const t = semAcento(e.html).toLowerCase().replace(/\s+/g, ' ');
  const chaveValida = validarChave(e.chave);

  if (t.includes('genericjdbcexception') || t.includes('getmoreresults')) {
    return { erro: 'sefaz-indisponivel' };
  }
  if (t.includes('qrcode mal formatado')) {
    return { erro: chaveValida ? 'sefaz-indisponivel' : 'url-invalida' };
  }
  if (t.includes('problemas na chave de consulta') || /\b206 - /.test(t)) {
    return { erro: 'sefaz-indisponivel' };
  }
  if (t.includes('nao consta na base')) {
    if (!chaveValida) return { erro: 'nao-encontrada' };
    const recente = e.agora.getTime() - fimDoMesDaChave(e.chave).getTime() < JANELA_NAO_CONSTA_MS;
    return { erro: recente ? 'sefaz-indisponivel' : 'nao-encontrada' };
  }
  if (/\bcancelad[ao]\b/.test(t) && !e.pareceNota(e.html)) return { erro: 'cancelada' };
  if (/nota (fiscal )?cancelada|nfc-e cancelada|situacao: cancelad/.test(t)) {
    return { erro: 'cancelada' };
  }
  if (e.status >= 400) return { erro: 'nao-encontrada' };
  if (!e.pareceNota(e.html)) return { erro: 'layout-inesperado' };
  return 'ok';
}
