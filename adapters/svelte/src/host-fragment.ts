// Svelte builds a template into a fragment and then moves its children under the real parent
// The fragment is plain JS: it holds engine nodes that have no parent yet, so no host call is spent

import type { ISymbioteNode } from '@symbiote-native/engine';

export class HostFragment {
  readonly children: ISymbioteNode[] = [];
}
