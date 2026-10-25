import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

test.describe('painel (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  test.beforeEach(async ({ page }) => {
    await bloquearServicosReais(page);
    await mockMenorPreco(page);
    await entrar(page);
  });

  test('resumo, últimas notas e gráfico com link para as notas', async ({ page }) => {
    const ultimas = page.getByRole('list', { name: 'Últimas notas' });
    const comeco = page.getByRole('heading', { name: 'Como funciona' });
    await expect(ultimas.or(comeco)).toBeVisible();
    test.skip(await comeco.isVisible(), 'O usuário de teste não tem notas');

    await expect(page.getByRole('heading', { name: /^Resumo (do mês|de )/ })).toBeVisible();
    await expect(page.getByText('Saldo contra seu melhor preço')).toBeVisible();

    const titulo = page.getByRole('heading', { name: /^Gastos por (mês|compra)$/ });
    await titulo.scrollIntoViewIfNeeded();
    await expect(titulo).toBeVisible();
    await expect(page.getByRole('table', { name: /Gasto e saldo por/ })).toBeAttached();

    await page.getByRole('button', { name: 'Saldo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saldo', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Gasto', exact: true }).click();

    await page.getByRole('link', { name: /, ver notas?$/ }).last().click();
    await expect(page).toHaveURL(/\/notas(\?periodo=personalizado|\/)/);
  });

  test('axe sem violações graves com todos os blocos carregados', async ({ page }) => {
    await expect(page.getByRole('main')).toBeVisible();
    await page.mouse.wheel(0, 10_000);
    await page.waitForTimeout(500);
    await page.mouse.wheel(0, 10_000);
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const graves = r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    expect(graves).toEqual([]);
  });
});
