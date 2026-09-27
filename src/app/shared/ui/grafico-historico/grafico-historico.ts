import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface SerieGrafico {
  nome: string;
  pontos: { data: string; valor: number }[];
}

const L = 640;
const A = 240;
const M = { esq: 56, dir: 12, topo: 12, base: 28 };
const TRACOS = ['', '6 4', '2 4', '10 4 2 4', '1 3'];

/** Histórico de preço em SVG próprio (sem lib), com tabela equivalente para leitor de tela. */
@Component({
  selector: 'cp-grafico-historico',
  imports: [CurrencyPipe, DatePipe],
  template: `
    <figure class="grafico">
      <svg
        [attr.viewBox]="'0 0 ' + largura + ' ' + altura"
        role="img"
        [attr.aria-label]="'Histórico de preço de ' + series().length + ' estabelecimentos'"
      >
        @for (y of eixoY(); track y.valor) {
          <line
            class="grade"
            [attr.x1]="margem.esq"
            [attr.x2]="largura - margem.dir"
            [attr.y1]="y.y"
            [attr.y2]="y.y"
          />
          <text class="rotulo" [attr.x]="margem.esq - 6" [attr.y]="y.y + 4" text-anchor="end">
            {{ y.valor | currency }}
          </text>
        }
        @for (x of eixoX(); track x.data) {
          <text class="rotulo" [attr.x]="x.x" [attr.y]="altura - 8" text-anchor="middle">
            {{ x.data | date: 'dd/MM' }}
          </text>
        }
        @for (s of desenho(); track s.nome; let i = $index) {
          <g [attr.class]="'serie serie-' + (i + 1)">
            <polyline [attr.points]="s.caminho" [attr.stroke-dasharray]="tracos[i]" fill="none" />
            @for (p of s.pontos; track p.data) {
              <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5">
                <title>
                  {{ s.nome }}: {{ p.valor | currency }} em {{ p.data | date: 'dd/MM/yyyy' }}
                </title>
              </circle>
            }
          </g>
        }
      </svg>
      <figcaption class="legenda">
        @for (s of desenho(); track s.nome; let i = $index) {
          <span [attr.class]="'item serie-' + (i + 1)">
            <svg width="28" height="10" aria-hidden="true">
              <line x1="0" x2="28" y1="5" y2="5" [attr.stroke-dasharray]="tracos[i]" />
            </svg>
            {{ s.nome }}
          </span>
        }
      </figcaption>
      <table class="cp-sr-only">
        <caption>
          Histórico de preços por estabelecimento
        </caption>
        <thead>
          <tr>
            <th scope="col">Estabelecimento</th>
            <th scope="col">Data</th>
            <th scope="col">Preço</th>
          </tr>
        </thead>
        <tbody>
          @for (s of desenho(); track s.nome) {
            @for (p of s.pontos; track p.data) {
              <tr>
                <td>{{ s.nome }}</td>
                <td>{{ p.data | date: 'dd/MM/yyyy' }}</td>
                <td>{{ p.valor | currency }}</td>
              </tr>
            }
          }
        </tbody>
      </table>
    </figure>
  `,
  styleUrl: './grafico-historico.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GraficoHistorico {
  readonly series = input.required<readonly SerieGrafico[]>();

  protected readonly largura = L;
  protected readonly altura = A;
  protected readonly margem = M;
  protected readonly tracos = TRACOS;

  private readonly escala = computed(() => {
    const pontos = this.series().flatMap((s) => s.pontos);
    const tempos = pontos.map((p) => new Date(p.data).getTime());
    const valores = pontos.map((p) => p.valor);
    const t0 = Math.min(...tempos);
    const t1 = Math.max(...tempos);
    const folga = (Math.max(...valores) - Math.min(...valores)) * 0.1 || 1;
    const v0 = Math.max(0, Math.min(...valores) - folga);
    const v1 = Math.max(...valores) + folga;
    const x = (data: string) =>
      t1 === t0
        ? (M.esq + L - M.dir) / 2
        : M.esq + ((new Date(data).getTime() - t0) / (t1 - t0)) * (L - M.esq - M.dir);
    const y = (valor: number) => M.topo + (1 - (valor - v0) / (v1 - v0)) * (A - M.topo - M.base);
    return { x, y, v0, v1, t0, t1 };
  });

  protected readonly desenho = computed(() => {
    const { x, y } = this.escala();
    return this.series().map((s) => {
      const pontos = s.pontos.map((p) => ({ ...p, x: x(p.data), y: y(p.valor) }));
      return {
        nome: s.nome,
        pontos,
        caminho: pontos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
      };
    });
  });

  protected readonly eixoY = computed(() => {
    const { y, v0, v1 } = this.escala();
    return [v0, (v0 + v1) / 2, v1].map((valor) => ({
      valor: Math.round(valor * 100) / 100,
      y: y(valor),
    }));
  });

  protected readonly eixoX = computed(() => {
    const { x, t0, t1 } = this.escala();
    const datas = t0 === t1 ? [t0] : [t0, (t0 + t1) / 2, t1];
    return datas.map((t) => {
      const data = new Date(t).toISOString();
      return { data, x: x(data) };
    });
  });
}
