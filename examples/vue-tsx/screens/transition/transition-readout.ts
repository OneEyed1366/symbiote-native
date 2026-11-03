export type ITransitionDirection = 'none' | 'opening' | 'closing';

export type ITransitionSnapshot = {
  transitions: number;
  // Ticks of the last finished transition
  ticks: number;
  direction: ITransitionDirection;
  headerHeight: number | null;
};

type IProgressTick = { progress: number; closing: number };

const EMPTY_SNAPSHOT: ITransitionSnapshot = {
  transitions: 0,
  ticks: 0,
  direction: 'none',
  headerHeight: null,
};

// A tick per frame must not re-render the screen, so only the end of a transition is published
export function createTransitionReadout() {
  let snapshot = EMPTY_SNAPSHOT;
  let pendingTicks = 0;
  const listeners = new Set<() => void>();

  function publish(next: ITransitionSnapshot): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  return {
    recordProgress({ progress, closing }: IProgressTick): void {
      pendingTicks += 1;
      const isClosing = closing === 1;
      const isSettled = isClosing ? progress <= 0 : progress >= 1;
      if (!isSettled) return;
      publish({
        ...snapshot,
        transitions: snapshot.transitions + 1,
        ticks: pendingTicks,
        direction: isClosing ? 'closing' : 'opening',
      });
      pendingTicks = 0;
    },
    recordHeaderHeight(headerHeight: number): void {
      if (headerHeight === snapshot.headerHeight) return;
      publish({ ...snapshot, headerHeight });
    },
    snapshot: (): ITransitionSnapshot => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
