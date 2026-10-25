// Gera ícones da PWA, favicon e as imagens da marca a partir de public/logo/logos.png
// (arte do ChatGPT). Canvas no Chromium do Playwright, sem dependência de imagem no Node.
// - Ícones e favicon: o símbolo do ícone escuro, num quadrado cheio da mesma cor
//   ("maskable": o desenho fica dentro da zona segura, o círculo de 80%).
// - logo/logo.png e logo/simbolo.png: versões sobre branco com o branco convertido em
//   transparência (desfaz a mistura com o branco), para qualquer fundo claro.
// - logo/logo-escuro.png e logo/simbolo-escuro.png (tema escuro): o papel do cupom, branco
//   cercado pelo contorno, fica opaco; o texto é repintado nas cores claras do tema
//   (accent-ink e text do escuro em _tokens.scss), mantendo o alfa.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const TAMANHOS = [72, 96, 128, 144, 152, 192, 384, 512];
const FUNDO_ICONE = '#0d3320';
const ICONE = { x: 568, y: 588, lado: 300, simbolo: 264 };
const LOGO = { x: 84, y: 177, w: 1286, h: 270 };
const SIMBOLO = { x: 1021, y: 602, w: 292, h: 292 };
// Colunas na logo de 720 px: símbolo até 152, "Cupom" de 167 a 415, "Esperto" de 435 em diante.
const LOGO_ESCURO = {
  papelAte: 160,
  cores: [
    { de: 160, ate: 425, cor: '#7fd3a3' },
    { de: 425, ate: Infinity, cor: '#e6ece8' },
  ],
};
const SIMBOLO_ESCURO = { papelAte: Infinity, cores: [] };

const fonte = `data:image/png;base64,${readFileSync('public/logo/logos.png').toString('base64')}`;
const navegador = await chromium.launch();
const pagina = await navegador.newPage();

const recortar = (
  origem,
  largura,
  altura,
  { fundo = null, escala = 1, transparente = false, escuro = null },
) =>
  pagina
    .evaluate(
      async ({ fonte, origem, largura, altura, fundo, escala, transparente, escuro }) => {
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
        ctx.drawImage(
          img,
          origem.x,
          origem.y,
          origem.w,
          origem.h,
          (largura - w) / 2,
          (altura - h) / 2,
          w,
          h,
        );
        if (transparente || escuro) {
          const dados = ctx.getImageData(0, 0, largura, altura);
          const p = dados.data;
          const original = new Uint8ClampedArray(p);
          const total = largura * altura;
          const alfas = new Float32Array(total);
          for (let k = 0; k < total; k++) {
            alfas[k] = Math.max(255 - p[4 * k], 255 - p[4 * k + 1], 255 - p[4 * k + 2]) / 255;
          }
          const papel = new Uint8Array(total);
          if (escuro) {
            // Fora = claro alcançável a partir da borda; claro que sobra no símbolo é o papel.
            const fora = new Uint8Array(total);
            const pilha = [];
            const visitar = (x, y) => {
              const k = y * largura + x;
              if (x < 0 || y < 0 || x >= largura || y >= altura || fora[k] || alfas[k] >= 0.5)
                return;
              fora[k] = 1;
              pilha.push(k);
            };
            for (let x = 0; x < largura; x++) (visitar(x, 0), visitar(x, altura - 1));
            for (let y = 0; y < altura; y++) (visitar(0, y), visitar(largura - 1, y));
            while (pilha.length) {
              const k = pilha.pop();
              const x = k % largura;
              const y = (k - x) / largura;
              (visitar(x + 1, y), visitar(x - 1, y), visitar(x, y + 1), visitar(x, y - 1));
            }
            for (let k = 0; k < total; k++) {
              if (!fora[k] && alfas[k] < 0.5 && k % largura < escuro.papelAte) papel[k] = 1;
            }
            // Dilata 2 px para levar junto o antisserrilhado entre o papel e o contorno.
            for (let passo = 0; passo < 2; passo++) {
              const antes = new Uint8Array(papel);
              for (let k = largura; k < total - largura; k++) {
                if (antes[k] || fora[k]) continue;
                if (antes[k - 1] || antes[k + 1] || antes[k - largura] || antes[k + largura])
                  papel[k] = 1;
              }
            }
          }
          const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
          for (let k = 0; k < total; k++) {
            const i = 4 * k;
            if (papel[k]) {
              p[i + 3] = 255;
              continue;
            }
            const alfa = alfas[k];
            if (alfa < 0.03) {
              p[i + 3] = 0;
              continue;
            }
            const x = k % largura;
            const faixa = escuro?.cores.find((f) => x >= f.de && x < f.ate);
            const cor = faixa ? rgb(faixa.cor) : null;
            for (let c = 0; c < 3; c++)
              p[i + c] = cor ? cor[c] : Math.round(255 - (255 - original[i + c]) / alfa);
            p[i + 3] = Math.round(alfa * 255);
          }
          ctx.putImageData(dados, 0, 0);
        }
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      },
      { fonte, origem, largura, altura, fundo, escala, transparente, escuro },
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
const alturaLogo = Math.round((larguraLogo * LOGO.h) / LOGO.w);
writeFileSync(
  'public/logo/logo.png',
  await recortar(LOGO, larguraLogo, alturaLogo, { transparente: true }),
);
console.log('logo/logo.png');
writeFileSync('public/logo/simbolo.png', await recortar(SIMBOLO, 128, 128, { transparente: true }));
console.log('logo/simbolo.png');
writeFileSync(
  'public/logo/logo-escuro.png',
  await recortar(LOGO, larguraLogo, alturaLogo, { escuro: LOGO_ESCURO }),
);
console.log('logo/logo-escuro.png');
writeFileSync(
  'public/logo/simbolo-escuro.png',
  await recortar(SIMBOLO, 128, 128, { escuro: SIMBOLO_ESCURO }),
);
console.log('logo/simbolo-escuro.png');

const favicons = await Promise.all(
  [16, 32, 48].map(async (t) => ({ t, png: await icone(t, 0.9) })),
);
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
