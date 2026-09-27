import { expect, test } from '@playwright/test';
import { E2E_EMAIL, E2E_SENHA, MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';

test.describe('conta sem login', () => {
  test('rota protegida leva ao login guardando o destino', async ({ page }) => {
    await page.goto('/notas');
    await expect(page).toHaveURL(/\/login\?voltar=%2Fnotas$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });

  test('e-mail inválido e senha curta mostram erro acessível', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill('nao-e-email');
    await page.getByLabel('Senha').fill('123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('E-mail inválido.')).toBeVisible();
    await expect(page.getByText('A senha tem pelo menos 8 caracteres.')).toBeVisible();
  });

  test('login oferece Google, cadastro e redefinição', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeVisible();
    await page.getByRole('link', { name: 'Criar conta' }).click();
    await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
    await page.getByRole('link', { name: 'Já tenho conta' }).click();
    await page.getByRole('link', { name: 'Esqueci a senha' }).click();
    await expect(page.getByRole('heading', { name: 'Redefinir senha' })).toBeVisible();
  });
});

test.describe('conta com o usuário de teste (dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test('login → painel → sair', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(E2E_EMAIL);
    await page.getByLabel('Senha').fill(E2E_SENHA);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();

    const menu = page.getByRole('button', { name: /menu/ });
    if ((await menu.getAttribute('aria-expanded')) === 'false') await menu.click();
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
