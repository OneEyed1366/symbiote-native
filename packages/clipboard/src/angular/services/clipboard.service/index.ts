import { effect, inject, Injectable, Injector, signal, type Signal } from '@angular/core';
import { addClipboardListener, type IClipboardEvent } from '../../../core';

// Angular twin of React's `useClipboard` hook and Vue's `useClipboard` composable. Angular has
// no per-instance hook — state and lifecycle live in DI instead, so `connect()` stands in for
// the hook's role: call it ONCE (typically from a component's field initializer, inside an
// injection context).
//
//   readonly clipboardEvent = inject(ClipboardService).connect();
//   // template: {{ clipboardEvent()?.contentTypes }}
//
// Mirrors AccelerometerService.connect() from @symbiote-native/sensors: the subscription doesn't
// depend on anything the caller's own signals could change between renders, so a single
// effect() that subscribes once and cleans up once is enough.
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  // Captured in the constructor (itself always run inside an injection context by Angular's own
  // DI) so `connect()` can create an `effect()` even when called from plain field-initializer
  // code that is not, on its own, an active injection context — mirrors AccelerometerService.
  private readonly injector = inject(Injector);

  connect(): Signal<IClipboardEvent | null> {
    const event = signal<IClipboardEvent | null>(null);

    effect(
      onCleanup => {
        const subscription = addClipboardListener(next => event.set(next));
        onCleanup(() => subscription.remove());
      },
      { injector: this.injector },
    );

    return event.asReadonly();
  }
}
