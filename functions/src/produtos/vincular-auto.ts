import { encodeGeohash } from '@shared/geohash';
import type {
  Estabelecimento,
  Produto,
  ProdutoId,
  ResultadoVinculoAuto,
  VinculoAuto,
} from '@shared/model';
import {
  decidirGtin,
  municipioIgual,
  termosDeBusca,
  type OfertaComGtin,
} from '@shared/vinculo-auto';
import municipios from '../../../src/assets/data/municipios-pr.json';
import type { Contexto } from '../importar/contexto';
import {
  lerOfertas,
  MenorPrecoBloqueadoError,
  MenorPrecoIndisponivelError,
} from '../menor-preco/oferta';
import { garantirProdutoEan, vincular } from './vincular-produto';

const MIN = 60 * 1000;
const DIA = 24 * 60 * MIN;

/** O Menor Preço devolve dados falsos sob volume: poucas consultas, bem espaçadas. */
export const CONSULTAS_POR_EXECUCAO = 12;
export const INTERVALO_ENTRE_CONSULTAS_MS = 10_000;
export const PAUSA_APOS_BLOQUEIO_MS = 2 * 60 * MIN;
export const ESPERA_FONTE_FORA_MS = 60 * MIN;
/** Sem resultado: tenta de novo depois de 1, 7 e 30 dias (a base do Menor Preço cresce). */
export const ESPERAS_SEM_RESULTADO_MS = [DIA, 7 * DIA, 30 * DIA] as const;
export const RAIO_KM = 10;
export const LOTE_BACKFILL = 50;

const CONTROLE = 'controle/vinculoAuto';

interface Controle {
  pausadoAte?: string;
  cursorBackfill?: string;
  backfillConcluido?: boolean;
}

export interface ResumoVinculoAuto {
  vinculado: number;
  ambiguo: number;
  semResultado: number;
  ignorado: number;
  consultas: number;
  enfileiradosBackfill: number;
  parada: 'fim' | 'bloqueio' | 'fonte-fora' | 'pausado' | 'limite';
}

interface Municipio {
  nome: string;
  lat: number;
  lng: number;
}

export function localDoMunicipio(cidade: string): string | null {
  const m = (municipios as Municipio[]).find((x) => municipioIgual(cidade, x.nome));
  return m ? encodeGeohash(m.lat, m.lng, 7) : null;
}

class LimiteConsultas extends Error {}

export async function executarVinculoAuto(ctx: Contexto): Promise<ResumoVinculoAuto> {
  const resumo: ResumoVinculoAuto = {
    vinculado: 0,
    ambiguo: 0,
    semResultado: 0,
    ignorado: 0,
    consultas: 0,
    enfileiradosBackfill: 0,
    parada: 'fim',
  };
  const agora = ctx.agora();
  const controle = (await ctx.repo.obter<Controle>(CONTROLE)) ?? {};
  if (controle.pausadoAte && controle.pausadoAte > agora.toISOString()) {
    resumo.parada = 'pausado';
    return resumo;
  }

  const consultar = async (termo: string, local: string): Promise<OfertaComGtin[]> => {
    if (resumo.consultas >= CONSULTAS_POR_EXECUCAO) throw new LimiteConsultas();
    if (resumo.consultas > 0) await ctx.esperar(INTERVALO_ENTRE_CONSULTAS_MS);
    resumo.consultas++;
    return lerOfertas(await ctx.buscarMenorPreco({ termo, local, raioKm: RAIO_KM }));
  };

  const fila = await ctx.repo.consultarVinculosVencidos(agora, CONSULTAS_POR_EXECUCAO);
  for (const v of fila) {
    try {
      const resultado = await processar(ctx, v, consultar);
      await concluirOuAdiar(ctx, v, resultado);
      resumo[resultado === 'sem-resultado' ? 'semResultado' : resultado]++;
    } catch (e) {
      if (e instanceof LimiteConsultas) {
        resumo.parada = 'limite';
        return resumo;
      }
      if (e instanceof MenorPrecoBloqueadoError) {
        const pausadoAte = new Date(agora.getTime() + PAUSA_APOS_BLOQUEIO_MS).toISOString();
        await ctx.repo.gravar(CONTROLE, { pausadoAte }, { merge: true });
        resumo.parada = 'bloqueio';
        return resumo;
      }
      if (e instanceof MenorPrecoIndisponivelError) {
        await ctx.repo.gravar(
          `vinculosAuto/${v.produtoId}`,
          { proximaTentativa: new Date(agora.getTime() + ESPERA_FONTE_FORA_MS).toISOString() },
          { merge: true },
        );
        resumo.parada = 'fonte-fora';
        return resumo;
      }
      throw e;
    }
  }
  if (fila.length < CONSULTAS_POR_EXECUCAO && !controle.backfillConcluido) {
    resumo.enfileiradosBackfill = await backfill(ctx, controle, agora);
  }
  return resumo;
}

async function processar(
  ctx: Contexto,
  v: VinculoAuto,
  consultar: (termo: string, local: string) => Promise<OfertaComGtin[]>,
): Promise<ResultadoVinculoAuto> {
  const [produto, estab] = await ctx.repo.obterVarios<Produto & Estabelecimento>([
    `produtos/${v.produtoId}`,
    `estabelecimentos/${v.cnpj}`,
  ]);
  if (!produto || produto.vinculadoA || produto.vinculoBloqueado || !estab) return 'ignorado';
  const local = localDoMunicipio(estab.cidade);
  if (!local) return 'ignorado';

  const item = {
    descricao: produto.descricao,
    vlUnit: v.vlUnit,
    loja: {
      razaoSocial: estab.nome,
      logradouro: estab.endereco.split(',')[0] ?? '',
      municipio: estab.cidade,
    },
  };
  for (const termo of termosDeBusca(produto.descricao)) {
    const ofertas = await consultar(termo, local);
    if (ofertas.length === 0) continue;
    const decisao = decidirGtin(item, ofertas);
    if (decisao.tipo === 'vincular') {
      const ean = await garantirProdutoEan(ctx, decisao.gtin, produto, decisao.descricao);
      const r = await vincular(ctx, v.produtoId, ean as ProdutoId, 'auto');
      return r.ok ? 'vinculado' : 'ambiguo';
    }
    if (decisao.tipo === 'ambiguo') {
      await ctx.repo.gravar(
        `produtos/${v.produtoId}`,
        { sugestoesEan: decisao.candidatos },
        { merge: true },
      );
      return 'ambiguo';
    }
    return 'sem-resultado';
  }
  return 'sem-resultado';
}

async function concluirOuAdiar(
  ctx: Contexto,
  v: VinculoAuto,
  resultado: ResultadoVinculoAuto,
): Promise<void> {
  const espera = resultado === 'sem-resultado' ? ESPERAS_SEM_RESULTADO_MS[v.tentativas] : undefined;
  const dados = espera
    ? {
        tentativas: v.tentativas + 1,
        proximaTentativa: new Date(ctx.agora().getTime() + espera).toISOString(),
        resultado,
      }
    : { status: 'concluido', tentativas: v.tentativas + 1, resultado };
  await ctx.repo.gravar(`vinculosAuto/${v.produtoId}`, dados, { merge: true });
}

/** Produtos `loc:` de antes da fila entram nela aos poucos, pelo id. */
async function backfill(ctx: Contexto, controle: Controle, agora: Date): Promise<number> {
  const ids = await ctx.repo.listarIds(
    'produtos',
    'loc:',
    controle.cursorBackfill ?? '',
    LOTE_BACKFILL,
  );
  if (ids.length === 0) {
    await ctx.repo.gravar(CONTROLE, { backfillConcluido: true }, { merge: true });
    return 0;
  }
  const [produtos, naFila] = await Promise.all([
    ctx.repo.obterVarios<Produto>(ids.map((id) => `produtos/${id}`)),
    ctx.repo.obterVarios<VinculoAuto>(ids.map((id) => `vinculosAuto/${id}`)),
  ]);
  const novos = produtos.filter(
    (p, i): p is Produto => !!p && !naFila[i] && !p.vinculadoA && !p.vinculoBloqueado,
  );
  await ctx.repo.lote(
    novos.map((p) => {
      const v: VinculoAuto = {
        produtoId: p.id,
        cnpj: p.id.split(':')[1],
        vlUnit: p.ultimaObservacao?.vlUnit ?? 0,
        status: 'aguardando',
        tentativas: 0,
        proximaTentativa: agora.toISOString(),
        criadoEm: agora.toISOString(),
      };
      return { tipo: 'gravar' as const, caminho: `vinculosAuto/${p.id}`, dados: { ...v } };
    }),
  );
  await ctx.repo.gravar(CONTROLE, { cursorBackfill: ids.at(-1) }, { merge: true });
  return novos.length;
}
