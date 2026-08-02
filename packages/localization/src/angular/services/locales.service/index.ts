import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { addLocaleListener, getLocales, type Locale } from '../../../core';

// Angular twin of React's `useLocales` hook and Vue's `useLocales` composable. See
// packages/battery's BatteryStateService for the `connect()` pattern rationale. getLocales() is
// synchronous, so the signal seeds from it directly rather than an async `.then()` fetch.
//
//   readonly locales = inject(LocalesService).connect();
//   // template: {{ locales() }}
@Injectable({ providedIn: 'root' })
export class LocalesService {
  private readonly injector = inject(Injector);

  connect(): Signal<Locale[]> {
    const locales = signal<Locale[]>(getLocales());

    effect(
      onCleanup => {
        const subscription = addLocaleListener(() => locales.set(getLocales()));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return locales.asReadonly();
  }
}
