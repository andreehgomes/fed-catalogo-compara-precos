import { ABREVIACOES, STOPWORDS, semAcento } from './normalizar';
import { jaccard } from './similaridade';
import { extrairConteudo } from './unidade';

export interface Etiquetas {
  tipo: string | null;
  marca: string | null;
  tamanho: string | null;
  variantes: string[];
  /**
   * `marca|tamanho`; null se faltar um dos dois (o item não é comparado). O tipo fica fora:
   * muito mercado cadastra sem ele ("COCA COLA 2L ZERO").
   */
  bloco: string | null;
}

export type Relacao = 'igual' | 'conflito' | 'duvida';

export interface Candidato {
  id: string;
  descricao: string;
  tipo: string | null;
  variantes: string[];
}

export type AlvoEtiquetas = Pick<Etiquetas, 'tipo' | 'variantes'>;

export type DecisaoEtiquetas =
  | { tipo: 'ligar'; id: string }
  | { tipo: 'nenhum' }
  | { tipo: 'ia'; candidatos: Candidato[] };

export const MAX_CANDIDATOS_IA = 5;

/**
 * Sequências que a NFC-e abrevia em mais de uma palavra, algumas com letras soltas que
 * depois cairiam como stopword ("S G", "C G"). Aplicadas antes de tirar as stopwords.
 */
const COMPOSTAS_LETRAS: readonly (readonly [string, string])[] = [
  ['CR D', 'CREME DENTAL'],
  ['CR DENT', 'CREME DENTAL'],
  ['CR DENTAL', 'CREME DENTAL'],
  ['CREME DENT', 'CREME DENTAL'],
  ['GE D', 'GEL DENTAL'],
  ['GEL D', 'GEL DENTAL'],
  ['GEL DENT', 'GEL DENTAL'],
  ['PAP HIG', 'PAPEL HIGIENICO'],
  ['SAB PO', 'SABAO PO'],
  ['SAB BAR', 'SABAO BARRA'],
  ['LV ROU', 'LAVA ROUPAS'],
  ['DOCE LE', 'DOCE LEITE'],
  ['CR LEITE', 'CREME LEITE'],
  ['FILTRO P', 'FILTRO PAPEL'],
  ['S G', 'SEMGAS'],
  ['C G', 'COMGAS'],
  ['S GAS', 'SEMGAS'],
  ['C GAS', 'COMGAS'],
  ['SEM GAS', 'SEMGAS'],
  ['COM GAS', 'COMGAS'],
  ['S AC', 'SEMACUCAR'],
  ['S ACUCAR', 'SEMACUCAR'],
  ['SEM ACUCAR', 'SEMACUCAR'],
  ['S GLUTEN', 'SEMGLUTEN'],
  ['SEM GLUTEN', 'SEMGLUTEN'],
  ['S DES', 'SEMIDESNATADO'],
  ['SEMI DE', 'SEMIDESNATADO'],
  ['SEMI DES', 'SEMIDESNATADO'],
  ['EX F', 'EXTRAFORTE'],
  ['EXTRA FORTE', 'EXTRAFORTE'],
  ['EXTRA FORT', 'EXTRAFORTE'],
  ['EXTRA F', 'EXTRAFORTE'],
  ['ZERO LA', 'ZEROLACTOSE'],
  ['ZERO LAC', 'ZEROLACTOSE'],
  ['ZERO LACT', 'ZEROLACTOSE'],
  ['ZERO LACTOSE', 'ZEROLACTOSE'],
  ['D NENA', 'DONA NENA'],
];

/** Tipos e marcas de duas palavras, juntados num token só depois das stopwords. */
const COMPOSTAS: readonly (readonly [string, string])[] = [
  ['CREME DENTAL', 'CREME DENTAL'],
  ['GEL DENTAL', 'GEL DENTAL'],
  ['PAPEL HIGIENICO', 'PAPEL HIGIENICO'],
  ['PAPEL TOALHA', 'PAPEL TOALHA'],
  ['TOALHA PAPEL', 'PAPEL TOALHA'],
  ['FILTRO PAPEL', 'FILTRO PAPEL'],
  ['FILTRO PAP', 'FILTRO PAPEL'],
  ['FILTRO CAFE', 'FILTRO PAPEL'],
  ['CREME LEITE', 'CREME LEITE'],
  ['DOCE LEITE', 'DOCE LEITE'],
  ['OLEO SOJA', 'OLEO SOJA'],
  ['SABAO PO', 'SABAO PO'],
  ['SABAO BARRA', 'SABAO BARRA'],
  ['SABONETE PO', 'SABAO PO'],
  ['SABONETE BAR', 'SABAO BARRA'],
  ['LAVA ROUPAS', 'LAVA ROUPAS'],
  ['MACARRAO INST', 'MACARRAO INSTANTANEO'],
  ['MACARRAO INSTANTANEO', 'MACARRAO INSTANTANEO'],
  ['AGUA MIN', 'AGUA'],
  ['AGUA MINERAL', 'AGUA'],
  ['LIMPADOR CASA', 'LIMPADOR CASA'],
  ['COCA COLA', 'COCA COLA'],
  ['CLOSE UP', 'CLOSE UP'],
  ['PINHO BRIL', 'PINHO BRIL'],
  ['CALDO BOM', 'CALDO BOM'],
  ['DONA NENA', 'DONA NENA'],
  ['ORAL B', 'ORAL B'],
  ['MA LEAO', 'MATTE LEAO'],
  ['MATTE LEAO', 'MATTE LEAO'],
  ['SO LEVE', 'SO LEVE'],
  ['SANTA BRANCA', 'SANTA BRANCA'],
  ['STA INES', 'SANTA INES'],
  ['SANTA INES', 'SANTA INES'],
];

/** Abreviação do tipo, válida só na primeira palavra ("DES" no começo é desodorante). */
const ABREV_TIPO: Readonly<Record<string, string>> = {
  ABS: 'ABSORVENTE',
  AG: 'AGUA',
  BEB: 'BEBIDA',
  BROC: 'BROCOLIS',
  CR: 'CREME',
  DES: 'DESODORANTE',
  DESOD: 'DESODORANTE',
  ENX: 'ENXAGUANTE',
  ESP: 'ESPONJA',
  FAR: 'FARINHA',
  LIMP: 'LIMPADOR',
  MAC: 'MACARRAO',
  MOL: 'MOLHO',
  QU: 'QUEIJO',
  SAB: 'SABONETE',
  SH: 'SHAMPOO',
  TEMP: 'TEMPERO',
  TOR: 'TORRADA',
};

export const TIPOS: ReadonlySet<string> = new Set([
  'ABSORVENTE', 'ACHOCOLATADO', 'ACUCAR', 'ADOCANTE', 'AGUA', 'AGUA SANITARIA', 'ALHO',
  'ALVEJANTE', 'AMACIANTE', 'AMENDOIM', 'ARROZ', 'ATUM', 'AVEIA', 'AZEITE', 'AZEITONA',
  'BALA', 'BANANINHA', 'BARRA', 'BATATA', 'BEBIDA', 'BISCOITO', 'BOLACHA', 'BOLO',
  'BROCOLIS', 'BUCHA', 'CACAU', 'CAFE', 'CALDO', 'CANELA', 'CAPPUCCINO', 'CARNE', 'CATCHUP',
  'CENOURA', 'CERA', 'CEREAL', 'CERVEJA', 'CHA', 'CHICLETE', 'CHOCOLATE', 'CODORNA',
  'COLORAU', 'CONDICIONADOR', 'CREME', 'CREME DENTAL', 'CREME LEITE', 'CREMOSO',
  'DESINFETANTE', 'DESODORANTE', 'DETERGENTE', 'DOCE', 'DOCE LEITE', 'ENERGETICO',
  'ENXAGUANTE', 'ERVILHA', 'ESPONJA', 'EXTRATO', 'FARINHA', 'FAROFA', 'FEIJAO', 'FERMENTO',
  'FILE', 'FILTRO', 'FILTRO PAPEL', 'FLOCAO', 'FOSFORO', 'FRALDA', 'FRANGO', 'FUBA',
  'GEL DENTAL', 'GELATINA', 'GELEIA', 'GORDURA', 'GRANOLA', 'GUARANA', 'HAMBURGUER',
  'HASTE', 'INSETICIDA', 'IOGURTE', 'ISQUEIRO', 'LAMPADA', 'LASANHA', 'LAVA ROUPAS',
  'LEITE', 'LEITE CONDENSADO', 'LEITE PO', 'LENCO', 'LIMPADOR', 'LIMPADOR CASA', 'LINGUICA',
  'LUSTRA MOVEIS', 'MACARRAO', 'MACARRAO INSTANTANEO', 'MAIONESE', 'MANTEIGA', 'MARGARINA',
  'MASSA', 'MILHO', 'MISTURA', 'MOLHO', 'MORTADELA', 'MOSTARDA', 'NECTAR', 'OLEO',
  'OLEO SOJA', 'ODORIZADOR', 'OVOS', 'PALMITO', 'PANO', 'PAO', 'PAPEL ALUMINIO',
  'PAPEL HIGIENICO', 'PAPEL TOALHA', 'PAPRICA', 'PASSATA', 'PEITO', 'PILHA', 'PIPOCA',
  'PIMENTA', 'PIZZA', 'POLPA', 'PRESUNTO', 'PUDIM', 'QUEIJO', 'REFRESCO', 'REFRIGERANTE',
  'REPOLHO', 'REQUEIJAO', 'SABAO', 'SABAO BARRA', 'SABAO PO', 'SABONETE', 'SACO', 'SAL',
  'SALGADINHO', 'SALSICHA', 'SAPOLIO', 'SARDINHA', 'SHAMPOO', 'SOPA', 'SORVETE', 'SUCO',
  'TAPIOCA', 'TEMPERO', 'TORRADA', 'TRAVESSA', 'TIGELA', 'VINAGRE', 'VINHO', 'WAFER',
  'ESCOVA', 'ESCOVA DENTAL', 'FIO DENTAL', 'COTONETE', 'GUARDANAPO', 'COPO',
  'VELA', 'CARVAO', 'RACAO', 'LEITE FERMENTADO', 'BEBIDA LACTEA', 'COCO RALADO',
]);

/** Sinônimos e abreviações de variante: a mesma variante escrita de vários jeitos. */
const SINONIMOS: Readonly<Record<string, string>> = {
  TRAD: 'TRADICIONAL',
  TR: 'TRADICIONAL',
  DESN: 'DESNATADO',
  DESNATA: 'DESNATADO',
  DESNATDO: 'DESNATADO',
  INTEG: 'INTEGRAL',
  INTEGRA: 'INTEGRAL',
  INTE: 'INTEGRAL',
  INT: 'INTEGRAL',
  SEMI: 'SEMIDESNATADO',
  SEMIDESNATDO: 'SEMIDESNATADO',
  ZE: 'ZERO',
  LIGH: 'LIGHT',
  SG: 'SEMGAS',
  CG: 'COMGAS',
  EXTRA: 'EXTRAFORTE',
  EXTRAF: 'EXTRAFORTE',
  EX: 'EXTRAFORTE',
  LV: 'LAVANDA',
  VAC: 'VACUO',
  SC: 'SACHE',
  LTA: 'LATA',
  REFIL: 'REFIL',
  RET: 'RETORNAVEL',
  RETORNAV: 'RETORNAVEL',
  PCT: 'PACOTE',
  CX: 'CAIXA',
  GARR: 'GARRAFA',
  MUS: 'MUSSARELA',
  MUSS: 'MUSSARELA',
  MUCARELA: 'MUSSARELA',
  CHO: 'CHOCOLATE',
  CHOC: 'CHOCOLATE',
  MOR: 'MORANGO',
  BCO: 'BRANCO',
  VD: 'VERDE',
  VERM: 'VERMELHO',
  DEF: 'DEFUMADA',
  DEFU: 'DEFUMADA',
  DEFUMAD: 'DEFUMADA',
  PICA: 'PICANTE',
  HORT: 'HORTELA',
  MENT: 'MENTA',
  TRIP: 'TRIPLE',
};

/** Variantes e descrições comuns que nunca são marca (a marca é a 1ª palavra fora delas). */
const VARIANTES_CONHECIDAS: ReadonlySet<string> = new Set([
  'TRADICIONAL', 'DESNATADO', 'INTEGRAL', 'SEMIDESNATADO', 'ZERO', 'ZEROLACTOSE', 'LIGHT',
  'DIET', 'SEMGAS', 'COMGAS', 'SEMACUCAR', 'SEMGLUTEN', 'EXTRAFORTE', 'LAVANDA', 'COCO',
  'LIMAO', 'LARANJA', 'UVA', 'MORANGO', 'CHOCOLATE', 'BAUNILHA', 'NEUTRO',
  'ORIGINAL', 'FORMA', 'FORNO', 'CARIOCA', 'PRETO', 'BRANCO', 'VERDE', 'VERMELHO',
  'CAVALO', 'OURO', 'VACUO', 'ALMOFADA', 'LATA', 'PET', 'PACOTE', 'SACHE', 'POUCH', 'CAIXA',
  'GARRAFA', 'RETORNAVEL', 'REFIL', 'KIT', 'PACK', 'DEFUMADA', 'DOCE', 'PICANTE', 'MENTA',
  'HORTELA', 'TRIPLE', 'MUSSARELA', 'PRATO', 'PO', 'LIQUIDO', 'CREMOSO', 'CREMOSA',
  'MINERAL', 'FLORES', 'PINHO', 'CAMPESTRE', 'LEVE', 'MOIDO', 'GRAOS',
  'FATIADO', 'RALADO', 'SUAVE', 'FORTE', 'AMERICANO', 'FRANCES', 'SOJA',
]);

/** Palavras que não distinguem o produto: somem das variantes. */
const NEUTROS: ReadonlySet<string> = new Set([
  'UHT', 'LONGA', 'VIDA', 'LON', 'VID', 'MIN', 'COD', 'NR', 'NO', 'UN', 'UND', 'UNID', 'L',
  'ML', 'G', 'GR', 'GRS', 'KG', 'KGS', 'LTS', 'LT', 'M', 'CM', 'LITRO', 'LITROS', 'UNIDADES',
  'NA', 'AO', 'SEM', 'TIPO',
]);

const RE_DIGITO = /\d/;

function tokensBrutos(descricao: string): string[] {
  return semAcento(descricao)
    .toUpperCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^A-Z0-9.\s]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function juntar(ts: string[], regras: readonly (readonly [string, string])[]): string[] {
  const saida: string[] = [];
  for (let i = 0; i < ts.length; ) {
    const regra = regras.find(([de]) => {
      const partes = de.split(' ');
      return partes.every((p, k) => ts[i + k] === p);
    });
    if (regra) {
      saida.push(regra[1]);
      i += regra[0].split(' ').length;
    } else {
      saida.push(ts[i]);
      i++;
    }
  }
  return saida;
}

function sinonimo(t: string): string {
  return SINONIMOS[t] ?? ABREVIACOES[t] ?? t;
}

function ehMedida(t: string): boolean {
  return RE_DIGITO.test(t) || NEUTROS.has(t);
}

/** A NFC-e perde a vírgula de "1,5L": "1 5L" viraria 5 L e juntaria 1,5 L com 2,5 L. */
const DECIMAL_SEM_VIRGULA = /(?<![\d.,])(\d) (\d)\s*(L|LT|LTS|KG)(?![A-Z])/i;

function formatarTamanho(descricao: string): string | null {
  const c = extrairConteudo(descricao.replace(DECIMAL_SEM_VIRGULA, '$1.$2$3'));
  return c ? `${c.quantidade}${c.unidadeBase}` : null;
}

export function etiquetar(descricao: string): Etiquetas {
  let ts = juntar(tokensBrutos(descricao), COMPOSTAS_LETRAS);
  const iPrimeira = ts[0] === 'KIT' ? 1 : 0;
  if (ABREV_TIPO[ts[iPrimeira]]) ts[iPrimeira] = ABREV_TIPO[ts[iPrimeira]];
  ts = ts.map((t) => ABREVIACOES[t] ?? t).filter((t) => !STOPWORDS.has(t));
  ts = juntar(ts, COMPOSTAS);

  const iTipo = ts.findIndex((t) => TIPOS.has(t));
  const tipo = iTipo >= 0 ? ts[iTipo] : null;
  const resto = ts.filter((_, i) => i !== iTipo);
  const iMarca = resto.findIndex(
    (t) =>
      t.length >= 2 &&
      !ehMedida(t) &&
      !TIPOS.has(t) &&
      !VARIANTES_CONHECIDAS.has(sinonimo(t)),
  );
  const marca = iMarca >= 0 ? resto[iMarca] : null;
  const variantes = [
    ...new Set(
      resto
        .filter((t, i) => i !== iMarca && t.length >= 2 && !ehMedida(t))
        .map(sinonimo)
        .filter((t) => t !== tipo && t !== marca),
    ),
  ].sort();
  const tamanho = formatarTamanho(descricao);
  const bloco = marca && tamanho ? `${marca}|${tamanho}` : null;
  return { tipo, marca, tamanho, variantes, bloco };
}

/**
 * Cada token nosso precisa aparecer do outro lado, inteiro ou como prefixo: a NFC-e corta
 * a descrição em ~20 caracteres ("INTEG", "LIGH"). Prefixo só vale com 3 letras ou mais,
 * senão "AA" casaria com "AAA".
 */
export function tokensContidos(nossos: readonly string[], deles: readonly string[]): boolean {
  return nossos.every((t) => deles.some((d) => mesmoToken(t, d)));
}

function mesmoToken(a: string, b: string): boolean {
  if (a === b) return true;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  return curto.length >= 3 && longo.startsWith(curto);
}

export function compararVariantes(a: readonly string[], b: readonly string[]): Relacao {
  const aEmB = tokensContidos(a, b);
  const bEmA = tokensContidos(b, a);
  if (aEmB && bEmA) return 'igual';
  if (a.length && b.length && !aEmB && !bEmA) return 'conflito';
  return 'duvida';
}

/**
 * Regra grátis antes da IA. Liga só quando há exatamente um candidato com as mesmas
 * variantes e nenhum em dúvida; conflito claro descarta; o resto vai para a IA. Sem
 * variante nenhuma não liga: a mesma loja vende produtos diferentes como "GEL D CLOSE UP
 * 90G" (gabarito), e a descrição não diz qual.
 */
/** Tipos diferentes dos dois lados são produtos diferentes; tipo faltando não decide. */
export function compararEtiquetas(a: AlvoEtiquetas, b: AlvoEtiquetas): Relacao {
  if (a.tipo && b.tipo && a.tipo !== b.tipo) return 'conflito';
  return compararVariantes(a.variantes, b.variantes);
}

export function decidirPorEtiquetas(
  alvo: AlvoEtiquetas,
  candidatos: readonly Candidato[],
): DecisaoEtiquetas {
  const { variantes } = alvo;
  if (!candidatos.length) return { tipo: 'nenhum' };
  const comRelacao = candidatos.map((c) => ({ c, r: compararEtiquetas(alvo, c) }));
  const iguais = comRelacao.filter((x) => x.r === 'igual');
  const duvidas = comRelacao.filter((x) => x.r === 'duvida');
  if (iguais.length === 1 && !duvidas.length && variantes.length)
    return { tipo: 'ligar', id: iguais[0].c.id };
  if (!iguais.length && !duvidas.length) return { tipo: 'nenhum' };
  const ordenados = [...iguais, ...duvidas]
    .map((x) => ({ ...x, s: (x.r === 'igual' ? 1 : 0) + jaccard(variantes, x.c.variantes) }))
    .sort((x, y) => y.s - x.s || x.c.id.localeCompare(y.c.id))
    .slice(0, MAX_CANDIDATOS_IA)
    .map((x) => x.c);
  return { tipo: 'ia', candidatos: ordenados };
}
