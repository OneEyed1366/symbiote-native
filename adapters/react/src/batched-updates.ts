// RN's `unstable_batchedUpdates`, over this adapter's own reconciler instead of RN's renderer

import reconciler from './host-config';

export function unstable_batchedUpdates<A, R>(callback: (a: A) => R, a: A): R;
export function unstable_batchedUpdates<R>(callback: () => R): R;
export function unstable_batchedUpdates(
  callback: (a?: unknown) => unknown,
  a?: unknown,
): unknown {
  return reconciler.batchedUpdates(callback, a);
}
