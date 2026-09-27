// The shim's `document` singleton - the six factories `init_operations()`/`from_tree` require,
// plus `document.body` (a minimal unattached node) and `getComputedStyle` (computed-style.ts).
// No `<svelte:head|window|body|document>` - rejected at build time by the preprocessor.

import { ShimElement } from './element';
import { ShimText } from './text';
import { ShimComment } from './comment';
import { ShimDocumentFragment } from './document-fragment';
import { registerShimDocumentFactory, type ShimNode } from './shim-node';
import { computedStyleOf, type IComputedStyle } from './computed-style';

export class ShimDocument {
  // The delegation root real Svelte events bubble toward (`dom/elements/events.js:122`).
  // Our own event names never delegate (§5c: no camelCase name matches Svelte's 23-name
  // DELEGATED_EVENTS list), but a minimal, unattached node converts any stray read into a
  // no-op instead of a crash — one line, per §4's "provide a stub anyway" call.
  readonly body: ShimElement = new ShimElement('view');

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

  // Kept in step with the bare global patch-globals.ts installs (computed-style.ts is the one
  // implementation both call).
  getComputedStyle(element: ShimElement): IComputedStyle {
    return computedStyleOf(element);
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
