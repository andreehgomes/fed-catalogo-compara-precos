import type { Pendente, VinculoAuto } from '@shared/model';
import {
  LIMITE_LOTE,
  type Dados,
  type Filtro,
  type OpcoesGravacao,
  type Operacao,
  type PendenteVencido,
  type Repositorio,
  type Transacao,
} from '../../src/dados/repositorio';

function copiar<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Fake em memória do Firestore: documentos por caminho e transação com commit no fim. */
export class RepositorioMemoria implements Repositorio {
  readonly docs = new Map<string, Dados>();
  lotesExecutados = 0;
  transacoesExecutadas = 0;
  falharProximaTransacao = false;

  async obter<T>(caminho: string): Promise<T | null> {
    const d = this.docs.get(caminho);
    return d ? copiar(d as T) : null;
  }

  async obterVarios<T>(caminhos: readonly string[]): Promise<(T | null)[]> {
    return Promise.all(caminhos.map((c) => this.obter<T>(c)));
  }

  async gravar(caminho: string, dados: Dados, opcoes: OpcoesGravacao = {}): Promise<void> {
    this.aplicar({ tipo: 'gravar', caminho, dados, opcoes });
  }

  async apagar(caminho: string): Promise<void> {
    this.docs.delete(caminho);
  }

  async lote(operacoes: readonly Operacao[]): Promise<void> {
    for (let i = 0; i < operacoes.length; i += LIMITE_LOTE) {
      if (operacoes.slice(i, i + LIMITE_LOTE).length > LIMITE_LOTE) throw new Error('lote > 500');
      operacoes.slice(i, i + LIMITE_LOTE).forEach((op) => this.aplicar(op));
      this.lotesExecutados++;
    }
  }

  async transacao<R>(fn: (tx: Transacao) => Promise<R>): Promise<R> {
    const pendentes: Operacao[] = [];
    let escreveu = false;
    const tx: Transacao = {
      obter: async <T>(caminho: string) => {
        if (escreveu) throw new Error('Leitura depois de escrita na transação');
        return this.obter<T>(caminho);
      },
      gravar: (caminho, dados, opcoes) => {
        escreveu = true;
        pendentes.push({ tipo: 'gravar', caminho, dados: copiar(dados), opcoes });
      },
      apagar: (caminho) => {
        escreveu = true;
        pendentes.push({ tipo: 'apagar', caminho });
      },
    };
    const r = await fn(tx);
    if (this.falharProximaTransacao) {
      this.falharProximaTransacao = false;
      throw new Error('falha simulada no commit');
    }
    if (pendentes.length > LIMITE_LOTE) throw new Error('transação > 500 escritas');
    pendentes.forEach((op) => this.aplicar(op));
    this.transacoesExecutadas++;
    return r;
  }

  async consultarPendentesVencidos(agora: Date, limite: number): Promise<PendenteVencido[]> {
    return [...this.docs.entries()]
      .filter(([c]) => /^usuarios\/[^/]+\/pendentes\/[^/]+$/.test(c))
      .map(([c, d]) => ({ uid: c.split('/')[1], pendente: copiar(d) as unknown as Pendente }))
      .filter(
        (p) =>
          p.pendente.status === 'aguardando' && p.pendente.proximaTentativa <= agora.toISOString(),
      )
      .sort((a, b) => a.pendente.proximaTentativa.localeCompare(b.pendente.proximaTentativa))
      .slice(0, limite);
  }

  async consultarVinculosVencidos(agora: Date, limite: number): Promise<VinculoAuto[]> {
    return this.colecao('vinculosAuto')
      .map(([, d]) => copiar(d) as unknown as VinculoAuto)
      .filter((v) => v.status === 'aguardando' && v.proximaTentativa <= agora.toISOString())
      .sort((a, b) => a.proximaTentativa.localeCompare(b.proximaTentativa))
      .slice(0, limite);
  }

  async listarIds(
    colecao: string,
    prefixo: string,
    depoisDe: string,
    limite: number,
  ): Promise<string[]> {
    return this.colecao(colecao)
      .map(([c]) => c.slice(colecao.length + 1))
      .filter((id) => id.startsWith(prefixo) && id > depoisDe)
      .sort()
      .slice(0, limite);
  }

  async consultar<T>(
    colecao: string,
    filtros: readonly Filtro[],
  ): Promise<{ caminho: string; dados: T }[]> {
    return [...this.docs.entries()]
      .filter(
        ([c]) =>
          c.startsWith(`${colecao}/`) && c.split('/').length === colecao.split('/').length + 1,
      )
      .filter(([, d]) => filtros.every((f) => d[f.campo] === f.valor))
      .map(([caminho, d]) => ({ caminho, dados: copiar(d) as T }));
  }

  colecao(prefixo: string): [string, Dados][] {
    return [...this.docs.entries()].filter(
      ([c]) => c.startsWith(`${prefixo}/`) && c.split('/').length === prefixo.split('/').length + 1,
    );
  }

  private aplicar(op: Operacao): void {
    if (op.tipo === 'apagar') {
      this.docs.delete(op.caminho);
      return;
    }
    const atual = op.opcoes?.merge ? (this.docs.get(op.caminho) ?? {}) : {};
    this.docs.set(op.caminho, { ...atual, ...copiar(op.dados ?? {}) });
  }
}
