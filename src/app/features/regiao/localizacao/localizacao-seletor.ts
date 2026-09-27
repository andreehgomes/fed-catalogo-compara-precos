import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { LocalizacaoStore, Municipio, RAIOS_KM, filtrarMunicipios } from './localizacao.store';

@Component({
  selector: 'cp-localizacao-seletor',
  imports: [MatAutocompleteModule, MatIconModule],
  template: `
    <section class="cp-block" aria-labelledby="localizacao-titulo">
      <div>
        <h2 id="localizacao-titulo" class="cp-section-title">Onde você está?</h2>
        <p class="cp-field-hint">
          A busca usa o serviço Menor Preço, do Governo do Paraná. Enviamos só uma área aproximada
          (cerca de 150 m), e nada da sua localização é salvo na sua conta.
        </p>
      </div>

      <button type="button" class="cp-btn-primary" [disabled]="localizando()" (click)="usarGps()">
        <mat-icon aria-hidden="true">my_location</mat-icon>
        {{ localizando() ? 'Localizando…' : 'Usar minha localização' }}
      </button>

      @switch (loc.status()) {
        @case ('negado') {
          <div class="cp-info-block cp-info-block--warn" role="alert">
            <mat-icon aria-hidden="true">location_off</mat-icon>
            Sem permissão de localização. Escolha a cidade abaixo.
          </div>
        }
        @case ('indisponivel') {
          <div class="cp-info-block cp-info-block--warn" role="alert">
            <mat-icon aria-hidden="true">location_off</mat-icon>
            Não foi possível obter sua localização. Escolha a cidade abaixo.
          </div>
        }
      }

      <label class="cp-field">
        <span>Ou escolha a cidade</span>
        <input
          type="text"
          autocomplete="off"
          placeholder="Ex.: Curitiba"
          [value]="texto()"
          [matAutocomplete]="lista"
          (input)="digitar($event)"
          (focus)="carregar()"
        />
      </label>
      <mat-autocomplete #lista="matAutocomplete" (optionSelected)="escolher($event)">
        @for (m of sugestoes(); track m.nome) {
          <mat-option [value]="m">{{ m.nome }}</mat-option>
        }
      </mat-autocomplete>
      @if (erroLista()) {
        <span class="cp-field-error">Não foi possível carregar a lista de cidades.</span>
      }

      <div>
        <span class="cp-label" id="raio-rotulo">Raio da busca</span>
        <div class="cp-segmented" role="group" aria-labelledby="raio-rotulo">
          @for (km of raios; track km) {
            <button
              type="button"
              [attr.aria-pressed]="loc.raioKm() === km"
              (click)="loc.definirRaio(km)"
            >
              {{ km }} km
            </button>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .cp-segmented {
      margin-top: 6px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalizacaoSeletor {
  protected readonly loc = inject(LocalizacaoStore);

  readonly escolhido = output<void>();

  protected readonly raios = RAIOS_KM;
  protected readonly texto = signal('');
  protected readonly erroLista = signal(false);
  private readonly municipios = signal<Municipio[]>([]);
  protected readonly sugestoes = computed(() => filtrarMunicipios(this.municipios(), this.texto()));
  protected readonly localizando = computed(() => this.loc.status() === 'localizando');

  protected async carregar(): Promise<void> {
    if (this.municipios().length) return;
    try {
      this.municipios.set(await this.loc.municipios());
      this.erroLista.set(false);
    } catch {
      this.erroLista.set(true);
    }
  }

  protected digitar(evento: Event): void {
    this.texto.set((evento.target as HTMLInputElement).value);
    void this.carregar();
  }

  protected escolher(evento: MatAutocompleteSelectedEvent): void {
    const m = evento.option.value as Municipio;
    this.texto.set(m.nome);
    this.loc.escolherMunicipio(m);
    this.escolhido.emit();
  }

  protected usarGps(): void {
    this.loc.usarGps();
  }
}
