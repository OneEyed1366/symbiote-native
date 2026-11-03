export type IEventLine = {
  id: number;
  kind: string;
  text: string;
  // How many ticks of the same kind this line folds together
  count: number;
};

type IAppendOptions = { isTick?: boolean };

// A short log outside React, so it keeps what happened while the screen was away
export function createEventLog(limit: number) {
  if (limit < 1) throw new Error('event log limit must be at least 1');
  let lines: readonly IEventLine[] = [];
  let nextId = 0;
  const listeners = new Set<() => void>();

  function publish(next: readonly IEventLine[]): void {
    lines = next;
    for (const listener of listeners) listener();
  }

  return {
    // Newest line first, a tick of the kind on top updates that line instead of adding one
    append(kind: string, text: string, options: IAppendOptions = {}): void {
      const [top, ...rest] = lines;
      if (options.isTick && top !== undefined && top.kind === kind) {
        publish([{ ...top, text, count: top.count + 1 }, ...rest]);
        return;
      }
      nextId += 1;
      publish([{ id: nextId, kind, text, count: 1 }, ...lines].slice(0, limit));
    },
    clear(): void {
      publish([]);
    },
    snapshot: (): readonly IEventLine[] => lines,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
