// Gera src/assets/data/municipios-pr.json (nome + centróide) a partir das APIs públicas
// do IBGE: nomes em /localidades e contornos em /malhas (qualidade mínima). O centróide é
// o de área do maior polígono de cada município. Rodar uma vez; o arquivo é versionado.
import { mkdirSync, writeFileSync } from 'node:fs';

const IBGE = 'https://servicodados.ibge.gov.br/api';
const UF = 41;

const localidades = await (await fetch(`${IBGE}/v1/localidades/estados/${UF}/municipios`)).json();
const malha = await (
  await fetch(
    `${IBGE}/v3/malhas/estados/${UF}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`,
  )
).json();

function centroideAnel(anel) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anel.length - 1; i++) {
    const [x0, y0] = anel[i];
    const [x1, y1] = anel[i + 1];
    const f = x0 * y1 - x1 * y0;
    area += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  area /= 2;
  return { area: Math.abs(area), lng: cx / (6 * area), lat: cy / (6 * area) };
}

function centroide(geometria) {
  const poligonos =
    geometria.type === 'MultiPolygon' ? geometria.coordinates : [geometria.coordinates];
  return poligonos.map((p) => centroideAnel(p[0])).sort((a, b) => b.area - a.area)[0];
}

const porCodigo = new Map(
  malha.features.map((f) => [String(f.properties.codarea), centroide(f.geometry)]),
);

const municipios = localidades
  .map((m) => {
    const c = porCodigo.get(String(m.id));
    if (!c) throw new Error(`Sem malha para ${m.nome} (${m.id})`);
    return { nome: m.nome, lat: Number(c.lat.toFixed(4)), lng: Number(c.lng.toFixed(4)) };
  })
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

const destino = new URL('../src/assets/data/', import.meta.url);
mkdirSync(destino, { recursive: true });
writeFileSync(new URL('municipios-pr.json', destino), JSON.stringify(municipios) + '\n');
console.log(`${municipios.length} municípios gravados.`);
