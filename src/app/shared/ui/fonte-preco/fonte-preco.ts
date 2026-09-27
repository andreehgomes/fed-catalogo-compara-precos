import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type FonteDoPreco = 'minhas-notas' | 'comunidade' | 'menor-preco';

const ROTULOS: Record<FonteDoPreco, string> = {
  'minhas-notas': 'Suas notas',
  comunidade: 'Comunidade',
  'menor-preco': 'Menor Preço – Nota Paraná',
};

const ICONES: Record<FonteDoPreco, string> = {
  'minhas-notas': 'receipt_long',
  comunidade: 'groups',
  'menor-preco': 'account_balance',
};

const DIA_MS = 86_400_000;

export function haQuantoTempo(data: Date, agora: Date = new Date()): string {
  const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(data)) / DIA_MS);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

@Component({
  selector: 'cp-fonte-preco',
  imports: [MatIconModule],
  template: `
    <span class="cp-source">
      <mat-icon aria-hidden="true">{{ icone() }}</mat-icon>
      {{ rotulo() }}
      @if (quando(); as q) {
        · {{ q }}
      }
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FontePrecoInfo {
  readonly fonte = input.required<FonteDoPreco>();
  readonly data = input<Date | string | null>(null);

  protected readonly rotulo = computed(() => ROTULOS[this.fonte()]);
  protected readonly icone = computed(() => ICONES[this.fonte()]);
  protected readonly quando = computed(() => {
    const d = this.data();
    if (!d) return null;
    const data = d instanceof Date ? d : new Date(d);
    return Number.isNaN(data.getTime()) ? null : haQuantoTempo(data);
  });
}
