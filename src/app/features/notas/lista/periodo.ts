export type Periodo = 'mes' | 'mes-passado' | '3-meses' | 'personalizado';

export const PERIODOS: readonly { valor: Periodo; rotulo: string }[] = [
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes-passado', rotulo: 'Mês passado' },
  { valor: '3-meses', rotulo: '3 meses' },
  { valor: 'personalizado', rotulo: 'Personalizado' },
];

export interface Intervalo {
  de: string | null;
  ate: string | null;
}

function inicioDoMes(ano: number, mes: number): Date {
  return new Date(ano, mes, 1);
}

/** Intervalo [de, ate) em ISO UTC, a partir do horário local do aparelho. */
export function intervaloDe(
  periodo: string | null | undefined,
  de: string | null | undefined,
  ate: string | null | undefined,
  agora = new Date(),
): Intervalo {
  const a = agora.getFullYear();
  const m = agora.getMonth();
  switch (periodo) {
    case 'mes':
      return { de: inicioDoMes(a, m).toISOString(), ate: inicioDoMes(a, m + 1).toISOString() };
    case 'mes-passado':
      return { de: inicioDoMes(a, m - 1).toISOString(), ate: inicioDoMes(a, m).toISOString() };
    case '3-meses':
      return { de: inicioDoMes(a, m - 2).toISOString(), ate: inicioDoMes(a, m + 1).toISOString() };
    case 'personalizado': {
      const d = de && /^\d{4}-\d{2}-\d{2}$/.test(de) ? new Date(`${de}T00:00:00`) : null;
      const f = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? new Date(`${ate}T00:00:00`) : null;
      if (f) f.setDate(f.getDate() + 1);
      return { de: d?.toISOString() ?? null, ate: f?.toISOString() ?? null };
    }
    default:
      return { de: null, ate: null };
  }
}
