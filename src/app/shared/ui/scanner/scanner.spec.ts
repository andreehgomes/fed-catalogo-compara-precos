import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { texto } from '../../../../testing/dom';
import { Scanner } from './scanner';
import { CodigoLido, SCANNER_ENGINE, criarDetector } from './scanner-engine';

function trilha() {
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn(() => ({ torch: true })),
    applyConstraints: vi.fn(async () => undefined),
  };
}

function montar(opcoes: { camera?: 'ok' | 'negada' | 'ausente'; leituras?: CodigoLido[][] } = {}) {
  const t = trilha();
  const stream = { getTracks: () => [t], getVideoTracks: () => [t] } as unknown as MediaStream;
  const leituras = [...(opcoes.leituras ?? [[]])];
  const detector = { detect: vi.fn(async () => leituras.shift() ?? []) };
  const engine = {
    criarDetector: vi.fn(async () => detector),
    abrirCamera: vi.fn(async () => {
      if (opcoes.camera === 'negada') throw new DOMException('negado', 'NotAllowedError');
      if (opcoes.camera === 'ausente') throw new DOMException('sem', 'NotFoundError');
      return stream;
    }),
    bitmapDe: vi.fn(async () => ({}) as ImageBitmap),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SCANNER_ENGINE, useValue: engine }] });
  const fixture = TestBed.createComponent(Scanner);
  fixture.componentRef.setInput('formatos', ['qr_code']);
  const lidos: string[] = [];
  let cancelou = false;
  fixture.componentInstance.lido.subscribe((v) => lidos.push(v));
  fixture.componentInstance.cancelado.subscribe(() => (cancelou = true));
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    engine,
    detector,
    t,
    lidos,
    cancelou: () => cancelou,
  };
}

async function estabilizar(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r));
  fixture.detectChanges();
}

async function escolher(el: HTMLElement, fixture: Parameters<typeof estabilizar>[0]) {
  const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', {
    value: [new File(['x'], 'qr.png', { type: 'image/png' })],
    configurable: true,
  });
  input.dispatchEvent(new Event('change'));
  await estabilizar(fixture);
}

describe('Scanner', () => {
  beforeEach(() => {
    HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
  });

  it('abre a câmera traseira e mostra a lanterna quando suportada', async () => {
    const { fixture, el, engine } = montar();
    await estabilizar(fixture);
    expect(engine.abrirCamera).toHaveBeenCalled();
    expect(texto(el.querySelector('[role="status"]'))).toBe('Aponte a câmera para o código');
    expect(texto(el)).toContain('Lanterna');
  });

  it('lê pela câmera, emite o valor e libera a câmera', async () => {
    const { fixture, el, t, lidos } = montar({
      leituras: [[{ rawValue: ' URL-DO-QR ', format: 'qr_code' }]],
    });
    await estabilizar(fixture);
    const video = el.querySelector('video')!;
    Object.defineProperty(video, 'readyState', { value: 4 });
    await new Promise((r) => setTimeout(r, 400));
    await estabilizar(fixture);
    expect(lidos).toEqual(['URL-DO-QR']);
    expect(t.stop).toHaveBeenCalled();
  });

  it('câmera negada: mensagem clara e "Escolher imagem" em destaque', async () => {
    const { fixture, el } = montar({ camera: 'negada' });
    await estabilizar(fixture);
    expect(texto(el.querySelector('[role="alert"]'))).toContain('Sem permissão para usar a câmera');
    expect(el.querySelector('video')).toBeNull();
    expect(el.querySelector('label.scanner-imagem')!.classList).toContain('cp-btn-primary');
  });

  it('sem câmera: sugere a galeria', async () => {
    const { fixture, el } = montar({ camera: 'ausente' });
    await estabilizar(fixture);
    expect(texto(el.querySelector('[role="alert"]'))).toContain('Escolha uma imagem da galeria');
  });

  it('imagem da galeria com QR emite a URL', async () => {
    const { fixture, el, lidos, detector } = montar({
      camera: 'ausente',
      leituras: [
        [{ rawValue: 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=x', format: 'qr_code' }],
      ],
    });
    await estabilizar(fixture);
    await escolher(el, fixture);
    expect(detector.detect).toHaveBeenCalled();
    expect(lidos).toEqual(['https://www.fazenda.pr.gov.br/nfce/qrcode?p=x']);
  });

  it('imagem sem código avisa', async () => {
    const { fixture, el, lidos } = montar({ camera: 'ausente', leituras: [[]] });
    await estabilizar(fixture);
    await escolher(el, fixture);
    expect(lidos).toEqual([]);
    expect(texto(el.querySelector('[role="alert"]'))).toContain(
      'Não encontramos um código nessa imagem',
    );
  });

  it('lanterna liga pela restrição torch', async () => {
    const { fixture, el, t } = montar();
    await estabilizar(fixture);
    const botao = [...el.querySelectorAll('button')].find((b) => texto(b).endsWith('Lanterna'))!;
    botao.click();
    await estabilizar(fixture);
    expect(t.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    expect(botao.getAttribute('aria-pressed')).toBe('true');
  });

  it('cancelar e destruir param a câmera', async () => {
    const { fixture, el, t, cancelou } = montar();
    await estabilizar(fixture);
    [...el.querySelectorAll('button')].find((b) => texto(b) === 'Cancelar')!.click();
    expect(cancelou()).toBe(true);
    expect(t.stop).toHaveBeenCalled();
    fixture.destroy();
  });
});

describe('criarDetector', () => {
  it('usa o BarcodeDetector nativo quando suporta os formatos', async () => {
    class Nativo {
      static getSupportedFormats = vi.fn(async () => ['qr_code', 'ean_13']);
      constructor(readonly opcoes: { formats: string[] }) {}
      detect = vi.fn();
    }
    const janela = { BarcodeDetector: Nativo, document } as unknown as Window;
    const d = (await criarDetector(['qr_code'], janela)) as unknown as Nativo;
    expect(d).toBeInstanceOf(Nativo);
    expect(d.opcoes).toEqual({ formats: ['qr_code'] });
  });
});
