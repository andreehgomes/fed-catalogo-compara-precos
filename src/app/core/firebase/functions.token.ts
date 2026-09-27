import { InjectionToken, inject } from '@angular/core';
import { Functions, getFunctions } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { ATIVAR_APP_CHECK } from './app-check';
import { FIREBASE_APP } from './firebase-app.token';

export const FUNCTIONS = new InjectionToken<Functions>('FUNCTIONS', {
  providedIn: 'root',
  factory: () => {
    inject(ATIVAR_APP_CHECK)();
    return getFunctions(inject(FIREBASE_APP), environment.functionsRegion);
  },
});
