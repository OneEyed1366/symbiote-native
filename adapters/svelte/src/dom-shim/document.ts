// The shim's `document` singleton — the six factories `init_operations()` and `from_tree`
// require (svelte-adapter-dom-shim skill §3b), plus the two cheap stubs §4 calls for
// explicitly (`document.body`, `getComputedStyle`) so a forbidden/dead path degrades to a
// harmless no-op instead of a hard crash. No `<svelte:head|window|body|document>` support
// beyond that stub — those tags are rejected at build time by the preprocessor (§7), not
// handled here.

import { ShimElement } from './element';
import { ShimText } from './text';
import { ShimComment } from './comment';
import { ShimDocumentFragment } from './document-fragment';
import { registerShimDocumentFactory, type ShimNode } from './shim-node';

export class ShimDocument {
  // The delegation root real Svelte events bubble toward (`dom/elements/events.js:122`).
  // Our own event names never delegate (§5c: no camelCase name matches Svelte's 23-name
  // DELEGATED_EVENTS list), but a minimal, unattached node converts any stray read into a
  // no-op instead of a crash — one line, per §4's "provide a stub anyway" call.
  readonly body: ShimElement = new ShimElement('symbiote-view');

  createElement(tag: string, options?: { is?: string }): ShimElement {
    const element = new ShimElement(tag);
    if (options?.is !== undefined) element.setAttribute('is', options.is);
    return element;
  }

  createElementNS(
    namespace: string,
    tag: string,
    options?: { is?: string },
  ): ShimElement {
    const element = new ShimElement(tag, namespace);
    if (options?.is !== undefined) element.setAttribute('is', options.is);
    return element;
  }

  createTextNode(value: string): ShimText {
    return new ShimText(value);
  }

  createDocumentFragment(): ShimDocumentFragment {
    return new ShimDocumentFragment();
  }

  createComment(data: string): ShimComment {
    return new ShimComment(data);
  }

  // §3b: our PRIMARY clone path, not a fallback — every Symbiote tag is a custom element
  // (hyphenated) and therefore sets TEMPLATE_USE_IMPORT_NODE. Functionally a deep clone
  // (we have one document), so delegating to cloneNode is correct. Overloaded per concrete
  // shim class (rather than a `T extends ShimNode` generic) because `ShimNode.cloneNode`'s
  // abstract return type is the base `ShimNode` — a generic call site can't recover the
  // narrower subtype without a cast, which this project's `as`-cast rule forbids.
  importNode(node: ShimElement, deep: boolean): ShimElement;
  importNode(node: ShimText, deep: boolean): ShimText;
  importNode(node: ShimComment, deep: boolean): ShimComment;
  importNode(node: ShimDocumentFragment, deep: boolean): ShimDocumentFragment;
  importNode(node: ShimNode, deep: boolean): ShimNode {
    return node.cloneNode(deep);
  }

  // §4: not read by any mandatory path; stubbed so a forbidden transition (which we reject
  // at build time anyway, §7) degrades to an inert value rather than a hard crash if it is
  // ever reached some other way.
  getComputedStyle(): Record<string, never> {
    return {};
  }
}

let singleton: ShimDocument | undefined;

export function getShimDocument(): ShimDocument {
  singleton ??= new ShimDocument();
  return singleton;
}

// Exercised only by tests / restoreGlobals bookkeeping — production code always goes through
// getShimDocument() so the singleton survives a mount/unmount cycle within one process.
export function resetShimDocumentForTests(): void {
  singleton = undefined;
}

// Plugs this module into ShimNode's `ownerDocument`/`textContent` (see shim-node.ts's header
// comment for why the dependency runs this direction and not the reverse).
registerShimDocumentFactory(getShimDocument);
