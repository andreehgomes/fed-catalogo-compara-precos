import { expect, test, type Page } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais } from './support/mocks';

const FUNDO_CLARO = 'rgb(243, 246, 243)';
const FUNDO_ESCURO = 'rgb(15, 21, 18)';

const fundo = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const tema = (page: Page) => page.evaluate(() => document.documentElement.dataset['tema'] ?? null);

test.describe('tema sem login', () => {
  test('segue o sistema: escuro com a logo para fundo escuro', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/login');
    await expect(page.getByRole('img', { name: 'Cupom Esperto' })).toHaveAttribute(
      'src',
      /logo-escuro\.png/,
    );
    expect(await tema(page)).toBeNull();
    expect(await fundo(page)).toBe(FUNDO_ESCURO);
  });

  test('a preferência salva vence o sistema já no carregamento', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('cp-tema', 'escuro'));
    await page.goto('/login');
    expect(await tema(page)).toBe('escuro');
    expect(await fundo(page)).toBe(FUNDO_ESCURO);
    await expect(page.locator('meta[name="theme-color"][media="all"]')).toHaveAttribute(
      'content',
      '#171f1b',
    );
  });
});

test.describe('tema com login (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await entrar(page);
  });

  test('"Aparência" troca o tema, a escolha sobrevive ao recarregar e "Sistema" volta ao SO', async ({
    page,
    isMobile,
  }) => {
    const abrirAparencia = async () => {
      if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
      await page.getByRole('button', { name: /^Aparência/ }).click();
    };

    await abrirAparencia();
    await expect(page.getByRole('menuitemradio', { name: /Sistema/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('menuitemradio', { name: /Claro/ }).click();
    expect(await tema(page)).toBe('claro');
    expect(await fundo(page)).toBe(FUNDO_CLARO);

    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    expect(await tema(page)).toBe('claro');

    await abrirAparencia();
    await page.getByRole('menuitemradio', { name: /Sistema/ }).click();
    expect(await tema(page)).toBeNull();
    expect(await fundo(page)).toBe(FUNDO_ESCURO);
  });
});
