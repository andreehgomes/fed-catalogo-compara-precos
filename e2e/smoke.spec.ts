import { expect, test } from '@playwright/test';

test('a página inicial carrega com o título do app', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Compara Preços');
});
