const ABREVIACOES: Readonly<Record<string, string>> = {
  ACHOC: 'ACHOCOLATADO',
  AMAC: 'AMACIANTE',
  BISC: 'BISCOITO',
  CERV: 'CERVEJA',
  CHOC: 'CHOCOLATE',
  CX: 'CAIXA',
  DESN: 'DESNATADO',
  DET: 'DETERGENTE',
  FGO: 'FRANGO',
  GARR: 'GARRAFA',
  HIG: 'HIGIENICO',
  INT: 'INTEGRAL',
  MARG: 'MARGARINA',
  ORIG: 'ORIGINAL',
  PAP: 'PAPEL',
  PCT: 'PACOTE',
  QJO: 'QUEIJO',
  REF: 'REFRIGERANTE',
  REFRIG: 'REFRIGERANTE',
  SEMIDESN: 'SEMIDESNATADO',
  TRAD: 'TRADICIONAL',
};

const STOPWORDS = new Set(['A', 'C', 'COM', 'DA', 'DAS', 'DE', 'DO', 'DOS', 'E', 'EM', 'O', 'P', 'PARA', 'S']);

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
