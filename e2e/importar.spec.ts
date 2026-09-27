import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockCallables } from './support/mocks';

const CHAVE = '41260903644587000836652100000168701620438547';
const URL_QR = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651`;
const NOTA = {
  chave: CHAVE,
  emitente: {
    cnpj: '03644587000836',
    nome: 'SUPERMERCADO EXEMPLO LTDA',
    endereco: 'RUA DAS FLORES, 123, CURITIBA, PR',
    cidade: 'CURITIBA',
    uf: 'PR',
  },
  emissao: '2026-09-27T13:05:12.000Z',
  itens: [
    {
      n: 1,
      descricao: 'LEITE UHT INT 1L',
      codigo: '1001',
      ean: null,
      qtd: 2,
      unidade: 'UN',
      vlUnit: 4.49,
      vlTotal: 8.98,
    },
  ],
  total: 8.98,
  desconto: 0,
};

test.describe('importar nota (callables interceptadas)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
  });

  test('URL colada → prévia → confirmar → detalhe da nota', async ({ page }) => {
    const chamadas = await mockCallables(page, {
      previewNfce: { ok: true, nota: NOTA },
      confirmarNfce: { ok: true, chave: CHAVE },
    });
    await entrar(page);
    await page.goto('/importar');
    await page.getByLabel('Colar link do QR').fill(URL_QR);
    await page.getByRole('button', { name: 'Importar link' }).click();
    await expect(page).toHaveURL(/\/importar\/preview$/);
    await expect(page.getByRole('heading', { name: 'SUPERMERCADO EXEMPLO LTDA' })).toBeVisible();
    await expect(page.getByText('LEITE UHT INT 1L')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar importação' }).click();
    await expect(page).toHaveURL(new RegExp(`/notas/${CHAVE}$`));
    expect(chamadas.map((c) => c.nome)).toEqual(['previewNfce', 'confirmarNfce']);
  });

  test('chave com DV inválido mostra erro sem chamar a function', async ({ page }) => {
    const chamadas = await mockCallables(page, {});
    await entrar(page);
    await page.goto('/importar');
    await page.getByLabel('Digitar a chave de 44 dígitos').fill(CHAVE.slice(0, 43) + '0');
    await page.getByRole('button', { name: 'Importar chave' }).click();
    await expect(page.getByText('Essa chave não é válida')).toBeVisible();
    await expect(page.getByLabel('Digitar a chave de 44 dígitos')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(chamadas).toHaveLength(0);
  });

  test('SEFAZ fora → "Guardar e importar quando voltar" chama enfileirarNfce', async ({ page }) => {
    const chamadas = await mockCallables(page, {
      previewNfce: { ok: false, erro: { codigo: 'sefaz-indisponivel' } },
      enfileirarNfce: { ok: true, chave: CHAVE, proximaTentativa: '2026-09-27T15:15:00.000Z' },
    });
    await entrar(page);
    await page.goto('/importar');
    await page.getByLabel('Colar link do QR').fill(URL_QR);
    await page.getByRole('button', { name: 'Importar link' }).click();
    await expect(page.getByText('O site da SEFAZ-PR está fora do ar agora.')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar e importar quando voltar' }).click();
    await expect(page.getByText('Nota guardada')).toBeVisible();
    expect(chamadas.map((c) => c.nome)).toEqual(['previewNfce', 'enfileirarNfce']);
    expect(chamadas[1].dados).toEqual({ url: URL_QR });
  });

  test('QR lido da galeria leva à prévia', async ({ page }) => {
    await mockCallables(page, { previewNfce: { ok: true, nota: NOTA } });
    await entrar(page);
    await page.goto('/importar');
    await page.getByRole('button', { name: 'Ler QR Code do cupom' }).click();
    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve(__dirname, 'fixtures/qr-nfce-pr.png'));
    await expect(page).toHaveURL(/\/importar\/preview$/);
  });
});
