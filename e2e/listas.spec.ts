import { expect, test } from '@playwright/test';
import { MOTIVO_SEM_USUARIO, TEM_USUARIO_E2E } from './support/env';
import { adicionar, apagarListas, marcaDoTeste, novaLista, renomearAberta } from './support/listas';
import { entrar } from './support/login';
import { bloquearServicosReais, mockMenorPreco } from './support/mocks';

test.describe('lista de compras (usuário de teste no dv)', () => {
  test.skip(!TEM_USUARIO_E2E, MOTIVO_SEM_USUARIO);

  let marca = '';

  test.beforeEach(async ({ page }) => {
    marca = marcaDoTeste();
    await bloquearServicosReais(page);
    await mockMenorPreco(page);
    await entrar(page);
  });

  test.afterEach(async ({ page }) => {
    await apagarListas(page, marca);
  });

  test('criar pelo menu, adicionar, marcar, desmarcar e renomear', async ({ page, isMobile }) => {
    if (isMobile) await page.getByRole('button', { name: 'Abrir menu' }).click();
    const nav = page.getByRole('complementary', { name: 'Navegação principal' });
    await nav.getByRole('link', { name: 'Lista de compras' }).click();
    await expect(page).toHaveURL(/\/listas$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Listas de compras' })).toBeVisible();

    await novaLista(page, `${marca} mercado`);
    await adicionar(page, 'e2e leite', 'e2e pão', 'e2e café');
    await expect(page.getByText('0 de 3 no carrinho')).toBeVisible();

    await page.getByRole('checkbox', { name: 'e2e pão' }).check();
    await expect(page.getByText('1 de 3 no carrinho')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No carrinho (1)' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'e2e café' })).toBeFocused();

    await page.getByRole('checkbox', { name: 'e2e pão' }).uncheck();
    await expect(page.getByText('0 de 3 no carrinho')).toBeVisible();
    await expect(page.getByRole('heading', { name: /No carrinho/ })).toHaveCount(0);

    await renomearAberta(page, `${marca} mercado da semana`);
    await expect(page.getByRole('link', { name: /Ler a nota desta compra/ })).toHaveAttribute(
      'href',
      /\/importar\?lista=/,
    );
  });

  test('criar pela sugestão de compra', async ({ page }) => {
    await page.goto('/sugestoes');
    const criar = page.getByRole('button', { name: /Criar lista com/ });
    const vazio = page.getByRole('heading', { name: 'Ainda não dá para sugerir' });
    await expect(criar.or(vazio).or(page.getByText(/Nada para repor/))).toBeVisible();
    test.skip(
      !(await criar.isVisible()) || (await criar.isDisabled()),
      'Sem sugestões para a lista',
    );
    await criar.click();
    await expect(page).toHaveURL(/\/listas\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /Para pegar \(\d+\)/ })).toBeVisible();
    await renomearAberta(page, `${marca} da sugestão`);
  });

  test('conferir uma nota já importada pelo detalhe da nota e excluir a lista', async ({
    page,
  }) => {
    await page.goto('/notas');
    const notas = page.getByRole('list', { name: 'Notas' }).getByRole('link');
    await expect(notas.first().or(page.getByText('Importar primeira nota'))).toBeVisible();
    test.skip((await notas.count()) === 0, 'O usuário de teste não tem notas');

    const nome = `${marca} conferência`;
    await novaLista(page, nome);
    await adicionar(page, 'e2e item que não está na nota');

    await page.goto('/notas');
    await notas.first().click();
    await expect(page).toHaveURL(/\/notas\/\d{44}/);
    await page.getByRole('button', { name: 'Conferir com uma lista' }).click();
    const escolher = page.getByRole('radio', { name: new RegExp(nome) });
    if (await escolher.isVisible().catch(() => false)) {
      await escolher.check();
      await page.getByRole('button', { name: 'Conferir' }).click();
    }
    await expect(page).toHaveURL(/\/listas\/[^/]+\/conferir\?chave=\d{44}/);

    await expect(page.getByRole('region', { name: 'Resumo da conferência' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Faltou \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Fora da lista \(\d+\)/ })).toBeVisible();
    await expect(page.getByText('e2e item que não está na nota')).toBeVisible();

    await page.getByRole('button', { name: /Salvar conferência/ }).click();
    await expect(
      page.getByRole('heading', { name: 'A compra virou nota. E a lista?' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Excluir lista/ }).click();
    await expect(page).toHaveURL(/\/listas$/);
    await expect(page.getByRole('link', { name: new RegExp(nome) })).toHaveCount(0);
  });
});
