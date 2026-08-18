// A diagnostic tap on the list's windowing state, for reading on a DEVICE. The whole class of bugs
// this exists for — a spacer that disagrees with where the host actually laid the cells out — is
// invisible to a headless test, because the fake reports back exactly what the model asked for. The
// residual only exists where a real Yoga does the layout.
//
// Off unless something subscribes: `sink` is undefined and every record is one property read, the
// same cost model as dlog. Nothing here is gated behind DEBUG, because the canary's HUD subscribes
// explicitly rather than relying on an env flag surviving a Metro cache.

// One recompute of the window, captured after deriveMetrics has run.
export interface IListDiagnosticFrame {
  scrollOffset: number;
  viewportLength: number;
  // The window actually committed, and the one the geometry asked for before throttling.
  first: number;
  last: number;
  targetFirst: number;
  targetLast: number;
  count: number;
  measuredCount: number;
  averageLength: number;
  averageStride: number;
  // The model's position for the window's first cell, and the raw y the host last reported for it.
  // These two are the whole story: they should be the SAME number, because a measured cell is
  // stored verbatim. A gap between them means the spacer under it no longer describes reality.
  firstOffset: number;
  firstRaw: number | undefined;
  total: number;
  // The two spacers, by the same region formula buildListPlan uses (minus the sticky branch, which
  // needs the adapter's sticky indices). If these move while the cells do not, the spacer is the
  // one rewriting the layout.
  leadingExtent: number;
  trailingExtent: number;
}

// A cell whose measured geometry changed. `moved` is a new y for an index already measured — during
// a steady scroll that should be silent, since the viewport moves and the content does not. `sized`
// is a new LENGTH, and it is the more useful of the two: a run of cells that all `moved` by the same
// amount says something above them changed size, and only the length log names WHICH index it was.
export interface IListDiagnosticMove {
  kind: 'moved' | 'sized';
  index: number;
  from: number;
  to: number;
}

interface IListDiagnosticHandlers {
  onFrame?: (frame: IListDiagnosticFrame) => void;
  onMove?: (move: IListDiagnosticMove) => void;
}

// A SET, not one slot. Two subscribers overlap for real: swapping between two screens that each
// mount a readout disposes the outgoing one AFTER the incoming one mounts, so a single slot would
// leave the survivor unsubscribed and the readout permanently blank.
const subscribers = new Set<IListDiagnosticHandlers>();

export function subscribeListDiagnostics(
  handlers: IListDiagnosticHandlers,
): () => void {
  subscribers.add(handlers);
  return (): void => {
    subscribers.delete(handlers);
  };
}

// The frame is built through a callback so nothing is assembled while nobody is listening — the
// snapshot reads a dozen fields off the state and would otherwise cost that on every recompute.
export function recordListFrame(build: () => IListDiagnosticFrame): void {
  if (subscribers.size === 0) return;
  const frame = build();
  for (const handlers of subscribers) handlers.onFrame?.(frame);
}

export function recordCellMove(
  kind: 'moved' | 'sized',
  index: number,
  from: number,
  to: number,
): void {
  if (subscribers.size === 0) return;
  for (const handlers of subscribers)
    handlers.onMove?.({ kind, index, from, to });
}
