import { propOf, type ISymbioteNode } from '@symbiote-native/engine';

export type IInnerViewRef = (node: ISymbioteNode | null) => void;

// Колбэк, которому владелец уже отдал узел, чтобы смена или снятие знали, кому слать null
const delivered = new WeakMap<ISymbioteNode, IInnerViewRef>();

function isInnerViewRef(value: unknown): value is IInnerViewRef {
  return typeof value === 'function';
}

// Вызывается после каждого коммита владельца, т.к. колбэк мог смениться между коммитами
export function syncInnerViewRef(owner: ISymbioteNode): void {
  const written = propOf(owner, 'innerViewRef');
  const next = isInnerViewRef(written) ? written : undefined;
  const current = delivered.get(owner);
  if (next === current) return;

  current?.(null);
  if (next === undefined) {
    delivered.delete(owner);
    return;
  }
  delivered.set(owner, next);
  if (owner.childHost !== undefined) next(owner.childHost);
}

export function releaseInnerViewRef(owner: ISymbioteNode): void {
  delivered.get(owner)?.(null);
  delivered.delete(owner);
}
