import { ComponentFixture } from '@angular/core/testing';

export function porRotulo(raiz: HTMLElement, rotulo: string): HTMLInputElement {
  const label = [...raiz.querySelectorAll('label')].find(
    (l) => l.querySelector('span')?.textContent?.trim() === rotulo,
  );
  const input = label?.querySelector('input, select, textarea');
  if (!input) throw new Error(`Campo "${rotulo}" não encontrado`);
  return input as HTMLInputElement;
}

export function digitar(input: HTMLInputElement, valor: string): void {
  input.value = valor;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
}

export async function enviar(fixture: ComponentFixture<unknown>): Promise<void> {
  const form = (fixture.nativeElement as HTMLElement).querySelector('form');
  form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await fixture.whenStable();
  fixture.detectChanges();
}

export function texto(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function botao(raiz: HTMLElement, rotulo: string | RegExp): HTMLButtonElement {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button, a')].find((x) =>
    typeof rotulo === 'string'
      ? texto(x) === rotulo || x.getAttribute('aria-label') === rotulo
      : rotulo.test(texto(x)),
  );
  if (!b) throw new Error(`Botão "${rotulo}" não encontrado`);
  return b as HTMLButtonElement;
}
