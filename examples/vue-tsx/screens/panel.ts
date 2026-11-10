import { inject, provide, shallowRef } from 'vue';
import type { InjectionKey, Ref, ShallowRef } from 'vue';

// Readers only see a read-only ref, so a panel can also sit on a computed over the route params
export type IPanel<T> = {
  settings: Readonly<Ref<T>>;
  update: (patch: Partial<T>) => void;
};

type IStatePanel<T> = IPanel<T> & { settings: ShallowRef<T> };

// A panel the screen above a navigator owns, so the screens inside can read and change it
export function usePanelState<T extends object>(defaults: T): IPanel<T> {
  const panel: IStatePanel<T> = {
    settings: shallowRef<T>(defaults),
    update: patch => {
      panel.settings.value = { ...panel.settings.value, ...patch };
    },
  };
  return panel;
}

function ignorePatch(): void {}

export function createPanelContext<T extends object>(defaults: T) {
  const key: InjectionKey<IPanel<T>> = Symbol('panel');
  const fallback: IPanel<T> = {
    settings: shallowRef<T>(defaults),
    update: ignorePatch,
  };
  return {
    PanelContext: { provide: (panel: IPanel<T>) => provide(key, panel) },
    usePanel: () => inject(key, fallback),
  };
}
