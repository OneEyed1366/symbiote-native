import { InjectionToken, computed, inject, signal } from '@angular/core';
import type { Provider, Signal } from '@angular/core';

// Readers only get a signal, so a panel can also sit on a computed over the route params
export type IPanel<T> = {
  settings: Signal<T>;
  update: (patch: Partial<T>) => void;
};

// A panel the screen above a navigator owns, so the screens inside can read and change it
export function createPanelState<T extends object>(defaults: T): IPanel<T> {
  const settings = signal<T>(defaults);
  return {
    settings: settings.asReadonly(),
    update: patch => settings.update(current => ({ ...current, ...patch })),
  };
}

function ignorePatch(): void {}

// The screen lists `panelProvider` in its `providers`, screens mounted inside inherit it
export function createPanelContext<T extends object>(defaults: T) {
  const PanelContext = new InjectionToken<IPanel<T>>('panel', {
    factory: () => ({
      settings: computed(() => defaults),
      update: ignorePatch,
    }),
  });
  const panelProvider: Provider = {
    provide: PanelContext,
    useFactory: () => createPanelState(defaults),
  };
  return {
    PanelContext,
    panelProvider,
    injectPanel: () => inject(PanelContext),
  };
}
