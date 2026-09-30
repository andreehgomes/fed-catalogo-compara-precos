import type { Etiquetas } from './etiquetas';

export type Uf = 'PR';

export type TpAmb = '1' | '2';

export interface ChaveInfo {
  chave: string;
  uf: Uf | string;
  cUf: string;
  anoMes: string;
  cnpj: string;
  modelo: '65' | '55' | string;
  serie: string;
  numero: string;
  tpEmis: string;
}

export interface QrNfce {
  chave: string;
  versao: 2 | 3;
  tpAmb: TpAmb;
  uf: Uf | string;
  cIdToken?: string;
  hash?: string;
}

export interface ItemNfce {
  n: number;
  descricao: string;
  codigo: string;
  ean: string | null;
  qtd: number;
  unidade: string;
  vlUnit: number;
  vlTotal: number;
}

export interface Emitente {
  cnpj: string;
  nome: string;
  fantasia?: string;
  endereco: string;
  cidade: string;
  uf: string;
  /** Só entre a prévia e a gravação: presente quando o CNPJ foi consultado agora. */
  fantasiaConsultadaEm?: DataIso;
}

/** Datas sempre em ISO 8601 UTC (`toISOString()`), para ordenar como texto. */
export type DataIso = string;

export interface NfceParsed {
  chave: string;
  emitente: Emitente;
  emissao: DataIso;
  itens: ItemNfce[];
  total: number;
  desconto: number;
}

export type ProdutoId = `ean:${string}` | `loc:${string}:${string}`;

export type FontePreco = 'minhas-notas' | 'comunidade' | 'menor-preco';

export type StatusPendente = 'aguardando' | 'falhou';

export type UnidadeBase = 'kg' | 'L' | 'un';

export interface Conteudo {
  quantidade: number;
  unidadeBase: UnidadeBase;
}

export interface PrecoPorUnidade {
  valor: number;
  unidade: UnidadeBase;
}

export interface ItemNota extends ItemNfce {
  produtoId: ProdutoId;
  precoPorUnidadeBase: PrecoPorUnidade | null;
}

/** `usuarios/{uid}/notas/{chave}` — privado. */
export interface Nota {
  chave: string;
  cnpj: string;
  estabelecimentoNome: string;
  estabelecimentoCidade: string;
  emissao: DataIso;
  total: number;
  desconto: number;
  qtdItens: number;
  itens: ItemNota[];
  importadaEm: DataIso;
  veioDaFila?: boolean;
  aberta?: boolean;
}

export type NotaResumo = Omit<Nota, 'itens'>;

/** `usuarios/{uid}/pendentes/{chave}` — privado, gravado só pelas Functions. */
export interface Pendente {
  chave: string;
  url: string;
  status: StatusPendente;
  tentativas: number;
  proximaTentativa: DataIso;
  ultimoErro: CodigoErroImportacao | null;
  criadaEm: DataIso;
  /** Última retentativa manual: reabre a janela de 7 dias. */
  retentadaEm?: DataIso;
}

/** `estabelecimentos/{cnpj}` — compartilhado. */
export interface Estabelecimento {
  cnpj: string;
  nome: string;
  fantasia?: string;
  endereco: string;
  cidade: string;
  uf: string;
  atualizadoEm: DataIso;
  /** Última consulta do CNPJ na Receita (cache do nome fantasia, revalidado a cada 180 dias). */
  fantasiaConsultadaEm?: DataIso;
}

/** `usuarios/{uid}/estabelecimentos/{cnpj}` — privado, gravado só pelas Functions. */
export interface ApelidoEstabelecimento {
  cnpj: string;
  apelido: string;
  atualizadoEm: DataIso;
}

export interface Observacao {
  cnpj: string;
  vlUnit: number;
  emissao: DataIso;
}

/** `produtos/{produtoId}` — compartilhado. */
export interface Produto {
  id: ProdutoId;
  ean: string | null;
  descricao: string;
  descricaoNorm: string;
  tokens: string[];
  conteudo: Conteudo | null;
  vinculadoA: ProdutoId | null;
  menorPreco: Observacao | null;
  ultimaObservacao: Observacao | null;
  /** CNPJs onde o produto já foi visto (até 50), para contar estabelecimentos sem consulta. */
  cnpjs?: string[];
  vinculoOrigem?: 'manual' | 'auto';
  /** Como o vínculo automático decidiu: regra das etiquetas ou IA. */
  vinculoMotivo?: 'etiquetas' | 'ia' | 'manual';
  /** Desvinculado à mão: o vínculo automático não mexe mais nele. */
  vinculoBloqueado?: boolean;
  /** GTINs concorrentes achados no Menor Preço, para o usuário escolher. */
  sugestoesEan?: SugestaoEan[];
  etiquetas?: Etiquetas;
  /** `tipo|marca|tamanho` das etiquetas, no topo para a consulta de candidatos. */
  bloco?: string | null;
  /** Produtos que a IA achou possíveis mas não soube escolher (até 3). */
  candidatosVinculo?: ProdutoId[];
}

export interface SugestaoEan {
  gtin: string;
  descricao: string;
  lojas: number;
}

/** `precos/{chave}_{n}` — compartilhado e anônimo: nunca uid nem referência ao usuário. */
export interface Preco {
  produtoId: ProdutoId;
  cnpj: string;
  vlUnit: number;
  unidade: string;
  precoPorUnidadeBase: PrecoPorUnidade | null;
  emissao: DataIso;
}

export type CodigoErroImportacao =
  | 'url-invalida'
  | 'uf-nao-suportada'
  | 'chave-invalida'
  | 'chave-sem-qr'
  | 'nao-encontrada'
  | 'cancelada'
  | 'sefaz-indisponivel'
  | 'layout-inesperado'
  | 'rate-limit'
  | 'ja-importada'
  | 'preview-expirado'
  | 'nao-autenticado'
  | 'apelido-invalido'
  | 'desconhecido';

export type ErroImportacao =
  | { codigo: 'ja-importada'; chave: string; estabelecimentoAtualizado?: true }
  | { codigo: Exclude<CodigoErroImportacao, 'ja-importada'>; chave?: string };

export interface PreviewEntrada {
  url?: string;
  chave?: string;
}

export type PreviewResposta =
  { ok: true; nota: NfceParsed; apelido?: string } | { ok: false; erro: ErroImportacao };

export type ConfirmarResposta = { ok: true; chave: string } | { ok: false; erro: ErroImportacao };

export type EnfileirarResposta =
  { ok: true; chave: string; proximaTentativa: DataIso } | { ok: false; erro: ErroImportacao };

export interface DefinirApelidoEntrada {
  cnpj?: string;
  apelido?: string | null;
}

export type DefinirApelidoResposta =
  | { ok: true; apelido: string | null; notasAtualizadas: number }
  | { ok: false; erro: ErroImportacao };
