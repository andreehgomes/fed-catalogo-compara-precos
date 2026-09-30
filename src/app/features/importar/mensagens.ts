import { extrairChave, lerUrlQr, limparChave, validarChave } from '@shared/chave-acesso';
import type { CodigoErroImportacao, ErroImportacao, PreviewEntrada } from '@shared/model';

export type AcaoErro = 'ler-de-novo' | 'abrir-nota' | 'guardar' | 'abrir-scanner' | 'entrar' | null;

export interface MensagemErro {
  texto: string;
  acao: AcaoErro;
}

export const MENSAGENS: Readonly<Record<CodigoErroImportacao, MensagemErro>> = {
  'url-invalida': { texto: 'Esse QR Code não é de uma NFC-e.', acao: 'ler-de-novo' },
  'uf-nao-suportada': { texto: 'Por enquanto só notas do Paraná.', acao: null },
  'chave-invalida': {
    texto: 'Essa chave não é válida. Confira os 44 dígitos impressos no cupom.',
    acao: null,
  },
  'chave-sem-qr': {
    texto: 'Com a chave sozinha não deu. Leia o QR do cupom.',
    acao: 'abrir-scanner',
  },
  'ja-importada': { texto: 'Você já importou essa nota.', acao: 'abrir-nota' },
  'sefaz-indisponivel': { texto: 'O site da SEFAZ-PR está fora do ar agora.', acao: 'guardar' },
  'nao-encontrada': {
    texto: 'A SEFAZ-PR não encontrou essa nota. Confira se o cupom é recente e do Paraná.',
    acao: null,
  },
  cancelada: {
    texto: 'Essa nota foi cancelada pelo mercado e não pode ser importada.',
    acao: null,
  },
  'layout-inesperado': {
    texto: 'Não conseguimos ler essa nota. Já registramos o problema.',
    acao: 'guardar',
  },
  'rate-limit': { texto: 'Muitas importações seguidas. Tente em alguns minutos.', acao: null },
  'preview-expirado': { texto: 'A prévia expirou. Leia o QR de novo.', acao: 'ler-de-novo' },
  'nao-autenticado': { texto: 'Sua sessão expirou. Entre de novo.', acao: 'entrar' },
  'apelido-invalido': {
    texto: 'Esse nome não serve. Use de 2 a 60 caracteres, com letras.',
    acao: null,
  },
  desconhecido: { texto: 'Algo deu errado. Tente de novo em instantes.', acao: null },
};

export function mensagemDe(erro: ErroImportacao): MensagemErro {
  if (estabelecimentoAtualizado(erro)) {
    return {
      texto: 'Você já importou essa nota. Aproveitamos para atualizar os dados do estabelecimento.',
      acao: 'abrir-nota',
    };
  }
  return MENSAGENS[erro.codigo] ?? MENSAGENS.desconhecido;
}

export function estabelecimentoAtualizado(erro: ErroImportacao): boolean {
  return erro.codigo === 'ja-importada' && !!erro.estabelecimentoAtualizado;
}

export type Interpretacao =
  { ok: true; entrada: PreviewEntrada } | { ok: false; erro: ErroImportacao };

function ufDaChaveNaUrl(texto: string): string | null {
  const m = /[?&]p=(\d{44})/.exec(decodeURIComponent(texto));
  return m && validarChave(m[1]) ? String(extrairChave(m[1]).uf) : null;
}

/** Validação local, antes de qualquer chamada: DV inválido nunca chega à function. */
export function interpretarEntrada(bruto: string): Interpretacao {
  const texto = bruto.trim();
  const digitos = limparChave(texto);
  if (/^[\d\s.-]+$/.test(texto)) {
    if (digitos.length !== 44 || !validarChave(digitos))
      return { ok: false, erro: { codigo: 'chave-invalida' } };
    if (extrairChave(digitos).uf !== 'PR')
      return { ok: false, erro: { codigo: 'uf-nao-suportada' } };
    return { ok: true, entrada: { chave: digitos } };
  }
  if (lerUrlQr(texto)) return { ok: true, entrada: { url: texto } };
  const uf = ufDaChaveNaUrl(texto);
  if (uf && uf !== 'PR') return { ok: false, erro: { codigo: 'uf-nao-suportada' } };
  return { ok: false, erro: { codigo: 'url-invalida' } };
}
