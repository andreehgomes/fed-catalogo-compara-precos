import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

test('assets do scanner e da localização são servidos pelo próprio app (sem CDN)', async ({
  request,
}) => {
  const wasm = await request.get('/assets/zxing/zxing_reader.wasm');
  expect(wasm.status()).toBe(200);
  expect((await wasm.body()).subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  const municipios = await request.get('/assets/data/municipios-pr.json');
  expect(await municipios.json()).toHaveLength(399);
});

test('o leitor decodifica no navegador as imagens de QR e EAN geradas localmente', async ({
  page,
}) => {
  await page.goto('/login');
  await page.addScriptTag({
    path: resolve(__dirname, '../node_modules/zxing-wasm/dist/iife/reader/index.js'),
  });
  for (const [arquivo, esperado] of [
    [
      'qr-nfce-pr.png',
      'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41260903644587000836652100000168701620438547|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651',
    ],
    ['ean-coca-cola.png', '7894900011517'],
  ]) {
    const base64 = readFileSync(resolve(__dirname, 'fixtures', arquivo)).toString('base64');
    const lido = await page.evaluate(async (b64) => {
      const z = (
        window as unknown as {
          ZXingWASM: {
            setZXingModuleOverrides(o: object): void;
            readBarcodes(b: Blob, o: object): Promise<{ text: string }[]>;
          };
        }
      ).ZXingWASM;
      z.setZXingModuleOverrides({
        locateFile: (p: string, prefixo: string) =>
          p.endsWith('.wasm') ? `/assets/zxing/${p}` : prefixo + p,
      });
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const r = await z.readBarcodes(new Blob([bytes], { type: 'image/png' }), {
        formats: ['QRCode', 'EAN13'],
      });
      return r[0]?.text;
    }, base64);
    expect(lido).toBe(esperado);
  }
});

test.describe('preços perto de mim (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions([]);
    await bloquearServicosReais(page);
    await entrar(page);
  });

  test('negar localização leva à cidade; busca por EAN pela galeria esconde os divergentes', async ({
    page,
  }) => {
    const mp = await mockMenorPreco(page);
    await page.goto('/regiao');
    await page.getByRole('button', { name: 'Usar minha localização' }).click();
    await expect(page.getByText('Escolha a cidade abaixo')).toBeVisible();
    await page.getByLabel('Ou escolha a cidade').fill('Curitiba');
    await page.getByRole('option', { name: 'Curitiba' }).click();

    await page.getByRole('button', { name: 'Ler código de barras' }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve(__dirname, 'fixtures/ean-coca-cola.png'));

    await expect(page).toHaveURL(/gtin=7894900011517/);
    const lista = page.getByRole('list', { name: 'Ofertas com este código de barras' });
    await expect(lista.getByRole('listitem').first()).toContainText('COCA');
    await expect(lista).not.toContainText('CAFE VIAGEM');
    await page
      .getByRole('button', { name: /Mostrar \d+ resultados com descrição diferente/ })
      .click();
    await expect(page.getByText('CAFE VIAGEM').first()).toBeVisible();
    expect(
      mp.chamadas.every(
        (c) => c.includes('local=') && /local=[0-9a-z]{7}&|local=[0-9a-z]{7}$/.test(c),
      ),
    ).toBe(true);

    const antes = mp.chamadas.length;
    await page.reload();
    await expect(lista.getByRole('listitem').first()).toBeVisible();
    expect(mp.chamadas.length).toBe(antes);
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(storage).not.toMatch(/-25\.|-49\./);
  });

  test('Menor Preço fora do ar mostra indisponível e o app segue navegável', async ({ page }) => {
    await mockMenorPreco(page, { fora: true });
    await page.goto('/regiao?termo=leite%20integral');
    await page.getByLabel('Ou escolha a cidade').fill('Curitiba');
    await page.getByRole('option', { name: 'Curitiba' }).click();
    await expect(page.getByText('Menor Preço indisponível agora')).toBeVisible();
    await page.goto('/notas');
    await expect(page.getByRole('heading', { name: 'Minhas notas' })).toBeVisible();
  });
});
