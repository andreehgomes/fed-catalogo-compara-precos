import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideFirebase } from './core/firebase/firebase.providers';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(withFetch()),
    provideFirebase(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'BRL' },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
