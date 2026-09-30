import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import type { CodigoErroImportacao, NfceParsed } from '@shared/model';
import { vi } from 'vitest';
import { CHAMAR_FUNCTION } from '../../core/firebase/callable';
import { HistoricoPessoalStore } from '../notas/data-access/historico-pessoal.store';
import { PendentesService } from '../notas/data-access/pendentes.service';
import { botao, digitar, porRotulo, texto } from '../../../testing/dom';
import { ImportarService, erroDeFunctions } from './data-access/importar.service';
import ImportarPage from './importar.page';
import { ImportarStore } from './importar.store';
import { MENSAGENS, interpretarEntrada, mensagemDe } from './mensagens';
import PreviewNotaPage from './preview-nota/preview-nota.page';

const CHAVE = '41260903644587000836652100000168701620438547';
const URL_QR = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}|2|1|1|E87B918B945714C101FE1D79B6BD32073BA8D651`;

const NOTA: NfceParsed = {
  chave: CHAVE,
  emitente: {
    cnpj: '03644587000836',
    nome: 'SUPERMERCADO EXEMPLO LTDA',
    endereco: 'RUA DAS FLORES, 123, CURITIBA, PR',
    cidade: 'CURITIBA',
    uf: 'PR',
  },
  emissao: '2026-09-27T13:05:12.000Z',
  itens: [
    {
      n: 1,
      descricao: 'LEITE UHT INT 1L',
      codigo: '1001',
      ean: null,
      qtd: 2,
      unidade: 'UN',
      vlUnit: 4.49,
      vlTotal: 8.98,
    },
    {
      n: 2,
      descricao: 'CAFE PILAO 500G',
      codigo: '3003',
      ean: null,
      qtd: 1,
      unidade: 'PCT',
      vlUnit: 21.9,
      vlTotal: 21.9,
    },
  ],
  total: 30.88,
  desconto: 0,
};

function montar(respostas: Record<string, unknown[]> = {}) {
  const filas = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, [...v]]));
  const chamar = vi.fn(async (nome: string) => {
    const r = filas[nome]?.shift();
    if (r instanceof Error) throw r;
    return r;
  });
  const snack = { open: vi.fn() };
  const historico = { invalidar: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CHAMAR_FUNCTION, useValue: chamar },
      { provide: MatSnackBar, useValue: snack },
      { provide: PendentesService, useValue: { pendentes: signal([]) } },
      { provide: HistoricoPessoalStore, useValue: historico },
    ],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  return { chamar, snack, navegar, historico };
}

describe('ImportarService', () => {
  it('sucesso e cada código de erro vindo da function', async () => {
    const codigos = Object.keys(MENSAGENS) as CodigoErroImportacao[];
    const { chamar } = montar({
      previewNfce: [
        { ok: true, nota: NOTA },
        ...codigos.map((codigo) => ({ ok: false, erro: { codigo } })),
      ],
    });
    const s = TestBed.inject(ImportarService);
    expect(await s.preview({ url: URL_QR })).toEqual({
      ok: true,
      valor: { nota: NOTA, apelido: null },
    });
    for (const codigo of codigos) {
      expect(await s.preview({ url: URL_QR })).toEqual({ ok: false, erro: { codigo } });
    }
    expect(chamar).toHaveBeenCalledWith('previewNfce', { url: URL_QR });
  });

  it('confirmar, enfileirar e retentar chamam as callables certas', async () => {
    const { chamar } = montar({
      confirmarNfce: [{ ok: true, chave: CHAVE }],
      enfileirarNfce: [{ ok: true, chave: CHAVE, proximaTentativa: 'x' }],
      retentarPendente: [{ ok: true, chave: CHAVE, proximaTentativa: 'y' }],
    });
    const s = TestBed.inject(ImportarService);
    expect(await s.confirmar(CHAVE)).toEqual({ ok: true, valor: CHAVE });
    expect(await s.enfileirar({ chave: CHAVE })).toEqual({
      ok: true,
      valor: { chave: CHAVE, proximaTentativa: 'x' },
    });
    expect(await s.retentar(CHAVE)).toEqual({ ok: true, valor: 'y' });
    expect(chamar.mock.calls.map((c) => c[0])).toEqual([
      'confirmarNfce',
      'enfileirarNfce',
      'retentarPendente',
    ]);
  });

  it('FunctionsError e resposta estranha viram ErroImportacao', async () => {
    montar({
      previewNfce: [Object.assign(new Error('x'), { code: 'functions/unauthenticated' }), 'lixo'],
    });
    const s = TestBed.inject(ImportarService);
    expect(await s.preview({ url: URL_QR })).toEqual({
      ok: false,
      erro: { codigo: 'nao-autenticado' },
    });
    expect(await s.preview({ url: URL_QR })).toEqual({
      ok: false,
      erro: { codigo: 'desconhecido' },
    });
    expect(erroDeFunctions({ code: 'functions/resource-exhausted' })).toEqual({
      codigo: 'rate-limit',
    });
    expect(erroDeFunctions({ code: 'functions/unavailable' })).toEqual({
      codigo: 'sefaz-indisponivel',
    });
    expect(erroDeFunctions(null)).toEqual({ codigo: 'desconhecido' });
  });
});

describe('interpretarEntrada (validação local)', () => {
  it('URL do QR, chave com espaços e erros locais', () => {
    expect(interpretarEntrada(URL_QR)).toEqual({ ok: true, entrada: { url: URL_QR } });
    expect(interpretarEntrada(CHAVE.replace(/(\d{4})/g, '$1 '))).toEqual({
      ok: true,
      entrada: { chave: CHAVE },
    });
    expect(interpretarEntrada(CHAVE.slice(0, 43) + '0')).toEqual({
      ok: false,
      erro: { codigo: 'chave-invalida' },
    });
    expect(interpretarEntrada('123')).toEqual({ ok: false, erro: { codigo: 'chave-invalida' } });
    expect(interpretarEntrada('https://google.com')).toEqual({
      ok: false,
      erro: { codigo: 'url-invalida' },
    });
  });

  it('chave de outra UF (na URL ou digitada) → uf-nao-suportada', () => {
    const base = '35' + CHAVE.slice(2, 43);
    const dv = [...Array(10).keys()].find(
      (d) =>
        interpretarEntrada(base + d).ok === false &&
        (interpretarEntrada(base + d) as { erro: { codigo: string } }).erro.codigo ===
          'uf-nao-suportada',
    );
    expect(dv).toBeDefined();
    const sp = base + dv;
    expect(
      interpretarEntrada(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${sp}|2|1|1|ABC`),
    ).toEqual({
      ok: false,
      erro: { codigo: 'uf-nao-suportada' },
    });
  });
});

describe('ImportarStore', () => {
  it('URL válida → prévia → navega para /importar/preview', async () => {
    const { navegar } = montar({ previewNfce: [{ ok: true, nota: NOTA }] });
    const store = TestBed.inject(ImportarStore);
    await store.importarTexto(URL_QR);
    expect(store.estado()).toEqual({
      tipo: 'preview',
      entrada: { url: URL_QR },
      nota: NOTA,
      apelido: null,
    });
    expect(navegar).toHaveBeenCalledWith(['/importar/preview']);
  });

  it('chave com DV inválido não chama a function', async () => {
    const { chamar } = montar();
    const store = TestBed.inject(ImportarStore);
    await store.importarTexto(CHAVE.slice(0, 43) + '0');
    expect(chamar).not.toHaveBeenCalled();
    expect(store.estado()).toMatchObject({
      tipo: 'erro',
      entrada: null,
      erro: { codigo: 'chave-invalida' },
    });
  });

  it('confirmar leva ao detalhe com snackbar; preview-expirado refaz a prévia uma vez', async () => {
    const { navegar, snack, chamar, historico } = montar({
      previewNfce: [
        { ok: true, nota: NOTA },
        { ok: true, nota: NOTA },
      ],
      confirmarNfce: [
        { ok: false, erro: { codigo: 'preview-expirado' } },
        { ok: true, chave: CHAVE },
      ],
    });
    const store = TestBed.inject(ImportarStore);
    await store.importarTexto(URL_QR);
    await store.confirmar();
    expect(chamar.mock.calls.map((c) => c[0])).toEqual([
      'previewNfce',
      'confirmarNfce',
      'previewNfce',
      'confirmarNfce',
    ]);
    expect(navegar).toHaveBeenLastCalledWith(['/notas', CHAVE]);
    expect(snack.open).toHaveBeenCalledWith('Nota importada', 'OK', expect.anything());
    expect(historico.invalidar).toHaveBeenCalledOnce();
    expect(store.estado()).toEqual({ tipo: 'ocioso' });
  });

  it('erro na confirmação mantém a nota na tela', async () => {
    const { historico } = montar({
      previewNfce: [{ ok: true, nota: NOTA }],
      confirmarNfce: [{ ok: false, erro: { codigo: 'rate-limit' } }],
    });
    const store = TestBed.inject(ImportarStore);
    await store.importarTexto(URL_QR);
    await store.confirmar();
    expect(store.nota()).toEqual(NOTA);
    expect(store.estado()).toMatchObject({ tipo: 'erro', erro: { codigo: 'rate-limit' } });
    expect(historico.invalidar).not.toHaveBeenCalled();
  });

  it('sefaz-indisponivel → guardar chama enfileirarNfce com a mesma entrada', async () => {
    const { chamar, snack } = montar({
      previewNfce: [{ ok: false, erro: { codigo: 'sefaz-indisponivel' } }],
      enfileirarNfce: [{ ok: true, chave: CHAVE, proximaTentativa: '2026-09-27T15:15:00.000Z' }],
    });
    const store = TestBed.inject(ImportarStore);
    await store.importarTexto(URL_QR);
    await store.guardar();
    expect(chamar).toHaveBeenLastCalledWith('enfileirarNfce', { url: URL_QR });
    expect(store.estado()).toEqual({
      tipo: 'guardada',
      chave: CHAVE,
      proximaTentativa: '2026-09-27T15:15:00.000Z',
    });
    expect(snack.open).toHaveBeenCalled();
  });

  it('ja-importada com o estabelecimento atualizado invalida o histórico; sem o flag, não', async () => {
    const { historico } = montar({
      previewNfce: [
        { ok: false, erro: { codigo: 'ja-importada', chave: CHAVE } },
        {
          ok: false,
          erro: { codigo: 'ja-importada', chave: CHAVE, estabelecimentoAtualizado: true },
        },
      ],
    });
    const store = TestBed.inject(ImportarStore);
    await store.importarTexto(URL_QR);
    expect(historico.invalidar).not.toHaveBeenCalled();
    await store.importarTexto(URL_QR);
    expect(historico.invalidar).toHaveBeenCalledOnce();
    expect(store.estado()).toMatchObject({
      tipo: 'erro',
      erro: { codigo: 'ja-importada', estabelecimentoAtualizado: true },
    });
  });
});

describe('mensagemDe', () => {
  it('ja-importada sem e com o estabelecimento atualizado', () => {
    expect(mensagemDe({ codigo: 'ja-importada', chave: CHAVE })).toEqual({
      texto: 'Você já importou essa nota.',
      acao: 'abrir-nota',
    });
    expect(
      mensagemDe({ codigo: 'ja-importada', chave: CHAVE, estabelecimentoAtualizado: true }),
    ).toEqual({
      texto: 'Você já importou essa nota. Aproveitamos para atualizar os dados do estabelecimento.',
      acao: 'abrir-nota',
    });
  });
});

describe('ImportarPage', () => {
  async function renderizar(respostas: Record<string, unknown[]> = {}) {
    const ctx = montar(respostas);
    const fixture = TestBed.createComponent(ImportarPage);
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('ação principal "Ler QR Code do cupom" em destaque e alternativas', async () => {
    const { el } = await renderizar();
    const principal = botao(el, /Ler QR Code do cupom/);
    expect(principal.classList).toContain('cp-btn-primary');
    expect(texto(el)).toContain('Colar link do QR');
    expect(texto(el)).toContain('Digitar a chave de 44 dígitos');
  });

  it('chave com máscara em blocos de 4; DV errado mostra erro no campo sem chamar a function', async () => {
    const { el, fixture, chamar } = await renderizar();
    const campo = el.querySelectorAll('input')[1] as HTMLInputElement;
    campo.value = CHAVE.slice(0, 43) + '0';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(campo.value).toBe('4126 0903 6445 8700 0836 6521 0000 0168 7016 2043 8540');
    botao(el, 'Importar chave').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('#chave-erro'))).toContain('Essa chave não é válida');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(chamar).not.toHaveBeenCalled();
  });

  it.each(
    Object.entries(MENSAGENS).filter(
      ([c]) => !['chave-invalida', 'url-invalida', 'uf-nao-suportada'].includes(c),
    ),
  )('erro %s mostra a mensagem própria', async (codigo, m) => {
    const { el, fixture } = await renderizar({
      previewNfce: [
        { ok: false, erro: codigo === 'ja-importada' ? { codigo, chave: CHAVE } : { codigo } },
      ],
    });
    const url = el.querySelector('input[type="url"]') as HTMLInputElement;
    url.value = URL_QR;
    url.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    botao(el, 'Importar link').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(el.querySelector('[role="alert"]'))).toContain(m.texto);
  });

  it('sefaz-indisponivel oferece "Guardar e importar quando voltar"; ja-importada abre a nota', async () => {
    const { el, fixture, chamar, navegar } = await renderizar({
      previewNfce: [
        { ok: false, erro: { codigo: 'sefaz-indisponivel' } },
        { ok: false, erro: { codigo: 'ja-importada', chave: CHAVE } },
      ],
      enfileirarNfce: [{ ok: true, chave: CHAVE, proximaTentativa: '2026-09-27T15:15:00.000Z' }],
    });
    const url = el.querySelector('input[type="url"]') as HTMLInputElement;
    url.value = URL_QR;
    url.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    botao(el, 'Importar link').click();
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, 'Guardar e importar quando voltar').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(chamar).toHaveBeenCalledWith('enfileirarNfce', { url: URL_QR });
    expect(texto(el)).toContain('Nota guardada');

    botao(el, 'Importar link').click();
    await fixture.whenStable();
    fixture.detectChanges();
    botao(el, 'Abrir a nota').click();
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/notas', CHAVE]);
  });
});

describe('PreviewNotaPage', () => {
  it('mostra os valores da nota e confirma', async () => {
    const { navegar } = montar({
      previewNfce: [{ ok: true, nota: NOTA }],
      confirmarNfce: [{ ok: true, chave: CHAVE }],
    });
    await TestBed.inject(ImportarStore).importarTexto(URL_QR);
    const fixture = TestBed.createComponent(PreviewNotaPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(texto(el.querySelector('h1'))).toBe('SUPERMERCADO EXEMPLO LTDA');
    expect(texto(el)).toContain('CNPJ 03.644.587/0008-36');
    expect(texto(el)).toContain('R$ 30,88');
    expect(texto(el)).toContain('2 UN × R$ 4,49');
    expect(texto(el)).toContain('R$ 43,80/kg');
    botao(el, 'Confirmar importação').click();
    await fixture.whenStable();
    expect(navegar).toHaveBeenLastCalledWith(['/notas', CHAVE]);
  });

  async function previa(respostas: Record<string, unknown[]>) {
    const ctx = montar(respostas);
    await TestBed.inject(ImportarStore).importarTexto(URL_QR);
    const fixture = TestBed.createComponent(PreviewNotaPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const confirmar = async () => {
      botao(el, 'Confirmar importação').click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { ...ctx, fixture, el, confirmar };
  }

  const CAMPO = 'Como você chama esta loja?';

  it('loja sem nome fantasia: campo com a sugestão, enviada na confirmação', async () => {
    const { el, chamar, confirmar } = await previa({
      previewNfce: [{ ok: true, nota: NOTA }],
      confirmarNfce: [{ ok: true, chave: CHAVE }],
    });
    expect(porRotulo(el, CAMPO).value).toBe('Supermercado Exemplo');
    expect(texto(el)).toContain('Razão social: SUPERMERCADO EXEMPLO LTDA');
    await confirmar();
    expect(chamar).toHaveBeenLastCalledWith('confirmarNfce', {
      chave: CHAVE,
      apelido: 'Supermercado Exemplo',
    });
  });

  it('campo apagado → apelido null', async () => {
    const { el, fixture, chamar, confirmar } = await previa({
      previewNfce: [{ ok: true, nota: NOTA }],
      confirmarNfce: [{ ok: true, chave: CHAVE }],
    });
    digitar(porRotulo(el, CAMPO), '   ');
    fixture.detectChanges();
    await confirmar();
    expect(chamar).toHaveBeenLastCalledWith('confirmarNfce', { chave: CHAVE, apelido: null });
  });

  it('campo inválido desabilita a confirmação', async () => {
    const { el, fixture } = await previa({ previewNfce: [{ ok: true, nota: NOTA }] });
    digitar(porRotulo(el, CAMPO), 'x');
    fixture.detectChanges();
    expect(botao(el, 'Confirmar importação').disabled).toBe(true);
  });

  it.each([
    [
      'com nome fantasia',
      { ok: true, nota: { ...NOTA, emitente: { ...NOTA.emitente, fantasia: 'BOX' } } },
      'BOX',
    ],
    [
      'com apelido já dado',
      { ok: true, nota: NOTA, apelido: 'Mercado da Esquina' },
      'Mercado da Esquina',
    ],
  ])('loja %s: sem campo e confirmarNfce só com a chave', async (_caso, resposta, titulo) => {
    const { el, chamar, confirmar } = await previa({
      previewNfce: [resposta],
      confirmarNfce: [{ ok: true, chave: CHAVE }],
    });
    expect(texto(el.querySelector('h1'))).toBe(titulo);
    expect(() => porRotulo(el, CAMPO)).toThrow();
    await confirmar();
    expect(chamar).toHaveBeenLastCalledWith('confirmarNfce', { chave: CHAVE });
  });

  it('apelido-invalido mantém a prévia e mostra o erro no campo', async () => {
    const { el, confirmar } = await previa({
      previewNfce: [{ ok: true, nota: NOTA }],
      confirmarNfce: [{ ok: false, erro: { codigo: 'apelido-invalido', chave: CHAVE } }],
    });
    await confirmar();
    const store = TestBed.inject(ImportarStore);
    expect(store.estado()).toMatchObject({ tipo: 'preview', erro: { codigo: 'apelido-invalido' } });
    expect(texto(el.querySelector('.cp-field-error'))).toBe(MENSAGENS['apelido-invalido'].texto);
    expect(porRotulo(el, CAMPO).value).toBe('Supermercado Exemplo');
  });

  it('preview-expirado refaz a prévia mantendo o apelido digitado', async () => {
    const { el, fixture, chamar, confirmar } = await previa({
      previewNfce: [
        { ok: true, nota: NOTA },
        { ok: true, nota: NOTA },
      ],
      confirmarNfce: [
        { ok: false, erro: { codigo: 'preview-expirado' } },
        { ok: true, chave: CHAVE },
      ],
    });
    digitar(porRotulo(el, CAMPO), 'Mercado da Esquina');
    fixture.detectChanges();
    await confirmar();
    const confirmacoes = chamar.mock.calls.filter((c) => c[0] === 'confirmarNfce');
    expect(confirmacoes.map((c) => (c as unknown[])[1])).toEqual([
      { chave: CHAVE, apelido: 'Mercado da Esquina' },
      { chave: CHAVE, apelido: 'Mercado da Esquina' },
    ]);
  });

  it('cancelar volta para Importar', () => {
    const { navegar } = montar();
    const fixture = TestBed.createComponent(PreviewNotaPage);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
    (fixture.componentInstance as unknown as { cancelar(): void }).cancelar();
    expect(navegar).toHaveBeenCalledWith(['/importar']);
  });
});
