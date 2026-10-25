import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arquivo = fileURLToPath(new URL('../src/app/shared/style/_tokens.scss', import.meta.url));
const fonte = readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');

const TEMAS = ['claro', 'escuro'];

const mapa = /\$cp-cores:\s*\(([\s\S]*?)\n\);/.exec(fonte);
if (!mapa) throw new Error('Mapa $cp-cores não encontrado em _tokens.scss');
const cores = new Map();
for (const [, nome, par] of mapa[1].matchAll(/^\s*([\w-]+):\s*\((.+)\),?$/gm)) {
  cores.set(nome, separarPar(par));
}

const tokens = new Map();
for (const [, nome, valor] of fonte.matchAll(/^\$(cp-[\w-]+):\s*([^;]+);/gm)) {
  tokens.set(nome, valor.trim());
}

function separarPar(par) {
  let nivel = 0;
  for (let i = 0; i < par.length; i++) {
    if (par[i] === '(') nivel++;
    else if (par[i] === ')') nivel--;
    else if (par[i] === ',' && nivel === 0)
      return [par.slice(0, i).trim(), par.slice(i + 1).trim()];
  }
  throw new Error(`Par sem dois valores: (${par})`);
}

function hex(nome, tema, visitados = new Set()) {
  const valor = tokens.get(nome);
  if (!valor) throw new Error(`Token $${nome} não encontrado em _tokens.scss`);
  if (valor.startsWith('$')) {
    const alvo = valor.slice(1);
    if (visitados.has(alvo)) throw new Error(`Ciclo em $${nome}`);
    return hex(alvo, tema, visitados.add(alvo));
  }
  const variavel = /^var\(--(cp-[\w-]+)\)$/.exec(valor);
  if (!variavel) throw new Error(`$${nome} não aponta para uma cor de $cp-cores: ${valor}`);
  const par = cores.get(variavel[1].slice('cp-'.length));
  if (!par) throw new Error(`--${variavel[1]} não está em $cp-cores`);
  const cor = par[TEMAS.indexOf(tema)];
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cor);
  if (!m) throw new Error(`$${nome} (${tema}) não é uma cor hex: ${cor}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

function luminancia(cor) {
  const canais = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function razao(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const TEXTO = 4.5;
const GRANDE = 3;

const superficies = ['cp-bg', 'cp-surface', 'cp-surface-subtle', 'cp-surface-input'];
const textos = ['cp-text', 'cp-text-body', 'cp-text-secondary', 'cp-text-muted', 'cp-text-label'];

const pares = [
  ...textos.flatMap((t) => superficies.map((s) => [t, s, TEXTO])),
  ['cp-text-placeholder', 'cp-surface-input', GRANDE],
  ['cp-accent-ink', 'cp-surface', TEXTO],
  ['cp-accent-ink', 'cp-bg', TEXTO],
  ['cp-accent-ink', 'cp-accent-soft', TEXTO],
  ['cp-accent-ink', 'cp-accent-hover', TEXTO],
  ['cp-accent-ink', 'cp-surface-subtle', TEXTO],
  ['cp-on-shell', 'cp-accent', TEXTO],
  ['cp-on-shell', 'cp-shell-900', TEXTO],
  ['cp-shell-700', 'cp-surface', GRANDE],
  ['cp-nav-item', 'cp-nav-bg', TEXTO],
  ['cp-nav-item', 'cp-nav-item-hover', TEXTO],
  ['cp-nav-item-active', 'cp-nav-item-active-bg', TEXTO],
  ['cp-nav-group', 'cp-nav-bg', TEXTO],
  ['cp-text-muted', 'cp-accent-soft', TEXTO],
  ['cp-cheaper', 'cp-surface', TEXTO],
  ['cp-cheaper', 'cp-cheaper-soft', TEXTO],
  ['cp-pricier', 'cp-surface', TEXTO],
  ['cp-pricier', 'cp-pricier-soft', TEXTO],
  ['cp-cheaper', 'cp-surface-subtle', TEXTO],
  ['cp-pricier', 'cp-surface-subtle', TEXTO],
  ['cp-warn', 'cp-warn-soft', TEXTO],
  ['cp-warn', 'cp-surface', TEXTO],
  ['cp-success', 'cp-success-soft', TEXTO],
  ['cp-success', 'cp-surface', TEXTO],
  ['cp-info', 'cp-info-soft', TEXTO],
  ['cp-info', 'cp-surface', TEXTO],
  ['cp-danger-action', 'cp-surface', TEXTO],
  ['cp-danger-action', 'cp-danger-soft', GRANDE],
  ['cp-accent', 'cp-surface', GRANDE],
  ['cp-accent', 'cp-bg', GRANDE],
  ...[1, 2, 3, 4, 5].map((i) => [`cp-serie-${i}`, 'cp-surface', TEXTO]),
  ['cp-grafico-grade', 'cp-surface', 1],
];

// A barra do navegador (`<meta name="theme-color">` do index.html) tem a cor do header.
const indexHtml = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
for (const tema of TEMAS) {
  const meta = new RegExp(`<meta[^>]*data-tema="${tema}"[^>]*content="(#[0-9a-f]+)"`, 'i').exec(
    indexHtml.replace(/\s+/g, ' '),
  );
  const esperado = hex('cp-surface', tema);
  if (meta?.[1].toLowerCase() !== esperado) {
    console.error(
      `theme-color ${tema} do index.html (${meta?.[1]}) difere de $cp-surface (${esperado}).`,
    );
    process.exitCode = 1;
  }
}

let falhas = 0;
const linhas = TEMAS.flatMap((tema) =>
  pares.map(([frente, fundo, minimo]) => {
    const r = razao(hex(frente, tema), hex(fundo, tema));
    const ok = r >= minimo;
    if (!ok) falhas++;
    return {
      tema,
      frente: `$${frente}`,
      fundo: `$${fundo}`,
      razao: r.toFixed(2),
      minimo:
        minimo === TEXTO
          ? '4.5 (texto)'
          : minimo === GRANDE
            ? '3.0 (grande/ícone)'
            : '1.0 (decorativo)',
      resultado: ok ? 'ok' : 'FALHOU',
    };
  }),
);

console.table(linhas);

if (falhas > 0) {
  console.error(`\n${falhas} par(es) abaixo do mínimo WCAG AA.`);
  process.exit(1);
}
console.log(`\n${pares.length} pares aprovados em WCAG AA nos temas ${TEMAS.join(' e ')}.`);
