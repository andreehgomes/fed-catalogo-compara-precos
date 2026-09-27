import type { CodigoErroImportacao, ErroImportacao } from '@shared/model';

export class ErroNegocio extends Error {
  constructor(
    readonly codigo: CodigoErroImportacao,
    mensagem?: string,
    readonly chave?: string,
  ) {
    super(mensagem ?? codigo);
    this.name = 'ErroNegocio';
  }

  paraResposta(): ErroImportacao {
    if (this.codigo === 'ja-importada') return { codigo: 'ja-importada', chave: this.chave ?? '' };
    return this.chave ? { codigo: this.codigo, chave: this.chave } : { codigo: this.codigo };
  }
}

export class SefazIndisponivelError extends ErroNegocio {
  constructor(
    mensagem = 'SEFAZ indisponível',
    readonly causa?: unknown,
  ) {
    super('sefaz-indisponivel', mensagem);
  }
}

export class UrlBloqueadaError extends ErroNegocio {
  constructor(mensagem = 'URL fora da allowlist') {
    super('url-invalida', mensagem);
  }
}

export class LayoutInesperadoError extends ErroNegocio {
  constructor(mensagem = 'Layout inesperado') {
    super('layout-inesperado', mensagem);
  }
}

export function paraErroImportacao(e: unknown): ErroImportacao {
  return e instanceof ErroNegocio ? e.paraResposta() : { codigo: 'desconhecido' };
}
