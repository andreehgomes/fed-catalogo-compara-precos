import type { Estabelecimento } from './model';
import { normalizarDescricao } from './normalizar';

export const REVALIDAR_FANTASIA_DIAS = 180;
export const MAX_FANTASIA = 120;

const DIA_MS = 24 * 60 * 60 * 1000;

/** RF-04: undefined se vazio, sem letra ou igual à razão social (normalizada). A caixa é mantida (D-03). */
export function limparFantasia(
  bruto: string | null | undefined,
  razaoSocial: string,
): string | undefined {
  const fantasia = (bruto ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_FANTASIA).trim();
  if (!/\p{L}/u.test(fantasia)) return undefined;
  if (normalizarDescricao(fantasia) === normalizarDescricao(razaoSocial)) return undefined;
  return fantasia;
}

/** RF-02: sem `fantasiaConsultadaEm` ou consultada há mais de `REVALIDAR_FANTASIA_DIAS`. */
export function precisaConsultar(
  estab: Pick<Estabelecimento, 'fantasiaConsultadaEm'> | null,
  agora: Date,
): boolean {
  if (!estab?.fantasiaConsultadaEm) return true;
  const idade = agora.getTime() - new Date(estab.fantasiaConsultadaEm).getTime();
  return Number.isNaN(idade) || idade > REVALIDAR_FANTASIA_DIAS * DIA_MS;
}

function vazio(s: string | null | undefined): boolean {
  return !s?.trim();
}

/** RF-13: o que falta num estabelecimento já gravado (usado na reimportação). */
export function avaliarEstabelecimento(
  estab: Estabelecimento | null,
  agora: Date,
): 'sefaz' | 'fantasia' | 'completo' {
  if (!estab || vazio(estab.nome) || vazio(estab.endereco) || vazio(estab.cidade)) return 'sefaz';
  return precisaConsultar(estab, agora) ? 'fantasia' : 'completo';
}
