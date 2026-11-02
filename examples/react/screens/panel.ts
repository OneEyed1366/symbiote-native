import { createContext, useContext, useState } from 'react';

export type IPanel<T> = {
  settings: T;
  update: (patch: Partial<T>) => void;
};

// A panel the screen above a navigator owns, so the screens inside can read and change it
export function usePanelState<T extends object>(defaults: T): IPanel<T> {
  const [settings, setSettings] = useState(defaults);
  return {
    settings,
    update: patch => setSettings(previous => ({ ...previous, ...patch })),
  };
}

function ignorePatch(): void {}

export function createPanelContext<T extends object>(defaults: T) {
  const PanelContext = createContext<IPanel<T>>({
    settings: defaults,
    update: ignorePatch,
  });
  return {
    PanelContext,
    usePanel: () => useContext(PanelContext),
  };
}
