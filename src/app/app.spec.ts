import { CurrencyPipe } from '@angular/common';
import { DEFAULT_CURRENCY_CODE, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('cria o app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('formata moeda em BRL com o locale pt-BR', () => {
    const pipe = new CurrencyPipe(TestBed.inject(LOCALE_ID), TestBed.inject(DEFAULT_CURRENCY_CODE));
    expect(pipe.transform(1234.5)?.replace(/\s/g, ' ')).toBe('R$ 1.234,50');
  });
});
