import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { nomeExibido } from '@shared/apelido';
import type { Estabelecimento, Nota, Produto, ProdutoId } from '@shared/model';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { botao, digitar, porRotulo, texto } from '../../../testing/dom';
import { AuthStore } from '../../core/auth/auth.store';
import { ApelidosService } from '../estabelecimentos/data-access/apelidos.service';
import { EstabelecimentosService } from '../estabelecimentos/data-access/estabelecimentos.service';
import EstabelecimentoDetalhePage from '../estabelecimentos/detalhe/estabelecimento-detalhe.page';
import EstabelecimentosListaPage from '../estabelecimentos/lista/estabelecimentos-lista.page';
import { RenomearDialog } from '../estabelecimentos/renomear/renomear-dialog';
import { ListasStore } from '../listas/data-access/listas.store';
import { NotasService } from '../notas/data-access/notas.service';
import { PendentesService } from '../notas/data-access/pendentes.service';
import { ProdutosService } from '../produtos/data-access/produtos.service';
import ProdutoDetalhePage from '../produtos/detalhe/produto-detalhe.page';
import { VincularDialog } from '../produtos/vincular/vincular-dialog';
import { LocalizacaoStore } from '../regiao/localizacao/localizacao.store';
import PainelPage from './painel.page';

const hoje = new Date().toISOString();

function produto(id: string, extra: Partial<Produto> = {}): Produto {
  return {
    id: id as ProdutoId,
    ean: id.startsWith('ean:') ? id.slice(4) : null,
    descricao: 'LEITE UHT INT 1L',
    descricaoNorm: 'LEITE UHT INTEGRAL 1L',
    tokens: ['LEITE', 'UHT', 'INTEGRAL', '1L'],
    conteudo: { quantidade: 1, unidadeBase: 'L' },
    vinculadoA: null,
    menorPreco: null,
    ultimaObservacao: null,
    ...extra,
  };
}

function nota(chave: string, total: number): Nota {
  return {
    chave,
    cnpj: 'A',
    estabelecimentoNome: 'Mercado A',
    estabelecimentoCidade: 'CURITIBA',
    emissao: hoje,
    total,
    desconto: 0,
    qtdItens: 1,
    itens: [],
    importadaEm: hoje,
  };
}

let apelidos = signal<ReadonlyMap<string, string>>(new Map());
let definir = vi.fn();
let adicionarEmLista = vi.fn();

function base(providers: unknown[]) {
  apelidos = signal(new Map());
  definir = vi.fn();
  adicionarEmLista = vi.fn(async () => 'l1');
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthStore,
        useValue: { uid: signal('u1'), usuario: signal({ displayName: 'Ana Souza' }) },
      },
      { provide: PendentesService, useValue: { pendentes: signal([]) } },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      {
        provide: ApelidosService,
        useValue: {
          apelidos: () => apelidos(),
          nome: (e: Estabelecimento) => nomeExibido(e, apelidos().get(e.cnpj)),
          definir: (...a: unknown[]) => definir(...a),
        },
      },
      {
        provide: ListasStore,
        useValue: {
          listas: signal([]),
          emAndamento: signal(null),
          adicionarEmLista: (...a: unknown[]) => adicionarEmLista(...a),
        },
      },
      ...(providers as never[]),
    ],
  });
}

async function renderizar<T>(tipo: new () => T, inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(tipo);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PainelPage', () => {
  it('total do mês, variação, economia, últimas notas e atalhos', async () => {
    const todas = vi.fn(async (f: { de?: string | null }) =>
      f.de && new Date(f.de).getMonth() === new Date().getMonth()
        ? [nota('s1', 100), nota('s2', 50)]
        : [nota('a1', 120)],
    );
    base([
      {
        provide: NotasService,
        useValue: {
          todas,
          listar: vi.fn(async () => ({ notas: [nota('s1', 100)], cursor: null, temMais: false })),
        },
      },
      { provide: ProdutosService, useValue: { produtosPorIds: vi.fn(async () => new Map()) } },
    ]);
    const { el } = await renderizar(PainelPage);
    expect(texto(el.querySelector('h1'))).toBe('Olá, Ana');
    expect(texto(el)).toContain('R$ 150,00');
    expect(texto(el)).toContain('+25% em relação ao mês passado');
    expect(texto(el)).toContain('você pagou o menor preço conhecido');
    expect(el.querySelector('a[href="/notas/s1"]')).not.toBeNull();
    expect(botao(el, /Importar nota/).getAttribute('href')).toBe('/importar');
    expect(botao(el, /Preços perto de mim/).getAttribute('href')).toBe('/regiao');
  });

  it('sem notas explica o app em 3 passos', async () => {
    base([
      {
        provide: NotasService,
        useValue: {
          todas: vi.fn(async () => []),
          listar: vi.fn(async () => ({ notas: [], cursor: null, temMais: false })),
        },
      },
      { provide: ProdutosService, useValue: { produtosPorIds: vi.fn(async () => new Map()) } },
    ]);
    const { el } = await renderizar(PainelPage);
    expect(el.querySelectorAll('.painel-passos li')).toHaveLength(3);
    expect(botao(el, 'Importar primeira nota')).toBeTruthy();
  });
});

describe('ProdutoDetalhePage', () => {
  function servico(equivalentes: Produto[]) {
    return {
      equivalentes: vi.fn(async () => equivalentes),
      precos: vi.fn(async () => [
        {
          id: 'K1_1',
          chave: 'K1',
          produtoId: 'ean:7891000100103',
          cnpj: 'A',
          vlUnit: 4.49,
          unidade: 'UN',
          precoPorUnidadeBase: { valor: 4.49, unidade: 'L' },
          emissao: hoje,
        },
        {
          id: 'K2_1',
          chave: 'K2',
          produtoId: 'loc:03644587000836:1001',
          cnpj: 'B',
          vlUnit: 5.29,
          unidade: 'UN',
          precoPorUnidadeBase: { valor: 5.29, unidade: 'L' },
          emissao: hoje,
        },
      ]),
      estabelecimentosPorCnpj: vi.fn(
        async () =>
          new Map<string, Estabelecimento>([
            [
              'A',
              {
                cnpj: 'A',
                nome: 'Mercado A',
                endereco: '',
                cidade: '',
                uf: 'PR',
                atualizadoEm: hoje,
              },
            ],
          ]),
      ),
      desvincular: vi.fn(async () => ({ ok: true, canonico: 'x' })),
    };
  }

  it('produto com EAN mostra os preços do vinculado, menor/médio/maior e badges', async () => {
    const s = servico([
      produto('ean:7891000100103'),
      produto('loc:03644587000836:1001', { vinculadoA: 'ean:7891000100103' }),
    ]);
    base([
      { provide: ProdutosService, useValue: s },
      { provide: NotasService, useValue: { chaves: vi.fn(async () => new Set(['K1'])) } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      {
        provide: LocalizacaoStore,
        useValue: { pronta: signal(false), geohash: signal(null), raioKm: signal(2) },
      },
    ]);
    const { el } = await renderizar(ProdutoDetalhePage, { id: 'ean:7891000100103' });
    expect(s.precos).toHaveBeenCalledWith(['ean:7891000100103', 'loc:03644587000836:1001']);
    expect(texto(el)).toContain('R$ 4,49/L');
    const resumo = texto(el.querySelector('.cp-summary'));
    expect(resumo).toContain('R$ 4,89');
    expect(resumo).not.toContain('/L');
    expect(texto(el)).toContain('R$ 5,29/L');
    expect(texto(el)).toContain('Menor preço');
    expect(texto(el)).toContain('R$ 0,80 mais caro');
    expect(texto(el)).toContain('Suas notas');
    expect(texto(el)).toContain('Comunidade');
    expect(() => botao(el, /Este produto é o mesmo que/)).toThrow();
  });

  it('"Adicionar à lista" leva o canônico (RF-04)', async () => {
    const s = servico([
      produto('ean:7891000100103', { descricao: 'LEITE ITALAC 1L' }),
      produto('loc:03644587000836:1001', { vinculadoA: 'ean:7891000100103' }),
    ]);
    base([
      { provide: ProdutosService, useValue: s },
      { provide: NotasService, useValue: { chaves: vi.fn(async () => new Set()) } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      {
        provide: LocalizacaoStore,
        useValue: { pronta: signal(false), geohash: signal(null), raioKm: signal(2) },
      },
    ]);
    const { el, fixture } = await renderizar(ProdutoDetalhePage, { id: 'loc:03644587000836:1001' });
    botao(el, /Adicionar à lista/).click();
    await fixture.whenStable();
    expect(adicionarEmLista).toHaveBeenCalledWith([
      expect.objectContaining({
        grupo: 'ean:7891000100103',
        texto: 'LEITE ITALAC 1L',
        origem: 'produto',
      }),
    ]);
  });

  it('produto sem EAN oferece o vínculo e o desfazer', async () => {
    const s = servico([produto('loc:03644587000836:1001', { vinculadoA: 'loc:1:x' })]);
    const dialog = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
    base([
      { provide: ProdutosService, useValue: s },
      { provide: NotasService, useValue: { chaves: vi.fn(async () => new Set()) } },
      { provide: MatDialog, useValue: dialog },
      {
        provide: LocalizacaoStore,
        useValue: { pronta: signal(false), geohash: signal(null), raioKm: signal(2) },
      },
    ]);
    const { el, fixture } = await renderizar(ProdutoDetalhePage, { id: 'loc:03644587000836:1001' });
    botao(el, /Este produto é o mesmo que/).click();
    await fixture.whenStable();
    expect(dialog.open).toHaveBeenCalledWith(
      VincularDialog,
      expect.objectContaining({
        data: expect.objectContaining({ excluir: ['loc:03644587000836:1001'] }),
      }),
    );
    botao(el, 'Desfazer vínculo').click();
    await fixture.whenStable();
    expect(s.desvincular).toHaveBeenCalledWith('loc:03644587000836:1001');
  });

  it('vínculo automático explica que foi ligado a outros mercados', async () => {
    const s = servico([
      produto('loc:03644587000836:1001', { vinculadoA: 'loc:1:x', vinculoOrigem: 'auto' }),
    ]);
    base([
      { provide: ProdutosService, useValue: s },
      { provide: NotasService, useValue: { chaves: vi.fn(async () => new Set()) } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
      {
        provide: LocalizacaoStore,
        useValue: { pronta: signal(false), geohash: signal(null), raioKm: signal(2) },
      },
    ]);
    const { el } = await renderizar(ProdutoDetalhePage, { id: 'loc:03644587000836:1001' });
    expect(texto(el)).toContain(
      'Ligado automaticamente a produtos de outros mercados. Se estiver errado, desfaça o vínculo.',
    );
    expect(texto(el)).not.toContain('identificado automaticamente pelo Menor Preço');
  });

  it('produto inexistente', async () => {
    base([
      { provide: ProdutosService, useValue: servico([]) },
      { provide: NotasService, useValue: { chaves: vi.fn(async () => new Set()) } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ]);
    const { el } = await renderizar(ProdutoDetalhePage, { id: 'x' });
    expect(texto(el)).toContain('Produto não encontrado');
  });
});

describe('VincularDialog', () => {
  it('sugere, escolhe e vincula; erro de EANs distintos aparece', async () => {
    const base0 = produto('loc:1:a', {
      descricao: 'LEITE UHT INT 1L',
      descricaoNorm: 'LEITE UHT INTEGRAL 1L',
    });
    const candidato = produto('ean:7891000100103', { descricao: 'LEITE UHT INTEGRAL 1L' });
    const vincular = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, erro: { codigo: 'eans-distintos' } })
      .mockResolvedValueOnce({ ok: true, canonico: candidato.id });
    const fechar = vi.fn();
    base([
      {
        provide: ProdutosService,
        useValue: { buscar: vi.fn(async () => [candidato, base0]), vincular },
      },
      { provide: MAT_DIALOG_DATA, useValue: { produto: base0, excluir: [base0.id] } },
      { provide: MatDialogRef, useValue: { close: fechar } },
    ]);
    const { el, fixture } = await renderizar(VincularDialog);
    const opcao = [...el.querySelectorAll('ul button')].find((b) =>
      texto(b).includes('EAN 7891000100103'),
    ) as HTMLButtonElement;
    opcao.click();
    fixture.detectChanges();
    botao(el, 'É o mesmo produto').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('[role="alert"]'))).toContain('códigos de barras diferentes');
    botao(el, 'É o mesmo produto').click();
    await fixture.whenStable();
    expect(vincular).toHaveBeenLastCalledWith('loc:1:a', 'ean:7891000100103');
    expect(fechar).toHaveBeenCalledWith(true);
  });
});

describe('Estabelecimentos', () => {
  const estab = (cnpj: string, nome: string): Estabelecimento => ({
    cnpj,
    nome,
    endereco: 'RUA X, 1',
    cidade: 'CURITIBA',
    uf: 'PR',
    atualizadoEm: hoje,
  });

  it('lista mostra o apelido e a busca acha por ele', async () => {
    base([
      {
        provide: EstabelecimentosService,
        useValue: {
          listar: vi.fn(async () => ({
            itens: [estab('A', 'CONDOR SUPER CENTER LTDA'), estab('B', 'Muffato')],
            cursor: null,
            temMais: false,
          })),
        },
      },
    ]);
    apelidos.set(new Map([['A', 'Condor Pinheirinho']]));
    const { el, fixture } = await renderizar(EstabelecimentosListaPage);
    expect(texto(el.querySelector('ul'))).toContain('Condor Pinheirinho');
    expect(texto(el.querySelector('ul'))).not.toContain('CONDOR SUPER CENTER');
    const campo = el.querySelector('input')!;
    campo.value = 'pinheir';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelectorAll('ul li')).toHaveLength(1);
    campo.value = 'super center';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelectorAll('ul li')).toHaveLength(1);
  });

  it('lista com busca por nome no cliente', async () => {
    base([
      {
        provide: EstabelecimentosService,
        useValue: {
          listar: vi.fn(async () => ({
            itens: [estab('A', 'Condor'), estab('B', 'Muffato')],
            cursor: null,
            temMais: false,
          })),
        },
      },
    ]);
    const { el, fixture } = await renderizar(EstabelecimentosListaPage);
    expect(el.querySelectorAll('ul li')).toHaveLength(2);
    const campo = el.querySelector('input')!;
    campo.value = 'muf';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(texto(el.querySelector('ul'))).toContain('Muffato');
    expect(el.querySelectorAll('ul li')).toHaveLength(1);
  });

  it('detalhe mostra os produtos da nota com preço e link', async () => {
    base([
      {
        provide: EstabelecimentosService,
        useValue: {
          obter: vi.fn(async () => estab('03644587000836', 'Mercado A')),
          produtosRecentes: vi.fn(async () => [
            {
              produtoId: 'ean:7891000100103',
              produto: produto('ean:7891000100103'),
              preco: {
                produtoId: 'ean:7891000100103',
                cnpj: 'A',
                vlUnit: 4.49,
                unidade: 'UN',
                precoPorUnidadeBase: { valor: 4.49, unidade: 'L' },
                emissao: hoje,
              },
            },
          ]),
        },
      },
    ]);
    const { el } = await renderizar(EstabelecimentoDetalhePage, { cnpj: '03644587000836' });
    expect(texto(el.querySelector('h1'))).toBe('Mercado A');
    expect(texto(el)).toContain('CNPJ 03.644.587/0008-36');
    expect(el.querySelector('a[href="/produtos/ean:7891000100103"]')).not.toBeNull();
    expect(texto(el)).toContain('R$ 4,49/L');
  });

  async function renderizarDetalhe(e: Estabelecimento) {
    base([
      {
        provide: EstabelecimentosService,
        useValue: { obter: vi.fn(async () => e), produtosRecentes: vi.fn(async () => []) },
      },
    ]);
    return (await renderizar(EstabelecimentoDetalhePage, { cnpj: e.cnpj })).el;
  }

  it('detalhe com nome fantasia mostra a razão social abaixo do título', async () => {
    const el = await renderizarDetalhe({
      ...estab('03644587000836', 'Sanches e Vecchiate Ltda'),
      fantasia: 'BOX ATACADISTA',
    });
    expect(texto(el.querySelector('h1'))).toBe('BOX ATACADISTA');
    expect(texto(el)).toContain('Razão social: Sanches e Vecchiate Ltda');
  });

  it('detalhe sem nome fantasia mostra só a razão social', async () => {
    const el = await renderizarDetalhe(estab('03644587000836', 'Sanches e Vecchiate Ltda'));
    expect(texto(el.querySelector('h1'))).toBe('Sanches e Vecchiate Ltda');
    expect(texto(el)).not.toContain('Razão social');
  });

  it('detalhe com apelido: título, "Nome na Receita" e "Razão social"; botão Renomear', async () => {
    base([
      {
        provide: EstabelecimentosService,
        useValue: {
          obter: vi.fn(async () => ({
            ...estab('03644587000836', 'SANCHES E VECCHIATE LTDA'),
            fantasia: 'BOX ATACADISTA',
          })),
          produtosRecentes: vi.fn(async () => []),
        },
      },
    ]);
    apelidos.set(new Map([['03644587000836', 'Box da Av. Brasil']]));
    const { el } = await renderizar(EstabelecimentoDetalhePage, { cnpj: '03644587000836' });
    expect(texto(el.querySelector('h1'))).toBe('Box da Av. Brasil');
    expect(texto(el)).toContain('Nome na Receita: BOX ATACADISTA');
    expect(texto(el)).toContain('Razão social: SANCHES E VECCHIATE LTDA');
    expect(texto(botao(el, 'Renomear estabelecimento').querySelector('mat-icon'))).toBe('edit');
  });

  it('Renomear abre o diálogo e mostra o snackbar no sucesso', async () => {
    const dialog = {
      open: vi.fn(() => ({ afterClosed: () => of({ apelido: 'Condor', notasAtualizadas: 3 }) })),
    };
    const snack = { open: vi.fn() };
    base([
      {
        provide: EstabelecimentosService,
        useValue: {
          obter: vi.fn(async () => estab('76189406000126', 'CONDOR SUPER CENTER LTDA')),
          produtosRecentes: vi.fn(async () => []),
        },
      },
      { provide: MatDialog, useValue: dialog },
      { provide: MatSnackBar, useValue: snack },
    ]);
    const { el } = await renderizar(EstabelecimentoDetalhePage, { cnpj: '76189406000126' });
    botao(el, 'Renomear estabelecimento').click();
    await vi.waitFor(() =>
      expect(snack.open).toHaveBeenCalledWith(
        'Nome salvo. 3 notas atualizadas.',
        'OK',
        expect.anything(),
      ),
    );
    expect(dialog.open).toHaveBeenCalledWith(RenomearDialog, {
      data: { cnpj: '76189406000126', nome: 'CONDOR SUPER CENTER LTDA' },
      maxWidth: '480px',
      width: '95vw',
    });
  });
});

describe('RenomearDialog', () => {
  const CNPJ = '76189406000126';
  const CAMPO = 'Como você chama esta loja?';

  function montar(dados: Record<string, unknown>) {
    const fechar = vi.fn();
    base([
      {
        provide: MAT_DIALOG_DATA,
        useValue: { cnpj: CNPJ, nome: 'CONDOR SUPER CENTER LTDA', ...dados },
      },
      { provide: MatDialogRef, useValue: { close: fechar } },
    ]);
    return fechar;
  }

  it('sem apelido: começa com a sugestão, salva e fecha', async () => {
    const fechar = montar({});
    definir.mockResolvedValue({
      ok: true,
      valor: { apelido: 'Condor Pinheirinho', notasAtualizadas: 2 },
    });
    const { el, fixture } = await renderizar(RenomearDialog);
    const campo = porRotulo(el, CAMPO);
    expect(campo.value).toBe('Condor Super Center');
    expect(() => botao(el, 'Usar o nome oficial')).toThrow();
    digitar(campo, 'Condor Pinheirinho');
    fixture.detectChanges();
    botao(el, 'Salvar').click();
    await fixture.whenStable();
    expect(definir).toHaveBeenCalledWith(CNPJ, 'Condor Pinheirinho');
    expect(fechar).toHaveBeenCalledWith({ apelido: 'Condor Pinheirinho', notasAtualizadas: 2 });
  });

  it('com apelido: "Usar o nome oficial" chama com null', async () => {
    const fechar = montar({ apelido: 'Condor Pinheirinho', fantasia: 'CONDOR' });
    definir.mockResolvedValue({ ok: true, valor: { apelido: null, notasAtualizadas: 1 } });
    const { el, fixture } = await renderizar(RenomearDialog);
    expect(porRotulo(el, CAMPO).value).toBe('Condor Pinheirinho');
    botao(el, 'Usar o nome oficial').click();
    await fixture.whenStable();
    expect(definir).toHaveBeenCalledWith(CNPJ, null);
    expect(fechar).toHaveBeenCalledWith({ apelido: null, notasAtualizadas: 1 });
  });

  it('erro do servidor fica no campo e o diálogo continua aberto', async () => {
    const fechar = montar({});
    definir.mockResolvedValue({ ok: false, erro: { codigo: 'rate-limit' } });
    const { el, fixture } = await renderizar(RenomearDialog);
    botao(el, 'Salvar').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('.cp-field-error'))).toContain('Muitas importações seguidas');
    expect(fechar).not.toHaveBeenCalled();
  });

  it('campo inválido desabilita Salvar', async () => {
    montar({});
    const { el, fixture } = await renderizar(RenomearDialog);
    digitar(porRotulo(el, CAMPO), '*');
    fixture.detectChanges();
    expect(botao(el, 'Salvar').disabled).toBe(true);
  });
});
