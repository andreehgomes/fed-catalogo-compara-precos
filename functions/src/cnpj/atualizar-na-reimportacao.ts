import { extrairChave } from '@shared/chave-acesso';
import { nomeExibido } from '@shared/apelido';
import type { ApelidoEstabelecimento, Emitente, Estabelecimento } from '@shared/model';
import { avaliarEstabelecimento } from '@shared/nome-fantasia';
import type { Operacao } from '../dados/repositorio';
import { operacoesDeNome } from '../estabelecimentos/propagar-nome';
import type { UrlValidada } from '../importar/allowlist';
import type { Contexto } from '../importar/contexto';
import { ErroNegocio, LayoutInesperadoError } from '../importar/erros';
import { caminhoApelido } from '../importar/gravar-nota';
import { obterNotaDaSefaz } from '../importar/obter-nota';
import { completarEmitente } from './completar-emitente';

const CAMPOS = ['nome', 'fantasia', 'endereco', 'cidade', 'uf'] as const;

function mudou(estab: Estabelecimento | null, emitente: Emitente): boolean {
  if (!estab || emitente.fantasiaConsultadaEm) return true;
  return CAMPOS.some((k) => (emitente[k] ?? '') !== (estab[k] ?? ''));
}

/**
 * RF-13..17: a nota já é do usuário, mas o estabelecimento pode estar incompleto. Relê a
 * SEFAZ (falta dado dela) ou só consulta o CNPJ (falta o nome fantasia) e grava o
 * estabelecimento e o nome nas notas **deste** uid, num lote só no fim. Devolve true se
 * gravou. Nunca lança.
 */
export async function atualizarNaReimportacao(
  ctx: Contexto,
  uid: string,
  alvo: UrlValidada,
): Promise<boolean> {
  const inicio = Date.now();
  try {
    const { cnpj } = extrairChave(alvo.qr.chave);
    const agora = ctx.agora();
    const [estab, apelido] = await Promise.all([
      ctx.repo.obter<Estabelecimento>(`estabelecimentos/${cnpj}`),
      ctx.repo.obter<ApelidoEstabelecimento>(caminhoApelido(uid, cnpj)),
    ]);
    const falta = avaliarEstabelecimento(estab, agora);
    if (falta === 'completo') return false;

    const emitente =
      falta === 'sefaz' || !estab
        ? (await obterNotaDaSefaz(ctx, alvo)).emitente
        : await completarEmitente(ctx, {
            cnpj,
            nome: estab.nome,
            endereco: estab.endereco,
            cidade: estab.cidade,
            uf: estab.uf,
          });
    if (emitente.cnpj !== cnpj) throw new LayoutInesperadoError('CNPJ da página difere da chave');
    if (!mudou(estab, emitente)) return false;

    const notas = await operacoesDeNome(
      ctx.repo,
      uid,
      cnpj,
      nomeExibido(emitente, apelido?.apelido),
      {
        estabelecimentoCidade: emitente.cidade,
      },
    );
    const operacoes: Operacao[] = [
      {
        tipo: 'gravar',
        caminho: `estabelecimentos/${cnpj}`,
        dados: {
          cnpj,
          nome: emitente.nome,
          ...(emitente.fantasia ? { fantasia: emitente.fantasia } : {}),
          endereco: emitente.endereco,
          cidade: emitente.cidade,
          uf: emitente.uf,
          atualizadoEm: agora.toISOString(),
          ...(emitente.fantasiaConsultadaEm
            ? { fantasiaConsultadaEm: emitente.fantasiaConsultadaEm }
            : {}),
        },
        opcoes: { merge: true },
      },
      ...notas,
    ];
    await ctx.repo.lote(operacoes);
    ctx.log({
      etapa: 'cnpj',
      uf: alvo.qr.uf,
      duracaoMs: Date.now() - inicio,
      resultado: 'sucesso',
      contagens: { reimportacao: 1, notasAtualizadas: notas.length },
    });
    return true;
  } catch (e) {
    ctx.log({
      etapa: 'cnpj',
      uf: alvo.qr.uf,
      duracaoMs: Date.now() - inicio,
      resultado: 'falha',
      erro: e instanceof ErroNegocio ? e.codigo : 'desconhecido',
      contagens: { reimportacao: 1 },
    });
    return false;
  }
}
