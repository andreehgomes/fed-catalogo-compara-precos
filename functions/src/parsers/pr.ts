import { load, type CheerioAPI } from 'cheerio';
import { limparChave, validarChave } from '@shared/chave-acesso';
import type { ItemNfce, NfceParsed } from '@shared/model';
import { LayoutInesperadoError } from '../importar/erros';

/**
 * Parser PROVISÓRIO da página de consulta da NFC-e do PR, escrito sobre o layout padrão
 * (SVRS) usado pelos projetos open source de referência. O portal estava fora do ar em
 * 27/09/2026 (Tarefa 6.3 ⛔): os seletores precisam ser confirmados com cupons reais
 * anonimizados antes de o parser ser considerado pronto.
 */
export const SELETORES_PR = {
  itens: '#tabResult tr',
  descricao: '.txtTit',
  codigo: '.RCod',
  qtd: '.Rqtd',
  unidade: '.RUN',
  vlUnit: '.RvlUnit',
  vlTotal: '.valor',
  emitenteNome: '#u20, .txtTopo',
  emitenteTexto: '#conteudo .txtCenter .text, .txtCenter .text',
  linhaTotal: '#totalNota #linhaTotal, #totalNota .linhaShade',
  infos: '#infos',
  chave: '.chave',
} as const;

/** Página com a estrutura mínima de uma nota (usado pelo classificador). */
export function pareceNotaPr(html: string): boolean {
  return /id=["']?tabResult/i.test(html) && /totalNumb/i.test(html);
}

export function numeroBr(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '');
  if (!limpo) return Number.NaN;
  return Number(limpo.replace(/\./g, '').replace(',', '.'));
}

function texto($: CheerioAPI, el: Parameters<CheerioAPI>[0]): string {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

function semRotulo(s: string): string {
  return s.replace(/^[^:]*:\s*/, '').trim();
}

/** "27/09/2026 10:05:12" em horário de Brasília (UTC−3, sem horário de verão) → ISO UTC. */
export function dataBrasiliaParaIso(s: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const [, d, mes, a, h, mi, seg] = m;
  return new Date(Date.UTC(+a, +mes - 1, +d, +h + 3, +mi, +(seg ?? 0))).toISOString();
}

export function parsePr(html: string): NfceParsed {
  const $ = load(html);
  const linhas = $(SELETORES_PR.itens).toArray();
  if (!linhas.length) throw new LayoutInesperadoError('Sem itens');

  const itens: ItemNfce[] = linhas.map((tr, i) => {
    const celula = $(tr);
    const vlTotal = numeroBr(texto($, celula.find(SELETORES_PR.vlTotal)));
    const qtd = numeroBr(semRotulo(texto($, celula.find(SELETORES_PR.qtd))));
    const vlUnit = numeroBr(semRotulo(texto($, celula.find(SELETORES_PR.vlUnit))));
    const codigo = texto($, celula.find(SELETORES_PR.codigo))
      .replace(/[()]/g, '')
      .replace(/^[^:]*:/, '')
      .trim();
    const item: ItemNfce = {
      n: i + 1,
      descricao: texto($, celula.find(SELETORES_PR.descricao).first()),
      codigo,
      ean: null,
      qtd,
      unidade: semRotulo(texto($, celula.find(SELETORES_PR.unidade))).toUpperCase(),
      vlUnit,
      vlTotal,
    };
    if (!item.descricao || [qtd, vlUnit, vlTotal].some((n) => !Number.isFinite(n))) {
      throw new LayoutInesperadoError(`Item ${i + 1} incompleto`);
    }
    return item;
  });

  const totais = new Map<string, number>();
  $(SELETORES_PR.linhaTotal).each((_, el) => {
    const rotulo = texto($, $(el).find('label')).toLowerCase();
    const valor = numeroBr(texto($, $(el).find('.totalNumb')));
    if (rotulo) totais.set(rotulo, valor);
  });
  const buscarTotal = (trecho: string) =>
    [...totais.entries()].find(([r]) => r.includes(trecho))?.[1] ?? Number.NaN;
  const aPagar = buscarTotal('a pagar');
  const bruto = buscarTotal('valor total');
  const desconto = buscarTotal('desconto');
  const total = Number.isFinite(aPagar) ? aPagar : bruto;
  if (!Number.isFinite(total)) throw new LayoutInesperadoError('Sem total');

  const textosEmitente = $(SELETORES_PR.emitenteTexto)
    .toArray()
    .map((el) => texto($, el));
  const cnpj = (textosEmitente.find((t) => /CNPJ/i.test(t)) ?? '').replace(/\D/g, '');
  const endereco = textosEmitente.find((t) => !/CNPJ/i.test(t)) ?? '';
  const partesEndereco = endereco
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const nome = texto($, $(SELETORES_PR.emitenteNome).first());
  if (!nome || cnpj.length !== 14) throw new LayoutInesperadoError('Sem emitente');

  const infos = texto($, $(SELETORES_PR.infos));
  const emissao = dataBrasiliaParaIso(/Emiss[ãa]o:?\s*([\d/]+\s+[\d:]+)/i.exec(infos)?.[1] ?? '');
  const chave = limparChave(texto($, $(SELETORES_PR.chave).first()));
  if (!emissao || !validarChave(chave)) throw new LayoutInesperadoError('Sem emissão ou chave');

  return {
    chave,
    emitente: {
      cnpj,
      nome,
      endereco,
      cidade: partesEndereco.at(-2) ?? '',
      uf: partesEndereco.at(-1) ?? 'PR',
    },
    emissao,
    itens,
    total,
    desconto: Number.isFinite(desconto) ? desconto : 0,
  };
}
