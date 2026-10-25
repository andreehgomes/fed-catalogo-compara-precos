import { CurrencyPipe, DatePipe, formatCurrency, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BreakpointService } from '../../../core/layout/breakpoint.service';
import { BarraCompra, BarraMes, Mes, filtroDoMes, inicioDoMes } from '../painel.calculos';

type Modo = 'gasto' | 'saldo';

interface Barra {
  id: string;
  rotulo: string;
  valor: number;
  link: string[];
  query: Record<string, string> | null;
  destaque: boolean;
  parcial: boolean;
  nome: string;
}

const L = 640;
const L_COMPACTO = 340;
const A = 220;
const M = { esq: 8, dir: 8, topo: 22, base: 26 };
/** Acima disso os valores em cima das barras se sobrepõem no celular; ficam a tabela e o `<title>`. */
const MAX_ROTULOS_COMPACTO = 6;

/** Gasto ou saldo por mês (ou por compra) em SVG próprio, com tabela equivalente. */
@Component({
  selector: 'cp-grafico-meses',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './grafico-meses.html',
  styleUrl: './grafico-meses.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficoMeses {
  private readonly locale = inject(LOCALE_ID);
  private readonly breakpoint = inject(BreakpointService);

  readonly barras = input.required<BarraMes[]>();
  readonly compras = input<BarraCompra[]>([]);
  readonly porCompra = input(false);
  readonly media = input<number | null>(null);
  readonly mesReferencia = input<Mes | null>(null);

  protected readonly modo = signal<Modo>('gasto');
  protected readonly altura = A;
  protected readonly margem = M;
  protected readonly largura = computed(() => (this.breakpoint.estreito() ? L_COMPACTO : L));

  protected readonly itens = computed<Barra[]>(() => {
    const saldo = this.modo() === 'saldo';
    if (this.porCompra()) {
      return this.compras().map((c) => {
        const dia = formatDate(c.emissao, 'dd/MM', this.locale);
        return {
          id: c.chave,
          rotulo: dia,
          valor: saldo ? c.saldo : c.total,
          link: ['/notas', c.chave],
          query: null,
          destaque: false,
          parcial: false,
          nome: `${c.mercado} em ${dia}`,
        };
      });
    }
    return this.barras().map((b) => {
      const data = inicioDoMes(b.mes);
      return {
        id: b.mes,
        rotulo: formatDate(data, 'MMM', this.locale).replace('.', ''),
        valor: saldo ? b.saldo : b.total,
        link: ['/notas'],
        query: filtroDoMes(b.mes),
        destaque: b.mes === this.mesReferencia(),
        parcial: b.parcial,
        nome: formatDate(data, 'MMMM', this.locale) + (b.parcial ? ' (até hoje)' : ''),
      };
    });
  });

  private readonly area = computed(() => ({
    x0: M.esq,
    largura: this.largura() - M.esq - M.dir,
    y0: M.topo,
    altura: A - M.topo - M.base,
  }));

  protected readonly desenho = computed(() => {
    const itens = this.itens();
    const { x0, largura, y0, altura } = this.area();
    const saldo = this.modo() === 'saldo';
    const media = !saldo && !this.porCompra() ? this.media() : null;
    const maximo = Math.max(...itens.map((i) => Math.abs(i.valor)), media ?? 0) || 1;
    const zero = saldo ? y0 + altura / 2 : y0 + altura;
    const escala = saldo ? altura / 2 / maximo : altura / maximo;
    const passo = largura / Math.max(itens.length, 1);
    const larguraBarra = Math.min(passo * 0.62, 48);
    const rotular = !this.breakpoint.estreito() || itens.length <= MAX_ROTULOS_COMPACTO;
    return {
      zero,
      media: media === null ? null : zero - media * escala,
      barras: itens.map((i, k) => {
        const h = Math.abs(i.valor) * escala;
        const topo = i.valor >= 0 ? zero - h : zero;
        const cx = x0 + passo * k + passo / 2;
        return {
          ...i,
          x: cx - larguraBarra / 2,
          y: topo,
          w: larguraBarra,
          h: Math.max(h, i.valor ? 1 : 0),
          cx,
          tipo: saldo
            ? i.valor > 0
              ? 'mais-caro'
              : i.valor < 0
                ? 'mais-barato'
                : 'zero'
            : 'gasto',
          rotuloValor: rotular && i.valor ? this.curto(i.valor, saldo) : null,
          yValor: i.valor >= 0 ? topo - 6 : topo + h + 13,
          aria: `${i.nome}: ${this.descrever(i.valor, saldo)}, ver ${i.query ? 'notas' : 'nota'}`,
        };
      }),
    };
  });

  protected readonly vazio = computed(() => this.itens().every((i) => !i.valor));

  protected mudar(modo: Modo): void {
    this.modo.set(modo);
  }

  private curto(v: number, saldo: boolean): string {
    const texto = formatCurrency(Math.abs(v), this.locale, 'R$', 'BRL', '1.0-0');
    return saldo ? (v > 0 ? '+' : '−') + texto : texto;
  }

  private descrever(v: number, saldo: boolean): string {
    const texto = formatCurrency(Math.abs(v), this.locale, 'R$', 'BRL');
    if (!saldo) return texto;
    return v > 0 ? `${texto} a mais` : v < 0 ? `${texto} de economia` : 'saldo zerado';
  }
}
