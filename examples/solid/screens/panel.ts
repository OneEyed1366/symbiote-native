import { createContext, createSignal, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';

// Readers only get an accessor, so a panel can also sit on a memo over the route params
export type IPanel<T> = {
  settings: Accessor<T>;
  update: (patch: Partial<T>) => void;
};

// A panel the screen above a navigator owns, so the screens inside can read and change it
export function createPanelState<T extends object>(defaults: T): IPanel<T> {
  const [settings, setSettings] = createSignal<T>(defaults);
  return {
    settings,
    update: patch => setSettings(() => ({ ...settings(), ...patch })),
  };
}

function ignorePatch(): void {}

export function createPanelContext<T extends object>(defaults: T) {
  const PanelContext = createContext<IPanel<T>>({
    settings: () => defaults,
    update: ignorePatch,
  });
  return {
    PanelContext,
    usePanel: () => useContext(PanelContext),
  };
}
