import { expect, test } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

test.describe('sugestão de compra (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
    await mockMenorPreco(page);
    await entrar(page);
  });

  test('abre pelo menu, troca a visão e o horizonte pela URL', async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
    const nav = page.getByRole('complementary', { name: 'Navegação principal' });
    await nav.getByRole('link', { name: 'Sugestão de compra' }).click();
    await expect(page).toHaveURL(/\/sugestoes$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sugestão de compra' })).toBeVisible();

    const resumo = page.getByRole('status').filter({ hasText: 'janela de 12 meses' });
    const vazio = page.getByRole('heading', { name: 'Ainda não dá para sugerir' });
    await expect(resumo.or(vazio)).toBeVisible();
    test.skip(await vazio.isVisible(), 'O usuário de teste não tem produtos recorrentes');

    const porMercado = page.getByRole('button', { name: 'Por mercado' });
    await porMercado.click();
    await expect(page).toHaveURL(/[?&]visao=mercado/);
    await expect(porMercado).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Um mercado só' })).toBeVisible();

    const quinzena = page.getByRole('button', { name: 'Próximos 15 dias' });
    await quinzena.click();
    await expect(page).toHaveURL(/[?&]horizonte=quinzena/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Próximos 15 dias' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Por mercado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Lista completa' }).click();
    await expect(page).not.toHaveURL(/visao=/);
    await expect(page.getByRole('button', { name: /Copiar lista/ })).toBeVisible();
  });
});
