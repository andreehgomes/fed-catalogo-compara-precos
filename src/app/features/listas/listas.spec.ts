import { ApplicationRef, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { botao, digitar, texto } from '../../../testing/dom';
import { itemLista, listaCompras } from '../../../testing/fixtures/lista/lista';
import { CHAVE_LISTA, notaDaLista } from '../../../testing/fixtures/lista/nota';
import { BASE_LISTAS, cenarioListas, gravarLista } from '../../../testing/listas';
import type { CompraPessoal } from '../notas/detalhe/historico-pessoal';
import { ListaEmAndamento } from '../painel/ui/lista-em-andamento';
import { ListasStore } from './data-access/listas.store';
import { WAKE_LOCK } from './data-access/tela-acesa';
import { Item, Lista, SugestaoAutocompletar, vinculoDe } from './lista';
import ListaPage from './lista/lista.page';
import { AdicionarItem } from './lista/ui/adicionar-item';
import { EditarItemDialog } from './lista/ui/editar-item-dialog';
import { ItemListaLinha } from './lista/ui/item-lista';
import MinhasListasPage from './minhas-listas/minhas-listas.page';
import { EscolherListaDialog } from './ui/escolher-lista-dialog';
import { FinalizarCompra } from './ui/finalizar-compra';
import { RenomearListaDialog } from './ui/renomear-lista-dialog';

@Component({ template: '' })
class Vazia {}

/** Espera o `import()` dos diálogos (macrotarefa) e a renderização. */
async function estavel(harness?: RouterTestingHarness) {
  await new Promise((r) => setTimeout(r));
  await TestBed.inject(ApplicationRef).whenStable();
  harness?.detectChanges();
  await TestBed.inject(ApplicationRef).whenStable();
  harness?.detectChanges();
}

function menuItens(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[mat-menu-item]')];
}

function compra(descricao: string): CompraPessoal {
  return {
    chave: 'k',
    n: 1,
    cnpj: 'A',
    mercado: 'Mercado A',
    emissao: '2026-09-20T15:00:00.000Z',
    produtoId: 'ean:1',
    descricao,
    qtd: 6,
    unidade: 'UN',
    vlUnit: 4.99,
    porUnidade: null,
  };
}

function configurar(opcoes: Parameters<typeof cenarioListas>[0] = {}) {
  const c = cenarioListas(opcoes);
  const wake = { request: vi.fn(async () => ({ release: vi.fn(async () => undefined) })) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'listas', component: MinhasListasPage },
          { path: 'listas/:id', component: ListaPage },
          { path: '**', component: Vazia },
        ],
        withComponentInputBinding(),
      ),
      ...c.providers,
      { provide: WAKE_LOCK, useValue: wake },
    ],
  });
  return { ...c, wake };
}

describe('MinhasListasPage', () => {
  it('vazio: estado inicial com "Nova lista" e a sugestão', async () => {
    configurar();
    const harness = await RouterTestingHarness.create('/listas');
    await estavel(harness);
    const el = harness.routeNativeElement!;
    expect(texto(el.querySelector('.cp-empty-title'))).toBe('Nenhuma lista ainda');
    expect(botao(el, /Usar a sugestão de compra/).getAttribute('href')).toBe('/sugestoes');
  });

  it('lista os cards com progresso e status; "Nova lista" cria e abre sem esperar', async () => {
    const { fs } = configurar();
    gravarLista(
      fs,
      listaCompras(
        { nome: 'Mês', qtdItens: 4, qtdMarcados: 1, ultimaCompraEm: '2026-09-10T12:00:00.000Z' },
        'a',
      ),
    );
    gravarLista(
      fs,
      listaCompras(
        { nome: 'Feira', status: 'aguardando-nota', atualizadaEm: '2026-09-27T00:00:00.000Z' },
        'b',
      ),
    );
    const harness = await RouterTestingHarness.create('/listas');
    await estavel(harness);
    const el = harness.routeNativeElement!;
    const cards = [...el.querySelectorAll('.lista-card')];
    expect(cards.map((c) => texto(c.querySelector('.item-nome')))).toEqual(['Mês', 'Feira']);
    expect(texto(cards[0])).toContain('1 de 4 itens no carrinho');
    expect(texto(cards[0])).toContain('Última compra em 10/09');
    expect(cards[0].querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    expect(texto(cards[1])).toContain('Aguardando nota');

    fs.modo('pendente');
    botao(el, /Nova lista/).click();
    await estavel(harness);
    expect(TestBed.inject(Router).url).toMatch(/^\/listas\/auto\d+$/);
  });

  it('com 5 listas "Nova lista" fica desabilitado e o aviso explica', async () => {
    const { fs } = configurar();
    for (const id of ['a', 'b', 'c', 'd', 'e']) gravarLista(fs, listaCompras({}, id));
    const harness = await RouterTestingHarness.create('/listas');
    await estavel(harness);
    const el = harness.routeNativeElement!;
    expect(botao(el, /Nova lista/).disabled).toBe(true);
    expect(texto(el)).toContain('Você já tem 5 listas. Exclua uma ou use uma lista guardada.');
  });

  it('renomear e excluir pelo menu, com confirmação', async () => {
    const { fs, snack, dialog } = configurar({ dialogos: ['Compras do mês', false, true] });
    gravarLista(fs, listaCompras({ nome: 'Mês' }, 'a'), [itemLista('x')]);
    const harness = await RouterTestingHarness.create('/listas');
    await estavel(harness);
    const el = harness.routeNativeElement!;
    const abrirMenu = async () => {
      botao(el, 'Ações de ' + texto(el.querySelector('.item-nome'))).click();
      await estavel(harness);
    };
    await abrirMenu();
    expect(menuItens().map((b) => texto(b))).toEqual(['editRenomear: Mês', 'deleteExcluir: Mês']);
    menuItens()[0].click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledOnce());
    await estavel(harness);
    expect(dialog.open.mock.calls.map((c) => (c as unknown[])[0])).toEqual([RenomearListaDialog]);
    expect(fs.docs.get(`${BASE_LISTAS}/a`)?.['nome']).toBe('Compras do mês');
    await abrirMenu();
    menuItens()[1].click();
    await estavel(harness);
    expect(fs.docs.has(`${BASE_LISTAS}/a`)).toBe(true);
    await abrirMenu();
    menuItens()[1].click();
    await estavel(harness);
    expect(fs.docs.size).toBe(0);
    expect(snack.ultima()).toBe('Lista excluída');
  });

  it('erro ao carregar', async () => {
    const { fs } = configurar();
    const harness = await RouterTestingHarness.create('/listas');
    fs.falhar(BASE_LISTAS);
    await estavel(harness);
    expect(texto(harness.routeNativeElement!.querySelector('[role="alert"]'))).toContain(
      'Não foi possível carregar suas listas',
    );
  });
});

describe('AdicionarItem', () => {
  const OPCOES: SugestaoAutocompletar[] = [
    {
      grupo: 'g1',
      descricao: 'LEITE INTEGRAL 1L',
      quantidade: { valor: 6, unidade: 'UN', base: null },
    },
    {
      grupo: 'g2',
      descricao: 'LEITE DESNATADO 1L',
      quantidade: { valor: 1.5, unidade: 'L', base: 'L' },
    },
  ];

  function criar() {
    const fixture = TestBed.createComponent(AdicionarItem);
    fixture.componentRef.setInput('buscar', (t: string) => (t.trim().length >= 2 ? OPCOES : []));
    const eventos: string[] = [];
    fixture.componentInstance.texto.subscribe((t) => eventos.push(`texto:${t}`));
    fixture.componentInstance.historico.subscribe((g) => eventos.push(`historico:${g}`));
    fixture.componentInstance.foco.subscribe(() => eventos.push('foco'));
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    const el = fixture.nativeElement as HTMLElement;
    const campo = el.querySelector('input')!;
    const lista = el.querySelector<HTMLElement>('[role="listbox"]')!;
    const tecla = (key: string) => {
      campo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };
    return { fixture, el, campo, lista, eventos, tecla };
  }

  it('Enter com texto livre adiciona, limpa e mantém o foco', async () => {
    const { fixture, el, campo, eventos } = criar();
    campo.focus();
    digitar(campo, '  banana ');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
    expect(eventos).toEqual(['foco', 'texto:banana']);
    expect(campo.value).toBe('');
    expect(document.activeElement).toBe(campo);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(eventos).toHaveLength(2);
  });

  it('1 caractere não abre; setas + Enter escolhem; Esc fecha', () => {
    const { fixture, campo, lista, eventos, tecla } = criar();
    digitar(campo, 'l');
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(campo.getAttribute('aria-expanded')).toBe('false');
    tecla('ArrowDown');
    expect(campo.getAttribute('aria-activedescendant')).toBeNull();

    digitar(campo, 'le');
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(campo.getAttribute('aria-expanded')).toBe('true');
    expect(lista.hidden).toBe(false);
    expect([...lista.querySelectorAll('[role="option"]')].map((o) => texto(o))).toEqual([
      'LEITE INTEGRAL 1L≈ 6 un',
      'LEITE DESNATADO 1L≈ 1,5 L',
    ]);
    tecla('ArrowDown');
    tecla('ArrowDown');
    tecla('ArrowDown');
    tecla('ArrowUp');
    const ativa = campo.getAttribute('aria-activedescendant')!;
    expect(document.getElementById(ativa)?.getAttribute('aria-selected')).toBe('true');
    expect(texto(document.getElementById(ativa))).toContain('LEITE DESNATADO');
    tecla('Escape');
    expect(campo.getAttribute('aria-expanded')).toBe('false');
    tecla('Escape');
    tecla('ArrowDown');
    expect(campo.getAttribute('aria-expanded')).toBe('true');
    tecla('Enter');
    expect(eventos).toContain('historico:g1');
    expect(campo.value).toBe('');
    tecla('Tab');
    tecla('Enter');
  });

  it('clique numa opção escolhe; blur fecha', () => {
    const { fixture, campo, lista, eventos } = criar();
    digitar(campo, 'leite');
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const opcao = lista.querySelectorAll<HTMLElement>('[role="option"]')[1];
    const md = new MouseEvent('mousedown', { cancelable: true });
    opcao.dispatchEvent(md);
    expect(md.defaultPrevented).toBe(true);
    opcao.click();
    expect(eventos).toContain('historico:g2');
    digitar(campo, 'leite');
    campo.dispatchEvent(new Event('input'));
    campo.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(campo.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('ItemListaLinha', () => {
  function criar(item: Item, referencia: unknown = null) {
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(ItemListaLinha);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('referencia', referencia);
    fixture.detectChanges();
    const eventos: string[] = [];
    fixture.componentInstance.alternar.subscribe(() => eventos.push('alternar'));
    fixture.componentInstance.editar.subscribe(() => eventos.push('editar'));
    fixture.componentInstance.remover.subscribe(() => eventos.push('remover'));
    return { fixture, el: fixture.nativeElement as HTMLElement, eventos };
  }

  it('clique na linha alterna; nome acessível com texto e quantidade; preço de referência', () => {
    const { el, eventos } = criar(
      itemLista('a', { texto: 'Leite', quantidade: 6, unidade: 'UN' }),
      {
        valor: 4.99,
        compra: compra('LEITE'),
      },
    );
    const check = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(check.getAttribute('aria-label')).toBe('Leite, 6 un');
    expect(texto(el.querySelector('.item-detalhe'))).toBe('último R$ 4,99 no Mercado A');
    (el.querySelector('.il-texto') as HTMLElement).click();
    expect(eventos).toEqual(['alternar']);
  });

  it('marcado: riscado com "no carrinho" para o leitor; vínculo com a nota', () => {
    const v = vinculoDe({ nota: notaDaLista().itens[0], como: 'texto' }, notaDaLista());
    const { el, fixture } = criar(itemLista('a', { texto: 'Pão', marcado: true, vinculo: v }));
    expect(fixture.nativeElement.classList).toContain('il--marcado');
    expect(texto(el.querySelector('label'))).toContain('no carrinho');
    expect(texto(el)).toContain('ligado à nota: Cerv Therez 500ml Go');
    expect(el.querySelector<HTMLInputElement>('input')!.getAttribute('aria-label')).toBe('Pão');
  });

  it('menu emite editar e remover', async () => {
    const { el, fixture, eventos } = criar(itemLista('a', { texto: 'Pão' }));
    botao(el, 'Ações de Pão').click();
    fixture.detectChanges();
    await fixture.whenStable();
    const itens = menuItens();
    expect(itens.map((i) => texto(i))).toEqual(['editEditar: Pão', 'deleteRemover: Pão']);
    itens[0].click();
    itens[1].click();
    expect(eventos).toEqual(['editar', 'remover']);
  });
});

describe('Diálogos da lista', () => {
  function abrir<T>(tipo: new () => T, data: unknown) {
    const ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(tipo);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, ref };
  }

  it('renomear: nome obrigatório, até 60, devolve limpo', async () => {
    const { fixture, el, ref } = abrir(RenomearListaDialog, 'Compras');
    const campo = el.querySelector('input')!;
    digitar(campo, '   ');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('[role="alert"]'))).toBe('Dê um nome à lista.');
    expect(ref.close).not.toHaveBeenCalled();
    digitar(campo, 'x'.repeat(61));
    fixture.detectChanges();
    expect(texto(el.querySelector('[role="alert"]'))).toBe('Use até 60 caracteres.');
    digitar(campo, '  Compras   do mês ');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(ref.close).toHaveBeenCalledWith('Compras do mês');
  });

  it('editar item: texto, stepper, unidade e quantidade em branco', async () => {
    const item = itemLista('a', { texto: 'Leite', quantidade: 6, unidade: 'UN', base: null });
    const { fixture, el, ref } = abrir(EditarItemDialog, item);
    const [textoCampo, qtd] = [...el.querySelectorAll('input')];
    const select = el.querySelector('select')!;
    expect([...select.options].map((o) => o.value)).toEqual(['un', 'kg', 'L', 'UN']);
    botao(el, 'Aumentar').click();
    fixture.detectChanges();
    expect(qtd.value).toBe('7');
    botao(el, 'Diminuir').click();
    botao(el, 'Diminuir').click();
    fixture.detectChanges();
    expect(qtd.value).toBe('5');
    digitar(textoCampo, 'Leite integral');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(ref.close).toHaveBeenLastCalledWith({
      texto: 'Leite integral',
      quantidade: 5,
      unidade: 'UN',
      base: null,
    });

    select.value = 'kg';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    qtd.value = '1.25';
    qtd.dispatchEvent(new Event('change'));
    botao(el, 'Aumentar').click();
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(ref.close).toHaveBeenLastCalledWith({
      texto: 'Leite integral',
      quantidade: 1.4,
      unidade: 'kg',
      base: 'kg',
    });

    select.value = 'un';
    select.dispatchEvent(new Event('change'));
    qtd.value = '';
    qtd.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(ref.close).toHaveBeenLastCalledWith({
      texto: 'Leite integral',
      quantidade: null,
      unidade: null,
      base: null,
    });

    select.value = 'un';
    select.dispatchEvent(new Event('change'));
    qtd.value = '2';
    qtd.dispatchEvent(new Event('change'));
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    expect(ref.close).toHaveBeenLastCalledWith(
      expect.objectContaining({ unidade: 'un', base: null }),
    );

    digitar(textoCampo, ' ');
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('[role="alert"]'))).toBe('Escreva o item.');
  });

  it('editar item sem quantidade começa em "un"', () => {
    const { el } = abrir(EditarItemDialog, itemLista('a', { texto: 'Pão' }));
    expect(el.querySelector('select')!.value).toBe('un');
    expect(botao(el, 'Diminuir').disabled).toBe(true);
  });

  it('escolher lista: devolve a escolhida ou "nova"', () => {
    const listas: Lista[] = [
      listaCompras({ nome: 'Um', qtdItens: 1 }, 'a'),
      listaCompras({ nome: 'Dois' }, 'b'),
    ];
    const { el, ref, fixture } = abrir(EscolherListaDialog, { listas, podeCriar: true });
    expect(texto(el.querySelector('h2'))).toBe('Adicionar a qual lista?');
    expect([...el.querySelectorAll('label')].map((l) => texto(l))).toEqual([
      'Um1 item',
      'Dois0 itens',
      'Nova lista',
    ]);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ref.close).toHaveBeenLastCalledWith({ id: 'a' });
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[1].dispatchEvent(new Event('change'));
    radios[2].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ref.close).toHaveBeenLastCalledWith({ nova: true });
  });

  it('escolher lista sem "Nova lista", com título e botão próprios', () => {
    const { el, ref } = abrir(EscolherListaDialog, {
      listas: [listaCompras({}, 'a')],
      podeCriar: false,
      titulo: 'Conferir com qual lista?',
      confirmar: 'Conferir',
    });
    expect(texto(el.querySelector('h2'))).toBe('Conferir com qual lista?');
    expect(el.querySelectorAll('input[type="radio"]')).toHaveLength(1);
    botao(el, 'Conferir').click();
    expect(ref.close).toHaveBeenCalledWith({ id: 'a' });
  });

  it('escolher lista sem listas começa em "Nova lista"', () => {
    const { el, ref } = abrir(EscolherListaDialog, { listas: [], podeCriar: true });
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ref.close).toHaveBeenCalledWith({ nova: true });
  });
});

describe('FinalizarCompra', () => {
  function criar(temFaltantes: boolean, podeLerOutra: boolean) {
    const fixture = TestBed.createComponent(FinalizarCompra);
    fixture.componentRef.setInput('temFaltantes', temFaltantes);
    fixture.componentRef.setInput('podeLerOutra', podeLerOutra);
    fixture.detectChanges();
    const escolhas: string[] = [];
    fixture.componentInstance.escolher.subscribe((e) => escolhas.push(e));
    return { el: fixture.nativeElement as HTMLElement, escolhas };
  }

  it('quatro ações com faltantes; sem faltantes só excluir e guardar', () => {
    const { el, escolhas } = criar(true, true);
    expect(texto(el.querySelector('h2'))).toBe('A compra virou nota. E a lista?');
    for (const r of [
      /Excluir lista/,
      /Guardar para usar de novo/,
      /Manter só o que faltou/,
      /Ler outra nota/,
    ]) {
      botao(el, r).click();
    }
    expect(escolhas).toEqual(['excluir', 'guardar', 'so-faltou', 'outra-nota']);
    expect(() => botao(criar(true, false).el, /Ler outra nota/)).toThrow();
    const sem = criar(false, true).el;
    expect(() => botao(sem, /Manter só o que faltou/)).toThrow();
    expect(() => botao(sem, /Ler outra nota/)).toThrow();
  });
});

describe('ListaEmAndamento (painel)', () => {
  it('com lista mostra nome, progresso e abrir; sem lista não renderiza', () => {
    const emAndamento = signal<Lista | null>(
      listaCompras({ nome: 'Mês', qtdItens: 3, qtdMarcados: 1 }, 'a'),
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ListasStore, useValue: { emAndamento } }],
    });
    const fixture = TestBed.createComponent(ListaEmAndamento);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(texto(el.querySelector('.andamento'))).toBe(
      'checklistMês 1 de 3 itens no carrinho Abrir lista',
    );
    expect(el.querySelector('.andamento')?.getAttribute('href')).toBe('/listas/a');
    emAndamento.set(null);
    fixture.detectChanges();
    expect(el.querySelector('section')).toBeNull();
  });
});

describe('ListaPage', () => {
  const INDICE = new Map([['ean:1', [compra('LEITE INTEGRAL 1L')]]]);

  async function abrir(
    itens: Item[],
    extra: Partial<Lista> = {},
    opcoes: Parameters<typeof cenarioListas>[0] = {},
  ) {
    const c = configurar({ indice: INDICE, ...opcoes });
    gravarLista(c.fs, listaCompras({ nome: 'Mês', qtdItens: itens.length, ...extra }, 'l1'), itens);
    const harness = await RouterTestingHarness.create('/listas/l1');
    await estavel(harness);
    return { ...c, harness, el: harness.routeNativeElement! };
  }

  const nomes = (el: HTMLElement, secao: string) =>
    [...el.querySelectorAll(`[aria-labelledby="${secao}"] .il-texto`)].map((x) => texto(x));

  it('marcar move para "No carrinho", anuncia o progresso e leva o foco ao próximo', async () => {
    const { el, harness, wake } = await abrir([
      itemLista('a', { texto: 'Pão', ordem: 1 }),
      itemLista('b', { texto: 'Leite', grupo: 'ean:1', quantidade: 6, unidade: 'UN', ordem: 2 }),
    ]);
    expect(wake.request).toHaveBeenCalledWith('screen');
    expect(texto(el.querySelector('[aria-live="polite"]'))).toBe('0 de 2 no carrinho');
    expect(nomes(el, 'lista-pendentes')).toEqual(['Pão', 'Leite']);
    expect(texto(el.querySelector('.lista-estimativa'))).toBe('≈ R$ 29,94 · 1 sem preço');
    el.querySelector<HTMLInputElement>('#item-check-a')!.click();
    await estavel(harness);
    expect(document.activeElement?.id).toBe('item-check-b');
    expect(nomes(el, 'lista-pendentes')).toEqual(['Leite']);
    expect(nomes(el, 'lista-carrinho')).toEqual(['Pão']);
    expect(texto(el.querySelector('[aria-live="polite"]'))).toBe('1 de 2 no carrinho');
    el.querySelector<HTMLInputElement>('#item-check-b')!.click();
    await estavel(harness);
    expect(texto(el)).toContain('Tudo no carrinho.');
    botao(el, /Ocultar/).click();
    harness.detectChanges();
    expect(el.querySelector<HTMLElement>('#lista-carrinho-itens')!.hidden).toBe(true);
    botao(el, /Mostrar/).click();
    harness.detectChanges();
    el.querySelector<HTMLInputElement>('#item-check-a')!.click();
    await estavel(harness);
    expect(nomes(el, 'lista-pendentes')).toEqual(['Pão']);
  });

  it('rodapé leva à importação com a lista; adicionar pelo campo', async () => {
    const { el, harness, fs } = await abrir([]);
    expect(texto(el)).toContain('A lista está vazia.');
    expect(texto(el.querySelector('.lista-estimativa'))).toBe('');
    expect(botao(el, /Ler a nota desta compra/).getAttribute('href')).toBe('/importar?lista=l1');
    const campo = el.querySelector<HTMLInputElement>('cp-adicionar-item input')!;
    campo.dispatchEvent(new Event('focus'));
    digitar(campo, 'Banana');
    harness.detectChanges();
    el.querySelector('cp-adicionar-item form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await estavel(harness);
    expect(nomes(el, 'lista-pendentes')).toEqual(['Banana']);
    expect(texto(el.querySelector('.lista-estimativa'))).toBe('Sem preço de referência ainda');
    expect(fs.docs.get(`${BASE_LISTAS}/l1`)).toMatchObject({ qtdItens: 1 });
    digitar(campo, 'lei');
    campo.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const opcao = el.querySelector<HTMLElement>('[role="option"]')!;
    expect(texto(opcao)).toBe('LEITE INTEGRAL 1L≈ 6 un');
    opcao.click();
    await estavel(harness);
    expect(nomes(el, 'lista-pendentes')).toEqual(['Banana', 'LEITE INTEGRAL 1L']);
  });

  it('sem conexão mostra o aviso', async () => {
    const { el, harness, online } = await abrir([itemLista('a')]);
    expect(texto(el)).not.toContain('Sem conexão');
    online.set(false);
    await estavel(harness);
    expect(texto(el)).toContain('Sem conexão — suas marcações serão salvas quando voltar.');
  });

  it('lista inexistente', async () => {
    configurar();
    const harness = await RouterTestingHarness.create('/listas/nada');
    await estavel(harness);
    const el = harness.routeNativeElement!;
    expect(texto(el.querySelector('.cp-empty-title'))).toBe('Lista não encontrada');
    expect(botao(el, 'Ver minhas listas').getAttribute('href')).toBe('/listas');
  });

  it('menu: renomear, copiar, compartilhar, desmarcar tudo e excluir', async () => {
    const writeText = vi.fn<(t: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      const { el, harness, fs, snack } = await abrir(
        [
          itemLista('a', { texto: 'Pão', marcado: true }),
          itemLista('b', { texto: 'Leite', ordem: 2 }),
        ],
        { qtdMarcados: 1 },
        { dialogos: ['Feira', true] },
      );
      const menu = async (i: number) => {
        botao(el, 'Ações da lista').click();
        await estavel(harness);
        menuItens()[i].click();
        await estavel(harness);
      };
      await menu(0);
      expect(texto(el.querySelector('h1'))).toBe('Feira');
      await menu(1);
      expect(writeText).toHaveBeenCalledWith('Feira · Cupom Esperto\n\n- Leite');
      expect(snack.ultima()).toBe('Lista copiada');
      writeText.mockRejectedValueOnce(new Error('negado'));
      await menu(1);
      expect(snack.ultima()).toBe('Não foi possível copiar.');
      await menu(2);
      expect(share).toHaveBeenCalledWith({
        title: 'Feira',
        text: 'Feira · Cupom Esperto\n\n- Leite',
      });
      share.mockRejectedValueOnce(new Error('cancelado'));
      await menu(2);
      await menu(3);
      expect(fs.docs.get(`${BASE_LISTAS}/l1`)).toMatchObject({ qtdMarcados: 0 });
      await menu(4);
      expect(fs.docs.size).toBe(0);
      expect(TestBed.inject(Router).url).toBe('/listas');
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('editar e remover item pelo menu da linha', async () => {
    const { el, harness, dialog } = await abrir(
      [itemLista('a', { texto: 'Pão' })],
      {},
      {
        dialogos: [{ texto: 'Pão francês', quantidade: 10, unidade: 'un', base: null }, undefined],
      },
    );
    const acao = async (rotulo: string, i: number) => {
      botao(el, `Ações de ${rotulo}`).click();
      await estavel(harness);
      menuItens()[i].click();
      await estavel(harness);
    };
    await acao('Pão', 0);
    await vi.waitFor(async () => {
      await estavel(harness);
      expect(nomes(el, 'lista-pendentes')).toEqual(['Pão francês']);
    });
    expect(texto(el.querySelector('.il-qtd'))).toBe('10 un');
    await acao('Pão francês', 0);
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(2));
    await estavel(harness);
    expect(nomes(el, 'lista-pendentes')).toEqual(['Pão francês']);
    await acao('Pão francês', 1);
    expect(nomes(el, 'lista-pendentes')).toEqual([]);
  });

  it('aguardando nota: esperando, a nota chegou e a fila desistiu', async () => {
    const { el, harness, notas, pendentes } = await abrir([itemLista('a')], {
      status: 'aguardando-nota',
      pendentes: [CHAVE_LISTA],
    });
    expect(texto(el)).toContain('Esperando a SEFAZ-PR liberar a nota.');
    notas.get(CHAVE_LISTA)!.next(notaDaLista());
    await estavel(harness);
    expect(botao(el, 'Conferir agora').getAttribute('href')).toBe(
      `/listas/l1/conferir?chave=${CHAVE_LISTA}`,
    );
    notas.get(CHAVE_LISTA)!.next(null);
    pendentes.set([
      {
        chave: CHAVE_LISTA,
        url: '',
        status: 'falhou',
        tentativas: 9,
        proximaTentativa: '',
        ultimoErro: null,
        criadaEm: '',
      },
    ]);
    await estavel(harness);
    expect(texto(el)).toContain('Não conseguimos importar a nota desta compra.');
    expect(botao(el, 'Ler de novo').getAttribute('href')).toBe('/importar?lista=l1');
    botao(el, 'Dispensar').click();
    await estavel(harness);
    expect(texto(el)).not.toContain('Não conseguimos importar');
  });

  it('compra conferida: faixa com "Ler outra nota" e "Guardar"', async () => {
    const v = vinculoDe({ nota: notaDaLista().itens[0], como: 'texto' }, notaDaLista());
    const itens = [
      itemLista('a', { marcado: true, vinculo: v }),
      itemLista('b', { texto: 'Banana', ordem: 2 }),
    ];
    const { el, harness, snack } = await abrir(itens, { notas: [CHAVE_LISTA], qtdMarcados: 1 });
    expect(texto(el.querySelector('cp-finalizar-compra h2'))).toBe(
      'Compra conferida — excluir ou guardar?',
    );
    botao(el, /Ler outra nota/).click();
    await estavel(harness);
    expect(TestBed.inject(Router).url).toBe('/importar?lista=l1');
    await harness.navigateByUrl('/listas/l1');
    await estavel(harness);
    const pagina = harness.routeNativeElement!;
    botao(pagina, /Guardar para usar de novo/).click();
    await estavel(harness);
    expect(snack.ultima()).toBe('Lista guardada');
    expect(pagina.querySelector('cp-finalizar-compra')).toBeNull();
  });

  it('finalizar: "só o que faltou" e "excluir"', async () => {
    const v = vinculoDe({ nota: notaDaLista().itens[0], como: 'texto' }, notaDaLista());
    const itens = [
      itemLista('a', { marcado: true, vinculo: v }),
      itemLista('b', { texto: 'Banana', ordem: 2 }),
    ];
    const { el, harness, snack, fs } = await abrir(itens, { notas: [CHAVE_LISTA], qtdMarcados: 1 });
    botao(el, /Manter só o que faltou/).click();
    await estavel(harness);
    expect(snack.ultima()).toBe('Ficou só o que faltou');
    expect(nomes(el, 'lista-pendentes')).toEqual(['Banana']);
    gravarLista(fs, listaCompras({ nome: 'Mês', notas: [CHAVE_LISTA], qtdItens: 1 }, 'l1'));
    await estavel(harness);
    botao(el, /Excluir lista/).click();
    await estavel(harness);
    expect(TestBed.inject(Router).url).toBe('/listas');
    expect(fs.docs.size).toBe(0);
  });
});
