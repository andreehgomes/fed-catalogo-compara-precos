import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MODELOS_IA, configIaDe, modeloIa, type ConfigIa } from '@shared/modelos-ia';
import { ConfigIaService } from './data-access/config-ia.service';

@Component({
  selector: 'cp-configuracoes-ia',
  imports: [CurrencyPipe, FormField, MatIconModule],
  templateUrl: './configuracoes-ia.page.html',
  styleUrl: './configuracoes-ia.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ConfiguracoesIaPage {
  private readonly service = inject(ConfigIaService);
  private readonly snack = inject(MatSnackBar);

  protected readonly modelos = MODELOS_IA;
  protected readonly modeloIa = modeloIa;

  protected readonly dados = resource({ loader: () => this.service.obter() });
  private readonly resposta = computed(() => (this.dados.hasValue() ? this.dados.value() : null));
  protected readonly naoAutorizado = computed(() => this.resposta()?.ok === false);
  private readonly salva = signal<ConfigIa | null>(null);
  private readonly atual = computed(() => {
    const r = this.resposta();
    return this.salva() ?? configIaDe(r?.ok ? r.config : null);
  });
  protected readonly gasto = computed(() => {
    const r = this.resposta();
    return r?.ok ? r.gasto : null;
  });

  private readonly config = linkedSignal(() => ({ ...this.atual() }));
  protected readonly form = form(this.config);
  protected readonly mudou = computed(() => {
    const a = this.atual();
    const c = this.config();
    return a.modeloNome !== c.modeloNome || a.modeloVinculo !== c.modeloVinculo;
  });
  protected readonly salvando = signal(false);

  protected async salvar(): Promise<void> {
    if (this.salvando() || !this.mudou()) return;
    this.salvando.set(true);
    try {
      const r = await this.service.definir(this.config());
      if (r.ok) {
        this.salva.set(r.config);
        this.snack.open('Configuração salva. Vale em até 1 minuto.', 'OK', { duration: 4000 });
      } else {
        const texto =
          r.erro.codigo === 'nao-autorizado'
            ? 'Só o administrador pode mudar os modelos.'
            : 'Modelo inválido.';
        this.snack.open(texto, 'OK', { duration: 4000 });
      }
    } catch {
      this.snack.open('Não foi possível salvar agora.', 'OK', { duration: 4000 });
    } finally {
      this.salvando.set(false);
    }
  }
}
