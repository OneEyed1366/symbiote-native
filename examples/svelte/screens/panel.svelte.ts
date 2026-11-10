import { getContext, hasContext, setContext } from 'svelte';

// Readers only get a getter, so a panel can also sit on a `$derived` over the route params
export type IPanel<T> = {
  readonly settings: T;
  update: (patch: Partial<T>) => void;
};

// A panel the screen above a navigator owns, so the screens inside can read and change it
export function createPanelState<T extends object>(defaults: T): IPanel<T> {
  let settings = $state.raw<T>(defaults);
  return {
    get settings() {
      return settings;
    },
    update(patch) {
      settings = { ...settings, ...patch };
    },
  };
}

function ignorePatch(): void {}

export function createPanelContext<T extends object>(defaults: T) {
  const key = Symbol('panel');
  const fallback: IPanel<T> = { settings: defaults, update: ignorePatch };
  return {
    providePanel: (panel: IPanel<T>) => setContext(key, panel),
    usePanel: (): IPanel<T> =>
      hasContext(key) ? getContext<IPanel<T>>(key) : fallback,
  };
}
