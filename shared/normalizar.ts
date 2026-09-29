export const ABREVIACOES: Readonly<Record<string, string>> = {
  ACHOC: 'ACHOCOLATADO',
  AMAC: 'AMACIANTE',
  BEB: 'BEBIDA',
  BISC: 'BISCOITO',
  CERV: 'CERVEJA',
  CHOC: 'CHOCOLATE',
  CX: 'CAIXA',
  DESINF: 'DESINFETANTE',
  DESN: 'DESNATADO',
  DET: 'DETERGENTE',
  FERM: 'FERMENTO',
  FGO: 'FRANGO',
  GARR: 'GARRAFA',
  HIG: 'HIGIENICO',
  INT: 'INTEGRAL',
  MAION: 'MAIONESE',
  MARG: 'MARGARINA',
  MOL: 'MOLHO',
  ODORIZ: 'ODORIZADOR',
  ORIG: 'ORIGINAL',
  PAP: 'PAPEL',
  PCT: 'PACOTE',
  QJO: 'QUEIJO',
  REF: 'REFRIGERANTE',
  REFR: 'REFRIGERANTE',
  REFRIG: 'REFRIGERANTE',
  REQ: 'REQUEIJAO',
  SEMIDESN: 'SEMIDESNATADO',
  TRAD: 'TRADICIONAL',
};

export const STOPWORDS: ReadonlySet<string> = new Set(['A', 'C', 'COM', 'DA', 'DAS', 'DE', 'DO', 'DOS', 'E', 'EM', 'O', 'P', 'PARA', 'S']);

export function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizarDescricao(s: string): string {
  const base = semAcento(s)
    .toUpperCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^A-Z0-9.\s]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ');
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ABREVIACOES[t] ?? t)
    .join(' ');
}

export function tokens(s: string): string[] {
  const vistos = new Set<string>();
  for (const t of normalizarDescricao(s).split(' ')) {
    if (t && !STOPWORDS.has(t)) vistos.add(t);
  }
  return [...vistos];
}

export function tokensSemMedida(s: string): string[] {
  return tokens(s).filter((t) => !/\d/.test(t));
}
