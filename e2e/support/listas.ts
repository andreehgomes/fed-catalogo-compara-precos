import { expect, test, type Page } from '@playwright/test';

/**
 * Nome das listas criadas pelo e2e, com uma marca por teste: o teste grava no dv e apaga só as
 * listas dele (os projetos e os testes rodam em paralelo com o mesmo usuário).
 */
export function marcaDoTeste(): string {
  return `e2e ${Math.random().toString(36).slice(2, 7)}`;
}

export async function novaLista(page: Page, nome: string): Promise<void> {
  await page.goto('/listas');
  const nova = page.getByRole('button', { name: 'Nova lista' }).first();
  await expect(nova).toBeVisible();
  test.skip(await nova.isDisabled(), 'O usuário de teste já tem 5 listas');
  await nova.click();
  await expect(page).toHaveURL(/\/listas\/[^/]+$/);
  await renomearAberta(page, nome);
}

export async function renomearAberta(page: Page, nome: string): Promise<void> {
  await page.getByRole('button', { name: 'Ações da lista' }).click();
  await page.getByRole('menuitem', { name: 'Renomear' }).click();
  await page.getByLabel('Nome').fill(nome);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible();
}

export async function adicionar(page: Page, ...itens: string[]): Promise<void> {
  const campo = page.getByRole('combobox', { name: 'Adicionar item' });
  for (const item of itens) {
    await campo.fill(item);
    await campo.press('Escape');
    await campo.press('Enter');
    await expect(page.getByRole('checkbox', { name: item, exact: true })).toBeVisible();
  }
}

export async function apagarListas(page: Page, marca: string): Promise<void> {
  await page.goto('/listas');
  await expect(
    page.getByRole('list', { name: 'Suas listas' }).or(page.getByText('Nenhuma lista ainda')),
  ).toBeVisible();
  for (;;) {
    const acoes = page.getByRole('button', { name: new RegExp(`^Ações de ${marca}`) });
    if ((await acoes.count()) === 0) break;
    await acoes.first().click();
    await page.getByRole('menuitem', { name: /^Excluir/ }).click();
    await page.getByRole('button', { name: 'Excluir lista' }).click();
    await expect(page.getByText('Lista excluída')).toBeVisible();
  }
}
