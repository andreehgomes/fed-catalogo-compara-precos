import { Page, expect } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA } from './env';

export async function entrar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(E2E_EMAIL);
  await page.getByLabel('Senha').fill(E2E_SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
