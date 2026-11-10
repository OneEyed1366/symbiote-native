// `tree` is drawn in the screen's own view tree, `overlay` in a full window overlay
export type IToastKind = 'tree' | 'overlay';

export type IToast = { id: number; kind: IToastKind };

// The toast outlives the modal that asks for it, so it sits outside any one screen
export function createToastStore() {
  let toast: IToast | null = null;
  let nextId = 0;
  const listeners = new Set<() => void>();

  function publish(next: IToast | null): void {
    toast = next;
    for (const listener of listeners) listener();
  }

  return {
    show(kind: IToastKind): void {
      nextId += 1;
      publish({ id: nextId, kind });
    },
    hide(): void {
      publish(null);
    },
    snapshot: (): IToast | null => toast,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
