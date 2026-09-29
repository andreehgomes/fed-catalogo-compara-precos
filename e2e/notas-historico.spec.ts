import { expect, test } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

test.describe('detalhe da nota: comparado com a última vez (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
    await mockMenorPreco(page);
    await entrar(page);
  });

  test('resumo, filtro "Subiram" na URL e expansão de um item', async ({ page }) => {
    await page.goto('/notas');
    const notas = page.getByRole('list', { name: 'Notas' }).getByRole('link');
    await expect(notas.first().or(page.getByText('Importar primeira nota'))).toBeVisible();
    test.skip((await notas.count()) < 2, 'O usuário de teste precisa de ao menos 2 notas');

    await notas.first().click();
    await expect(page).toHaveURL(/\/notas\/\d{44}/);
    const resumo = page.getByRole('status').filter({ hasText: 'Comparado com a última vez' });
    await expect(resumo).toBeVisible();
    await expect(
      resumo.getByText(/itens comparados|Primeira vez com esses produtos/),
    ).toBeVisible();

    const subiram = page.getByRole('button', { name: /Subiram/ });
    await subiram.click();
    await expect(page).toHaveURL(/[?&]itens=subiram/);
    await expect(subiram).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: /^Todos/ }).click();
    await expect(page).not.toHaveURL(/itens=/);

    const expandir = page.getByRole('button', { name: 'Ver compras' }).first();
    test.skip((await expandir.count()) === 0, 'Nenhum item desta nota foi comprado antes');
    await expandir.click();
    await expect(expandir).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Ver histórico completo' }).first()).toBeVisible();
  });
});
