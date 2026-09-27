import { DOCUMENT, InjectionToken, inject } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { environment } from '../../../environments/environment';
import { FIREBASE_APP } from './firebase-app.token';

const ativados = new WeakSet<FirebaseApp>();

/**
 * App Check com reCAPTCHA Enterprise (RNF-25). No `localhost` (que bate no projeto dv)
 * usa o debug token: ele aparece no console do navegador e o usuário o registra no dv em
 * App Check → Apps → Gerenciar tokens de depuração.
 */
export function ativarAppCheck(app: FirebaseApp, siteKey: string, janela: Window | null): void {
  if (ativados.has(app)) return;
  if (janela?.location.hostname === 'localhost') {
    (janela as Window & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  ativados.add(app);
}

/** Chamado pela factory de `FUNCTIONS`: o App Check só carrega quando alguma callable é usada. */
export const ATIVAR_APP_CHECK = new InjectionToken<() => void>('ATIVAR_APP_CHECK', {
  providedIn: 'root',
  factory: () => {
    const app = inject(FIREBASE_APP);
    const janela = inject(DOCUMENT).defaultView;
    return () => ativarAppCheck(app, environment.appCheckSiteKey, janela);
  },
});
