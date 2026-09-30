import { normalizarDescricao } from './normalizar';

export const MIN_APELIDO = 2;
export const MAX_APELIDO = 60;

const SUFIXO = /[\s.-]+(?:LTDA|S\/A|S\.A\.?|SA|EIRELI|ME|EPP|MEI|&\s*CIA|E\s+CIA|CIA)\.?\s*$/i;
const PREFIXO = /^[\d\s./-]+/;
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** RF-03. `apelido: null` = sem apelido (vazio ou igual ao nome oficial). A caixa é mantida. */
export function limparApelido(
  bruto: string | null | undefined,
  nomeOficial: string,
): { valido: true; apelido: string | null } | { valido: false } {
  const apelido = (bruto ?? '').trim().replace(/\s+/g, ' ');
  if (!apelido) return { valido: true, apelido: null };
  if (
    /\p{Cc}/u.test(apelido) ||
    apelido.length < MIN_APELIDO ||
    apelido.length > MAX_APELIDO ||
    !/\p{L}/u.test(apelido)
  )
    return { valido: false };
  if (normalizarDescricao(apelido) === normalizarDescricao(nomeOficial))
    return { valido: true, apelido: null };
  return { valido: true, apelido };
}

/** RF-02: apelido → nome fantasia → razão social. */
export function nomeExibido(
  estab: { nome: string; fantasia?: string },
  apelido?: string | null,
): string {
  return apelido || estab.fantasia || estab.nome;
}

function primeiraMaiuscula(texto: string): string {
  return texto
    .split(' ')
    .map((palavra, i) => {
      if (/\d/.test(palavra)) return palavra;
      const minuscula = palavra.toLocaleLowerCase('pt-BR');
      if (i > 0 && CONECTIVOS.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toLocaleUpperCase('pt-BR') + minuscula.slice(1);
    })
    .join(' ');
}

/** RF-05a: razão social limpa, ou null se não sobrar um apelido válido. */
export function sugerirApelido(razaoSocial: string): string | null {
  let texto = razaoSocial.trim().replace(/\s+/g, ' ').replace(PREFIXO, '');
  let anterior: string;
  do {
    anterior = texto;
    texto = texto.replace(SUFIXO, '');
  } while (texto !== anterior);
  const limpo = limparApelido(primeiraMaiuscula(texto.trim()), razaoSocial);
  return limpo.valido ? limpo.apelido : null;
}
