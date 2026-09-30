import type { Nota } from '@shared/model';
import type { Operacao, Repositorio } from '../dados/repositorio';

/** Operações que acertam `estabelecimentoNome` nas notas do uid daquele CNPJ (só as que mudam). */
export async function operacoesDeNome(
  repo: Repositorio,
  uid: string,
  cnpj: string,
  nome: string,
  extra?: Partial<Pick<Nota, 'estabelecimentoCidade'>>,
): Promise<Operacao[]> {
  const notas = await repo.consultar<Nota>(`usuarios/${uid}/notas`, [
    { campo: 'cnpj', op: '==', valor: cnpj },
  ]);
  const cidade = extra?.estabelecimentoCidade;
  return notas
    .filter(
      ({ dados }) =>
        dados.estabelecimentoNome !== nome ||
        (cidade !== undefined && dados.estabelecimentoCidade !== cidade),
    )
    .map(({ caminho }) => ({
      tipo: 'gravar' as const,
      caminho,
      dados: { estabelecimentoNome: nome, ...extra },
      opcoes: { merge: true },
    }));
}
