import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { encodeGeohash, semAcento } from '@shared/index';
import { firstValueFrom } from 'rxjs';

export interface Municipio {
  nome: string;
  lat: number;
  lng: number;
}

export type OrigemLocalizacao = 'gps' | 'municipio';
export type StatusLocalizacao = 'ocioso' | 'localizando' | 'negado' | 'indisponivel';

export const RAIOS_KM = [1, 2, 5, 10] as const;
export const PRECISAO_GEOHASH = 7;
const CHAVE_STORAGE = 'cp-localizacao';

interface Preferencia {
  origem: OrigemLocalizacao | null;
  municipio: string | null;
  raioKm: number;
}

export const GEOLOCALIZACAO = new InjectionToken<Geolocation | null>('GEOLOCALIZACAO', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.geolocation) || null,
});

function lerPreferencia(): Preferencia | null {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    return bruto ? (JSON.parse(bruto) as Preferencia) : null;
  } catch {
    return null;
  }
}

/**
 * Localização do usuário para a busca no Menor Preço. A posição exata nunca é guardada:
 * só o geohash de 7 caracteres (~150 m) vive em memória, e o localStorage recebe apenas a
 * origem, o município escolhido e o raio (RNF-35).
 */
@Injectable({ providedIn: 'root' })
export class LocalizacaoStore {
  private readonly http = inject(HttpClient);
  private readonly geo = inject(GEOLOCALIZACAO);
  private municipiosCache: Promise<Municipio[]> | null = null;

  private readonly _origem = signal<OrigemLocalizacao | null>(null);
  private readonly _geohash = signal<string | null>(null);
  private readonly _municipio = signal<string | null>(null);
  private readonly _raioKm = signal(2);
  private readonly _status = signal<StatusLocalizacao>('ocioso');

  readonly origem = this._origem.asReadonly();
  readonly geohash = this._geohash.asReadonly();
  readonly municipio = this._municipio.asReadonly();
  readonly raioKm = this._raioKm.asReadonly();
  readonly status = this._status.asReadonly();
  readonly pronta = computed(() => !!this._geohash());
  readonly descricao = computed(() =>
    this._origem() === 'gps' ? 'Sua localização' : (this._municipio() ?? 'Sem localização'),
  );

  constructor() {
    const p = lerPreferencia();
    if (!p) return;
    if (RAIOS_KM.includes(p.raioKm as (typeof RAIOS_KM)[number])) this._raioKm.set(p.raioKm);
    if (p.origem === 'municipio' && p.municipio) void this.restaurarMunicipio(p.municipio);
    else if (p.origem === 'gps') this.usarGps();
  }

  municipios(): Promise<Municipio[]> {
    this.municipiosCache ??= firstValueFrom(
      this.http.get<Municipio[]>('assets/data/municipios-pr.json'),
    ).catch((e: unknown) => {
      this.municipiosCache = null;
      throw e;
    });
    return this.municipiosCache;
  }

  usarGps(): void {
    if (!this.geo) {
      this._status.set('indisponivel');
      return;
    }
    this._status.set('localizando');
    this.geo.getCurrentPosition(
      (pos) => {
        this._geohash.set(
          encodeGeohash(pos.coords.latitude, pos.coords.longitude, PRECISAO_GEOHASH),
        );
        this._origem.set('gps');
        this._municipio.set(null);
        this._status.set('ocioso');
        this.salvar();
      },
      (erro) => {
        this._status.set(erro.code === erro.PERMISSION_DENIED ? 'negado' : 'indisponivel');
        if (this._origem() === 'gps') {
          this._origem.set(null);
          this._geohash.set(null);
          this.salvar();
        }
      },
      { maximumAge: 5 * 60 * 1000, timeout: 15_000, enableHighAccuracy: false },
    );
  }

  escolherMunicipio(m: Municipio): void {
    this._geohash.set(encodeGeohash(m.lat, m.lng, PRECISAO_GEOHASH));
    this._municipio.set(m.nome);
    this._origem.set('municipio');
    this._status.set('ocioso');
    this.salvar();
  }

  definirRaio(km: number): void {
    this._raioKm.set(km);
    this.salvar();
  }

  private async restaurarMunicipio(nome: string): Promise<void> {
    try {
      const alvo = semAcento(nome).toLowerCase();
      const m = (await this.municipios()).find((x) => semAcento(x.nome).toLowerCase() === alvo);
      if (m && !this._geohash()) this.escolherMunicipio(m);
    } catch {
      /* lista indisponível: o usuário escolhe de novo */
    }
  }

  private salvar(): void {
    const p: Preferencia = {
      origem: this._origem(),
      municipio: this._origem() === 'municipio' ? this._municipio() : null,
      raioKm: this._raioKm(),
    };
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(p));
    } catch {
      /* storage bloqueado: preferência só nesta sessão */
    }
  }
}

export function filtrarMunicipios(
  lista: readonly Municipio[],
  texto: string,
  limite = 8,
): Municipio[] {
  const alvo = semAcento(texto).toLowerCase().trim();
  if (!alvo) return [];
  const comeca: Municipio[] = [];
  const contem: Municipio[] = [];
  for (const m of lista) {
    const nome = semAcento(m.nome).toLowerCase();
    if (nome.startsWith(alvo)) comeca.push(m);
    else if (nome.includes(alvo)) contem.push(m);
  }
  return [...comeca, ...contem].slice(0, limite);
}
