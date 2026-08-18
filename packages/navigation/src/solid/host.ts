// Building a RAW Fabric host element (RNSScreenStack, RNSScreen, RNSScreenContentWrapper) from
// Solid, without JSX.
//
// The whole `src/solid/**` tree is plain `.ts`, matching what every other adapter's navigation
// entry does (React calls createElement, Vue calls h, Svelte writes .svelte, Angular writes
// templates) - and here it is also what keeps ONE tsconfig per package honest: this package's `jsx`
// setting belongs to its React entry, and a `.tsx` file compiled under it would be type-checked
// against React's JSX namespace, not Solid's (.claude/rules/solid-jsx-namespace.md).
//
// It routes through descriptorToSolid rather than calling createElement/spread directly ON PURPOSE:
// that bridge already wraps the prop accessor in `withStableKeys`, which is the fix for Solid's
// `spread` having no removal pass - a key that VANISHES between runs would otherwise keep its last
// value on the native view forever (.claude/rules/solid-descriptor-bridge.md §1). A screen's
// resolved prop bag genuinely changes key set between options folds, so this is live, not
// theoretical. Re-implementing the widening here would be a second copy of a helper the adapter
// keeps private for exactly that reason.
//
// `children: []` because every caller mounts real Solid children with `insert` afterwards, not
// Descriptor children. The empty list keeps the shape guard's child count stable across recomputes.

import { descriptorToSolid } from '@symbiote-native/solid';
import type { ISymbioteNode } from '@symbiote-native/engine';

export function hostElement(
  type: string,
  props: () => Record<string, unknown>,
): ISymbioteNode {
  return descriptorToSolid(() => ({ type, props: props(), children: [] }));
}
