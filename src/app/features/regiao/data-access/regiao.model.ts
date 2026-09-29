export interface EstabelecimentoOferta {
  nome: string;
  razaoSocial: string;
  endereco: string;
  bairro: string;
  municipio: string;
}

export interface OfertaRegiao {
  id: string;
  descricao: string;
  gtin: string | null;
  valor: number;
  valorTabela: number;
  desconto: number;
  dataHora: Date;
  distanciaKm: number;
  estabelecimento: EstabelecimentoOferta;
}

export interface ResultadoBusca {
  total: number;
  min: number | null;
  max: number | null;
  ofertas: OfertaRegiao[];
  descartados: number;
}

export interface Categoria {
  id: number;
  desc: string;
  qtd: number;
}

export interface ConsultaGtin {
  gtin: string;
  local: string;
  raioKm: number;
  offset?: number;
}

export interface ConsultaTermo {
  termo: string;
  categoria?: number | null;
  local: string;
  raioKm: number;
  offset?: number;
}

export type MotivoIndisponivel = 'rede' | 'timeout' | 'http' | 'formato' | 'bloqueado';

export class FonteIndisponivelError extends Error {
  constructor(
    readonly motivo: MotivoIndisponivel,
    readonly causa?: unknown,
  ) {
    super(`Menor Preço indisponível (${motivo})`);
    this.name = 'FonteIndisponivelError';
  }
}
