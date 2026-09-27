import { InjectionToken, inject } from '@angular/core';
import { Functions, getFunctions } from 'firebase/functions';
import { environment } from '../../../environments/environment';
import { FIREBASE_APP } from './firebase-app.token';

export const FUNCTIONS = new InjectionToken<Functions>('FUNCTIONS', {
  providedIn: 'root',
  factory: () => getFunctions(inject(FIREBASE_APP), environment.functionsRegion),
});
