// Gera ícones da PWA, favicon e as imagens da marca a partir de public/logo/logos.png
// (arte do ChatGPT). Canvas no Chromium do Playwright, sem dependência de imagem no Node.
// - Ícones e favicon: o símbolo do ícone escuro, num quadrado cheio da mesma cor
//   ("maskable": o desenho fica dentro da zona segura, o círculo de 80%).
// - logo/logo.png e logo/simbolo.png: versões sobre branco com o branco convertido em
//   transparência (desfaz a mistura com o branco), para qualquer fundo claro.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const TAMANHOS = [72, 96, 128, 144, 152, 192, 384, 512];
const FUNDO_ICONE = '#0d3320';
const ICONE = { x: 568, y: 588, lado: 300, simbolo: 264 };
const LOGO = { x: 84, y: 177, w: 1286, h: 270 };
const SIMBOLO = { x: 1021, y: 602, w: 292, h: 292 };

const fonte = `data:image/png;base64,${readFileSync('public/logo/logos.png').toString('base64')}`;
const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const recortar = (origem, largura, altura, { fundo = null, escala = 1, transparente = false }) =>
  pagina
    .evaluate(
      async ({ fonte, origem, largura, altura, fundo, escala, transparente }) => {
        const img = new Image();
        img.src = fonte;
        await img.decode();
        const canvas = new OffscreenCanvas(largura, altura);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        if (fundo) {
          ctx.fillStyle = fundo;
          ctx.fillRect(0, 0, largura, altura);
        }
        const w = largura * escala;
        const h = altura * escala;
        ctx.drawImage(img, origem.x, origem.y, origem.w, origem.h, (largura - w) / 2, (altura - h) / 2, w, h);
        if (transparente) {
          const dados = ctx.getImageData(0, 0, largura, altura);
          const p = dados.data;
          for (let i = 0; i < p.length; i += 4) {
            const alfa = Math.max(255 - p[i], 255 - p[i + 1], 255 - p[i + 2]) / 255;
            if (alfa < 0.03) {
              p[i + 3] = 0;
              continue;
            }
            for (let c = 0; c < 3; c++) p[i + c] = Math.round(255 - (255 - p[i + c]) / alfa);
            p[i + 3] = Math.round(alfa * 255);
          }
          ctx.putImageData(dados, 0, 0);
        }
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      },
      { fonte, origem, largura, altura, fundo, escala, transparente },
    )
    .then((bytes) => Buffer.from(bytes));

const icone = (tamanho, proporcao) =>
  recortar({ x: ICONE.x, y: ICONE.y, w: ICONE.lado, h: ICONE.lado }, tamanho, tamanho, {
    fundo: FUNDO_ICONE,
    escala: (ICONE.lado / ICONE.simbolo) * proporcao,
  });

for (const t of TAMANHOS) {
  writeFileSync(`public/icons/icon-${t}x${t}.png`, await icone(t, 0.58));
  console.log(`icon-${t}x${t}.png`);
}

const larguraLogo = 720;
writeFileSync(
  'public/logo/logo.png',
  await recortar(LOGO, larguraLogo, Math.round((larguraLogo * LOGO.h) / LOGO.w), { transparente: true }),
);
console.log('logo/logo.png');
writeFileSync('public/logo/simbolo.png', await recortar(SIMBOLO, 128, 128, { transparente: true }));
console.log('logo/simbolo.png');

const favicons = await Promise.all([16, 32, 48].map(async (t) => ({ t, png: await icone(t, 0.9) })));
const cabecalho = Buffer.alloc(6 + 16 * favicons.length);
cabecalho.writeUInt16LE(1, 2);
cabecalho.writeUInt16LE(favicons.length, 4);
let deslocamento = cabecalho.length;
favicons.forEach(({ t, png }, i) => {
  const e = 6 + 16 * i;
  cabecalho.writeUInt8(t, e);
  cabecalho.writeUInt8(t, e + 1);
  cabecalho.writeUInt16LE(1, e + 4);
  cabecalho.writeUInt16LE(32, e + 6);
  cabecalho.writeUInt32LE(png.length, e + 8);
  cabecalho.writeUInt32LE(deslocamento, e + 12);
  deslocamento += png.length;
});
writeFileSync('public/favicon.ico', Buffer.concat([cabecalho, ...favicons.map((f) => f.png)]));
console.log('favicon.ico');

await navegador.close();
