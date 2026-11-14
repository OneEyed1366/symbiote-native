// What the page knows about a field that its DOM does not keep: how many changes the app has been
// told of, and whether an input method is mid-composition

const counts = new WeakMap<object, number>();
const composing = new WeakSet<Element>();

// The count the app echoes back with a controlled write, so a stale write can be told from a fresh
export function eventCountOf(handle: object): number {
  return counts.get(handle) ?? 0;
}

export function bumpEventCount(handle: object): number {
  const next = eventCountOf(handle) + 1;
  counts.set(handle, next);
  return next;
}

export function setComposing(element: Element, active: boolean): void {
  if (active) composing.add(element);
  else composing.delete(element);
}

export function isComposing(element: Element): boolean {
  return composing.has(element);
}
