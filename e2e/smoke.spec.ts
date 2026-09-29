import { expect, test } from '@playwright/test';

test('a página inicial carrega com o título do app', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/Cupom Esperto/);
});

test('rota inexistente mostra a página de erro', async ({ page }) => {
  await page.goto('/nao-existe');
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
