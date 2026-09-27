import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  GEOLOCALIZACAO,
  LocalizacaoStore,
  Municipio,
  filtrarMunicipios,
} from './localizacao.store';

const CURITIBA: Municipio = { nome: 'Curitiba', lat: -25.4284, lng: -49.2733 };
const MUNICIPIOS: Municipio[] = [
  CURITIBA,
  { nome: 'Campo Largo', lat: -25.45, lng: -49.52 },
  { nome: 'São José dos Pinhais', lat: -25.53, lng: -49.2 },
  { nome: 'Maringá', lat: -23.4, lng: -51.97 },
];

function geoFalso(resultado: 'ok' | 'negado' | 'erro') {
  return {
    getCurrentPosition: vi.fn((ok: PositionCallback, erro?: PositionErrorCallback | null) => {
      if (resultado === 'ok')
        ok({ coords: { latitude: -25.4284, longitude: -49.2733 } } as GeolocationPosition);
      else
        erro?.({
          code: resultado === 'negado' ? 1 : 2,
          PERMISSION_DENIED: 1,
        } as GeolocationPositionError);
    }),
  } as unknown as Geolocation;
}

function montar(geo: Geolocation | null = geoFalso('ok')) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: GEOLOCALIZACAO, useValue: geo },
    ],
  });
  return { store: TestBed.inject(LocalizacaoStore), http: TestBed.inject(HttpTestingController) };
}

describe('LocalizacaoStore', () => {
  beforeEach(() => localStorage.clear());

  it('GPS gera geohash de 7 caracteres e não guarda coordenadas', () => {
    const geo = geoFalso('ok');
    const { store } = montar(geo);
    store.usarGps();
    expect(store.geohash()).toBe('6gkzqfb');
    expect(store.origem()).toBe('gps');
    expect(geo.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ maximumAge: 300_000 }),
    );
    const salvo = localStorage.getItem('cp-localizacao')!;
    expect(salvo).not.toMatch(/-25|-49|6gkz/);
    expect(JSON.parse(salvo)).toEqual({ origem: 'gps', municipio: null, raioKm: 2 });
  });

  it('negar a permissão leva ao status "negado" (a tela mostra o seletor de cidade)', () => {
    const { store } = montar(geoFalso('negado'));
    store.usarGps();
    expect(store.status()).toBe('negado');
    expect(store.pronta()).toBe(false);
  });

  it('sem API de geolocalização, fica indisponível', () => {
    const { store } = montar(null);
    store.usarGps();
    expect(store.status()).toBe('indisponivel');
  });

  it('escolher Curitiba gera geohash de 7 e persiste só cidade e raio', () => {
    const { store } = montar();
    store.escolherMunicipio(CURITIBA);
    store.definirRaio(5);
    expect(store.geohash()).toHaveLength(7);
    expect(store.descricao()).toBe('Curitiba');
    expect(JSON.parse(localStorage.getItem('cp-localizacao')!)).toEqual({
      origem: 'municipio',
      municipio: 'Curitiba',
      raioKm: 5,
    });
  });

  it('restaura a cidade salva buscando o centróide na lista', async () => {
    localStorage.setItem(
      'cp-localizacao',
      JSON.stringify({ origem: 'municipio', municipio: 'Curitiba', raioKm: 10 }),
    );
    const { store, http } = montar();
    expect(store.raioKm()).toBe(10);
    http.expectOne('assets/data/municipios-pr.json').flush(MUNICIPIOS);
    await vi.waitFor(() => expect(store.geohash()).toBe('6gkzqfb'));
    expect(store.municipio()).toBe('Curitiba');
  });

  it('restaura a preferência por GPS pedindo a posição de novo', () => {
    localStorage.setItem(
      'cp-localizacao',
      JSON.stringify({ origem: 'gps', municipio: null, raioKm: 2 }),
    );
    const geo = geoFalso('ok');
    const { store } = montar(geo);
    expect(geo.getCurrentPosition).toHaveBeenCalled();
    expect(store.pronta()).toBe(true);
  });

  it('localStorage quebrado não impede o uso', () => {
    const espiao = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { store } = montar();
    expect(store.pronta()).toBe(false);
    espiao.mockRestore();
  });
});

describe('filtrarMunicipios', () => {
  it('ignora acento e prioriza o começo do nome', () => {
    expect(filtrarMunicipios(MUNICIPIOS, 'sao jose').map((m) => m.nome)).toEqual([
      'São José dos Pinhais',
    ]);
    expect(filtrarMunicipios(MUNICIPIOS, 'c').map((m) => m.nome)).toEqual([
      'Curitiba',
      'Campo Largo',
    ]);
    expect(filtrarMunicipios(MUNICIPIOS, 'ma').map((m) => m.nome)).toEqual(['Maringá']);
    expect(filtrarMunicipios(MUNICIPIOS, 'in').map((m) => m.nome)).toEqual([
      'São José dos Pinhais',
      'Maringá',
    ]);
    expect(filtrarMunicipios(MUNICIPIOS, '  ')).toEqual([]);
  });
});
