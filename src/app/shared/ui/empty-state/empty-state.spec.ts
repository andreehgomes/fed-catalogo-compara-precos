import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `<cp-empty-state icone="receipt_long" titulo="Nenhuma nota" texto="Importe a primeira.">
    <button type="button">Importar</button>
  </cp-empty-state>`,
})
class Host {}

describe('EmptyState', () => {
  it('renderiza ícone, título, texto e a ação projetada', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('mat-icon')?.textContent?.trim()).toBe('receipt_long');
    expect(el.querySelector('h2')?.textContent).toBe('Nenhuma nota');
    expect(el.querySelector('p')?.textContent).toBe('Importe a primeira.');
    expect(el.querySelector('button')?.textContent).toBe('Importar');
  });
});
