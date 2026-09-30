import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { botao, texto } from '../../../../testing/dom';
import { CAFE_EAN, gruposDaLista } from '../../../../testing/fixtures/lista/grupos';
import {
  itemLista,
  itensDaListaFixture,
  listaCompras,
} from '../../../../testing/fixtures/lista/lista';
import { CHAVE_LISTA, locDelta, notaDaLista } from '../../../../testing/fixtures/lista/nota';
import { BASE_LISTAS, cenarioListas, gravarLista } from '../../../../testing/listas';
import type { Item, Lista } from '../lista';
import ConferenciaPage from './conferencia.page';
import { EscolherParDialog } from './ui/escolher-par-dialog';

@Component({ template: '' })
class Vazia {}

async function estavel(harness: RouterTestingHarness) {
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => setTimeout(r));
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();
  }
}

async function abrir(
  opcoes: {
    itens?: Item[];
    lista?: Partial<Lista>;
    dialogos?: unknown[];
    nota?: boolean;
    gruposFalham?: boolean;
  } = {},
) {
  const c = cenarioListas({ grupos: gruposDaLista(), dialogos: opcoes.dialogos });
  if (opcoes.gruposFalham) c.historico.gruposDaNota.mockRejectedValue(new Error('offline'));
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          { path: 'listas/:id/conferir', component: ConferenciaPage },
          { path: '**', component: Vazia },
        ],
        withComponentInputBinding(),
      ),
      ...c.providers,
    ],
  });
  const itens = opcoes.itens ?? itensDaListaFixture();
  gravarLista(
    c.fs,
    listaCompras({ nome: 'Mês', qtdItens: itens.length, qtdMarcados: 2, ...opcoes.lista }, 'l1'),
    itens,
  );
  c.notas.set(
    CHAVE_LISTA,
    new (await import('rxjs')).BehaviorSubject(opcoes.nota === false ? null : notaDaLista()),
  );
  const harness = await RouterTestingHarness.create(`/listas/l1/conferir?chave=${CHAVE_LISTA}`);
  await estavel(harness);
  return { ...c, harness, el: harness.routeNativeElement! };
}

function secao(el: HTMLElement, id: string): string[] {
  return [...el.querySelectorAll(`[aria-labelledby="${id}"] li`)].map((li) => texto(li));
}

function nomes(el: HTMLElement, id: string): string[] {
  return [...el.querySelectorAll(`[aria-labelledby="${id}"] li`)].map((li) =>
    texto(li.querySelector('.item-nome') ?? li),
  );
}

function resumo(el: HTMLElement): string {
  return texto(el.querySelector('.cp-summary'));
}

describe('Conferência (RF-10, RF-11)', () => {
  it('seções e totais a partir da conciliação automática', async () => {
    const { el, historico } = await abrir();
    expect(historico.gruposDaNota).toHaveBeenCalledOnce();
    expect(texto(el.querySelector('h1'))).toBe('Mês');
    expect(el.querySelector('header a[href^="/notas/"]')?.getAttribute('href')).toBe(
      `/notas/${CHAVE_LISTA}`,
    );
    expect(resumo(el)).toBe(
      'Total da notaR$ 999,27Da listaR$ 119,853 itensFora da listaR$ 879,42 59 itens Faltou1item',
    );
    const comprados = secao(el, 'conf-comprados');
    expect(comprados).toHaveLength(3);
    expect(comprados[0]).toContain('CAFE ITAMARATY 500G');
    expect(comprados[0]).toContain('Cafe Itamaraty 500g · 3 UN');
    expect(comprados[0]).not.toContain('aproximado');
    expect(comprados[1]).toContain('compare_arrows aproximado');
    expect(secao(el, 'conf-confirme').map((t) => t.split('na nota como')[0].trim())).toEqual([
      'leite',
      'pão francês',
      'coca 2l',
    ]);
    expect(secao(el, 'conf-faltou')).toEqual(['bananalink Estava na nota como…']);
    expect(secao(el, 'conf-fora')).toHaveLength(56);
    expect(texto(el)).toContain('Os itens em "Confirme" sem resposta ficam como faltou.');
  });

  it('"Sim", "Não", "Não é este", ligar à mão e acrescentar item de fora', async () => {
    const detergente = notaDaLista().itens.find((i) => i.descricao.startsWith('Det Ype'))!;
    const { el, harness, dialog } = await abrir({ dialogos: [String(detergente.n), 'banana'] });
    botao(el, 'Sim, leite é Leite Lider 1l Desn').click();
    botao(el, 'Não, coca 2l não é Refr Coca Cola 2l Ze').click();
    await estavel(harness);
    expect(secao(el, 'conf-comprados')).toHaveLength(4);
    expect(secao(el, 'conf-confirme')).toHaveLength(1);
    expect(nomes(el, 'conf-faltou')).toEqual(['coca 2l', 'banana']);

    botao(el, 'Não é este: detergente').click();
    await estavel(harness);
    expect(nomes(el, 'conf-faltou')).toEqual(['detergente', 'coca 2l', 'banana']);

    botao(el, 'detergente estava na nota como…').click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledOnce());
    await estavel(harness);
    expect(dialog.open).toHaveBeenCalledWith(
      EscolherParDialog,
      expect.objectContaining({
        data: expect.objectContaining({ titulo: '"detergente" estava na nota como…' }),
      }),
    );
    expect(nomes(el, 'conf-faltou')).toEqual(['coca 2l', 'banana']);
    expect(secao(el, 'conf-comprados').find((t) => t.startsWith('detergente'))).not.toContain(
      'aproximado',
    );

    botao(el, 'Tigela Marinex 2l estava na lista como…').click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(2));
    await estavel(harness);
    expect(secao(el, 'conf-comprados').some((t) => t.startsWith('banana'))).toBe(true);

    botao(el, 'Adicionar à lista: Des Rexona 50ml Form').click();
    await estavel(harness);
    expect(secao(el, 'conf-comprados').at(-1)).toContain('entra na lista');
    expect(resumo(el)).toContain('Da listaR$ 236,166 itens');
    botao(el, 'Não adicionar Des Rexona 50ml Form').click();
    await estavel(harness);
    expect(secao(el, 'conf-comprados').some((t) => t.includes('entra na lista'))).toBe(false);
  });

  it('diálogo cancelado não liga nada', async () => {
    const { el, harness, dialog } = await abrir({ dialogos: [undefined, undefined] });
    botao(el, 'banana estava na nota como…').click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledOnce());
    await estavel(harness);
    botao(el, 'Tigela Marinex 2l estava na lista como…').click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(2));
    await estavel(harness);
    expect(nomes(el, 'conf-faltou')).toEqual(['banana']);
  });

  it('salvar grava vínculos, marcações, grupo aprendido e o item de fora; depois finaliza', async () => {
    const { el, harness, fs, snack } = await abrir();
    botao(el, 'Adicionar à lista: Des Rexona 50ml Form').click();
    await estavel(harness);
    botao(el, /Salvar conferência/).click();
    await estavel(harness);
    expect(snack.ultima()).toBe('Conferência salva');
    const item = (id: string) => fs.docs.get(`${BASE_LISTAS}/l1/itens/${id}`)!;
    expect(item('cafe')).toMatchObject({
      marcado: true,
      grupo: CAFE_EAN,
      vinculo: expect.objectContaining({ como: 'grupo' }),
    });
    expect(item('detergente')).toMatchObject({
      marcado: true,
      marcadoEm: '2026-09-28T18:10:00.000Z',
      grupo: locDelta('047'),
      vinculo: expect.objectContaining({ como: 'texto', chave: CHAVE_LISTA }),
    });
    expect(item('leite')).toMatchObject({ marcado: false, vinculo: null, grupo: null });
    expect(item('molho')['vinculo']).toMatchObject({ mercado: 'Outro mercado' });
    expect(fs.docs.get(`${BASE_LISTAS}/l1`)).toMatchObject({
      qtdItens: 9,
      qtdMarcados: 5,
      notas: [CHAVE_LISTA],
    });

    expect(texto(el.querySelector('#conf-ligados'))).toBe('Comprados com esta nota (4)');
    expect(texto(el.querySelector('cp-finalizar-compra h2'))).toBe(
      'A compra virou nota. E a lista?',
    );
    botao(el, /Guardar para usar de novo/).click();
    await estavel(harness);
    expect(TestBed.inject(Router).url).toBe('/listas/l1');
    expect(snack.ultima()).toBe('Lista guardada');
    expect(fs.docs.get(`${BASE_LISTAS}/l1`)).toMatchObject({ notas: [], qtdMarcados: 0 });
    expect(item('detergente')).toMatchObject({ vinculo: null, grupo: locDelta('047') });
  });

  it('finalizar: só o que faltou, excluir e ler outra nota', async () => {
    const { el, harness, fs, snack } = await abrir();
    botao(el, /Salvar conferência/).click();
    await estavel(harness);
    botao(el, /Ler outra nota/).click();
    await estavel(harness);
    expect(TestBed.inject(Router).url).toBe('/importar?lista=l1');

    await harness.navigateByUrl(`/listas/l1/conferir?chave=${CHAVE_LISTA}`);
    await estavel(harness);
    let pagina = harness.routeNativeElement!;
    botao(pagina, /Manter só o que faltou/).click();
    await estavel(harness);
    expect(snack.ultima()).toBe('Ficou só o que faltou');
    expect([...fs.docs.keys()].filter((k) => k.includes('/itens/')).sort()).toEqual(
      ['banana', 'coca', 'leite', 'pao'].map((i) => `${BASE_LISTAS}/l1/itens/${i}`),
    );

    gravarLista(fs, listaCompras({ nome: 'Mês', notas: [CHAVE_LISTA], qtdItens: 4 }, 'l1'));
    await harness.navigateByUrl(`/listas/l1/conferir?chave=${CHAVE_LISTA}`);
    await estavel(harness);
    pagina = harness.routeNativeElement!;
    botao(pagina, /Excluir lista/).click();
    await estavel(harness);
    expect(TestBed.inject(Router).url).toBe('/listas');
    expect(fs.docs.size).toBe(0);
  });

  it('segunda nota: itens já ligados ficam de fora', async () => {
    const { el } = await abrir();
    const tudo = texto(el);
    expect(tudo).not.toContain('molho de tomate');
  });

  it('nota já conferida abre em modo leitura; nota excluída mostra o aviso', async () => {
    const v = {
      chave: CHAVE_LISTA,
      n: 1,
      produtoId: locDelta('001'),
      descricao: 'Cerv Therez 500ml Go',
      qtd: 1,
      unidade: 'UN',
      vlTotal: 11.79,
      cnpj: '44444444000191',
      mercado: 'Mercado Delta',
      como: 'manual' as const,
    };
    const { el, notas, harness } = await abrir({
      itens: [
        itemLista('cerveja', { texto: 'cerveja', marcado: true, vinculo: v }),
        itemLista('b', { ordem: 2 }),
      ],
      lista: { notas: [CHAVE_LISTA] },
    });
    expect(secao(el, 'conf-ligados')).toEqual([
      'cervejana nota comosubdirectory_arrow_right Cerv Therez 500ml Go · 1 UN R$ 11,79',
    ]);
    expect(el.querySelector('.cp-summary')).toBeNull();
    notas.get(CHAVE_LISTA)!.next(null);
    await estavel(harness);
    expect(texto(el)).toContain('A nota foi excluída.');
    expect(el.querySelector('header a[href^="/notas/"]')).toBeNull();
  });

  it('modo leitura sem itens ligados', async () => {
    const { el } = await abrir({ itens: [itemLista('b')], lista: { notas: [CHAVE_LISTA] } });
    expect(secao(el, 'conf-ligados')).toEqual(['Nenhum item da lista ligado a esta nota.']);
  });

  it('nota que não existe e lista com 3 notas', async () => {
    const semNota = await abrir({ nota: false });
    expect(texto(semNota.el.querySelector('.cp-empty-title'))).toBe('Nota não encontrada');
    TestBed.resetTestingModule();
    const cheia = await abrir({ lista: { notas: ['1', '2', '3'] } });
    expect(texto(cheia.el.querySelector('.cp-empty-title'))).toBe(
      'Esta lista já foi conferida com 3 notas',
    );
  });

  it('lista inexistente', async () => {
    const c = cenarioListas();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: 'listas/:id/conferir', component: ConferenciaPage }],
          withComponentInputBinding(),
        ),
        ...c.providers,
      ],
    });
    const harness = await RouterTestingHarness.create(`/listas/nada/conferir?chave=${CHAVE_LISTA}`);
    await estavel(harness);
    expect(texto(harness.routeNativeElement!.querySelector('.cp-empty-title'))).toBe(
      'Lista não encontrada',
    );
  });

  it('sem os grupos (offline), concilia só pelo texto', async () => {
    const { el } = await abrir({ gruposFalham: true });
    expect(nomes(el, 'conf-comprados')).not.toContain('CAFE ITAMARATY 500G');
    expect(secao(el, 'conf-confirme').find((t) => t.startsWith('CAFE'))).toContain('aproximado');
  });

  it('erro ao ler a lista ou a nota', async () => {
    const { el, fs, notas, harness } = await abrir();
    notas.get(CHAVE_LISTA)!.error(new Error('offline'));
    await estavel(harness);
    expect(texto(el.querySelector('.cp-empty-title'))).toBe('Nota não encontrada');
    fs.falhar(BASE_LISTAS);
    await estavel(harness);
    expect(texto(harness.routeNativeElement!.querySelector('.cp-empty-title'))).toBe(
      'Lista não encontrada',
    );
  });
});

describe('EscolherParDialog', () => {
  it('liga a opção escolhida; sem escolha não fecha', () => {
    const ref = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            titulo: '"banana" estava na nota como…',
            opcoes: [
              { id: '1', rotulo: 'BANANA PRATA', detalhe: '1,2 KG' },
              { id: '2', rotulo: 'BANANA NANICA' },
            ],
          },
        },
        { provide: MatDialogRef, useValue: ref },
      ],
    });
    const fixture = TestBed.createComponent(EscolherParDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('label')].map((l) => texto(l))).toEqual([
      'BANANA PRATA1,2 KG',
      'BANANA NANICA',
    ]);
    expect(botao(el, 'Ligar').disabled).toBe(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(ref.close).not.toHaveBeenCalled();
    el.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].dispatchEvent(
      new Event('change'),
    );
    fixture.detectChanges();
    botao(el, 'Ligar').click();
    expect(ref.close).toHaveBeenCalledWith('2');
  });
});
