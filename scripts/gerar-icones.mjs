// Gera os ícones da PWA (verdes, "maskable": o desenho fica dentro da zona segura de 80%)
// renderizando um SVG no Chromium do Playwright. Cores: $cp-accent e $cp-shell-900.
import { chromium } from '@playwright/test';

const TAMANHOS = [72, 96, 128, 144, 152, 192, 384, 512];
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1f7a4d"/>
  <g fill="none" stroke="#ffffff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <path d="M150 214 L206 132"/>
    <path d="M362 214 L306 132"/>
    <path d="M118 214 H394 L364 372 Q360 392 340 392 H172 Q152 392 148 372 Z"/>
    <path d="M214 266 V340"/>
    <path d="M298 266 V340"/>
  </g>
  <circle cx="376" cy="148" r="46" fill="#0a2418" stroke="#ffffff" stroke-width="14"/>
  <path d="M358 150 L372 164 L396 136" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const t of TAMANHOS) {
  await pagina.setViewportSize({ width: t, height: t });
  await pagina.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${t}" height="${t}" `)}</body></html>`,
  );
  await pagina.screenshot({ path: `public/icons/icon-${t}x${t}.png`, omitBackground: false });
  console.log(`icon-${t}x${t}.png`);
}
await navegador.close();
