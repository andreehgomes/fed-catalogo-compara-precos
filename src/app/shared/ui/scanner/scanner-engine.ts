import { InjectionToken } from '@angular/core';

export type FormatoScanner = 'qr_code' | 'ean_13' | 'ean_8';

export interface CodigoLido {
  rawValue: string;
  format: string;
}

export interface Detector {
  detect(fonte: ImageBitmapSource): Promise<CodigoLido[]>;
}

interface DetectorNativoCtor {
  new (opcoes: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

export const CAMINHO_WASM = 'assets/zxing/';

export async function criarDetector(
  formatos: readonly FormatoScanner[],
  janela: Window & { BarcodeDetector?: DetectorNativoCtor } = window,
): Promise<Detector> {
  const Nativo = janela.BarcodeDetector;
  if (Nativo) {
    try {
      const suportados = await Nativo.getSupportedFormats();
      if (formatos.every((f) => suportados.includes(f)))
        return new Nativo({ formats: [...formatos] });
    } catch {
      /* BarcodeDetector nativo quebrado: usa o polyfill */
    }
  }
  const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill');
  setZXingModuleOverrides({
    locateFile: (arquivo: string, prefixo: string) =>
      arquivo.endsWith('.wasm')
        ? new URL(CAMINHO_WASM + arquivo, janela.document.baseURI).href
        : prefixo + arquivo,
  });
  return new BarcodeDetector({ formats: [...formatos] });
}

export interface ScannerEngine {
  criarDetector(formatos: readonly FormatoScanner[]): Promise<Detector>;
  abrirCamera(): Promise<MediaStream>;
  bitmapDe(arquivo: Blob): Promise<ImageBitmapSource>;
}

export const SCANNER_ENGINE = new InjectionToken<ScannerEngine>('SCANNER_ENGINE', {
  providedIn: 'root',
  factory: () => ({
    criarDetector: (formatos) => criarDetector(formatos),
    abrirCamera: () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return Promise.reject(new DOMException('Sem câmera', 'NotFoundError'));
      }
      // Sem width/height o celular abre em 640×480, pouco para o QR denso da NFC-e.
      return navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        },
        audio: false,
      });
    },
    bitmapDe: (arquivo) => createImageBitmap(arquivo),
  }),
});
