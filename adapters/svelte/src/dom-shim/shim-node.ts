// The retained shim tree Svelte's compiled output believes is the DOM. Every shim node
// (Element / Text / Comment / DocumentFragment) extends this. See the svelte-adapter-dom-shim
// skill (§2, §3, §9) for the measured Svelte-internal contract this satisfies.
//
// The engine binding is LAZY (§9): `from_tree` builds each template graph once and
// `cloneNode(true)`s it per instance, so a template's prototype nodes are never inserted
// into a live tree. Creating an ISymbioteNode for those would allocate engine nodes that
// never render. A shim node gets its ISymbioteNode only when it (or an ancestor) is
// actually inserted under the live root — `makeLive` does that, once, recursively.
//
// Fields below are plain public members, not TS `private`/`protected`: this whole
// `dom-shim/` directory is internal implementation, never reachable from the adapter's
// public barrel (see index.ts) or from app code, so per-field access control buys nothing
// here and would only get in the way of the module-level helpers (`detachFromParent`,
// `normalizeInsertable`) and the root's eager bind (root-element.ts) that all need to reach
// across sibling shim-node instances.

import {
  appendChild as engineAppendChild,
  insertBefore as engineInsertBefore,
  removeChild as engineRemoveChild,
  type ISymbioteNode,
  type SymbioteSurface,
} from '@symbiote-native/engine';

// `document.ts` and `document-fragment.ts` both depend on THIS module (they extend/construct
// ShimNode), so this module must depend on neither — a direct import in either direction
// would have a subclass's `extends ShimNode` clause evaluate before ShimNode's own class
// declaration finishes running, which is undefined at that point. `document.ts` plugs itself
// in with `registerShimDocumentFactory` once its own module body finishes loading (i.e. after
// this module — the base of the cycle — is already fully evaluated).
type IDocumentLike = { createTextNode(value: string): ShimNode };
let documentFactory: (() => IDocumentLike) | undefined;
export function registerShimDocumentFactory(factory: () => IDocumentLike): void {
  documentFactory = factory;
}
function shimDocument(): IDocumentLike {
  if (documentFactory === undefined) {
    throw new Error('svelte dom-shim: document accessed before its module finished loading');
  }
  return documentFactory();
}

export abstract class ShimNode {
  parent: ShimNode | null = null;
  children: ShimNode[] = [];
  engineNode: ISymbioteNode | undefined = undefined;
  surface: SymbioteSurface | undefined = undefined;
  // Overridden to `true` by ShimDocumentFragment's field initializer — a plain inherited-field
  // check, not an `instanceof`, so this module never has to import that subclass (§ above).
  readonly isDocumentFragment: boolean = false;

  // Subclasses pick which engine constructor to call (createElement / createRawText /
  // createAnchor) and replay whatever state accumulated before the node went live
  // (attributes → the prop bag, text content, listeners).
  abstract createEngineNode(): ISymbioteNode;
  onMadeLive(): void {}
  // §3d/§8: `document.importNode` is our PRIMARY clone path (every symbiote-* tag sets
  // TEMPLATE_USE_IMPORT_NODE), delegating here; a clone must copy structure/attributes but
  // never engine binding or listeners, or instance state leaks between component instances.
  abstract cloneNode(deep?: boolean): ShimNode;

  get parentNode(): ShimNode | null {
    return this.parent;
  }

  get lastChild(): ShimNode | null {
    return this.children[this.children.length - 1] ?? null;
  }

  get nodeName(): string {
    return '';
  }

  // We never emit `<template>` — always undefined, per §3c.
  get content(): undefined {
    return undefined;
  }

  get ownerDocument(): IDocumentLike {
    return shimDocument();
  }

  // Called once, when this node (or an ancestor) is first inserted under the live root.
  // Idempotent: a node already live just hands back its existing engine node.
  makeLive(surface: SymbioteSurface): ISymbioteNode {
    const existing = this.engineNode;
    if (existing !== undefined) return existing;
    this.surface = surface;
    const engineNode = this.createEngineNode();
    this.engineNode = engineNode;
    this.onMadeLive();
    for (const child of this.children) {
      engineAppendChild(engineNode, child.makeLive(surface));
    }
    return engineNode;
  }

  append(...nodes: ShimNode[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild<T extends ShimNode>(node: T): T {
    for (const single of normalizeInsertable(node)) this.insertOne(single, null);
    return node;
  }

  insertBefore<T extends ShimNode>(node: T, ref: ShimNode | null): T {
    for (const single of normalizeInsertable(node)) this.insertOne(single, ref);
    return node;
  }

  // Spec-compliant no-op when parentless (DOM's ChildNode.before() steps: "let parent be
  // this's parent; if parent is null, then return" — NOT a throw). This is load-bearing, not
  // pedantry: Svelte's own BranchManager (dom/blocks/branches.js, the machinery behind
  // `{#each}`/`{#if}`/`{@render}` deferred/batched updates) races an offscreen fragment's
  // placeholder anchor against the very effect that renders into it — the anchor can already
  // be detached (via `offscreen.fragment.lastChild.remove()` during a batch commit) by the
  // time that effect's own `anchor.before(realContent)` call fires. In a real DOM this is
  // harmless (the spec no-op just drops the stale insertion); a throw here crashed any
  // component populating a reactive list via a POST-MOUNT effect (proven via a minimal
  // {#each}-over-a-SvelteMap-populated-in-$effect repro — see svelte-adapter-dom-shim skill).
  before(node: ShimNode): void {
    if (this.parent === null) return;
    this.parent.insertBefore(node, this);
  }

  // A REAL DOM method (`Node.prototype.remove()`, not our own `removeChild`), called by
  // Svelte's own effect-teardown and anchor-management paths (svelte's `effects.js`,
  // `operations.js`) directly on the node being torn down, not on its parent. Missing this
  // surfaced only at actual runtime (mount-pipeline.smoke.test.ts) — `tsc --build` has no way
  // to catch a missing DOM method a compiled Svelte bundle calls.
  remove(): void {
    this.parent?.removeChild(this);
  }

  removeChild<T extends ShimNode>(child: T): T {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parent = null;
    if (this.engineNode !== undefined && child.engineNode !== undefined) {
      engineRemoveChild(this.engineNode, child.engineNode);
      this.surface?.requestCommit();
    }
    return child;
  }

  set textContent(value: string) {
    for (const child of this.children.slice()) this.removeChild(child);
    if (value !== '') {
      this.appendChild(shimDocument().createTextNode(value));
    }
  }

  private insertOne(node: ShimNode, ref: ShimNode | null): void {
    detachFromParent(node);
    node.parent = this;
    if (ref === null) {
      this.children.push(node);
    } else {
      const index = this.children.indexOf(ref);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
    }
    if (this.engineNode !== undefined && this.surface !== undefined) {
      const engineNode = node.makeLive(this.surface);
      const refEngineNode = ref?.engineNode;
      if (ref !== null && refEngineNode !== undefined) {
        engineInsertBefore(this.engineNode, engineNode, refEngineNode);
      } else {
        engineAppendChild(this.engineNode, engineNode);
      }
      this.surface.requestCommit();
    }
  }
}

// `Node.prototype.firstChild` / `nextSibling` MUST be real prototype getters, not
// instance own-properties — `init_operations()` extracts their descriptors once and calls
// `getter.call(node)` for every node afterward (svelte-adapter-dom-shim skill §3a/§3c).
Object.defineProperty(ShimNode.prototype, 'firstChild', {
  configurable: true,
  get(this: ShimNode): ShimNode | null {
    return this.children[0] ?? null;
  },
});
Object.defineProperty(ShimNode.prototype, 'nextSibling', {
  configurable: true,
  get(this: ShimNode): ShimNode | null {
    if (this.parent === null) return null;
    const siblings = this.parent.children;
    const index = siblings.indexOf(this);
    return index < 0 ? null : (siblings[index + 1] ?? null);
  },
});

// Unlinking a node from its parent must unlink the ENGINE node too, or the shim tree and the
// native tree disagree: the shim thinks the node is gone while Fabric keeps painting it.
//
// The case that makes this load-bearing is a LIVE node moved into an OFFSCREEN
// `DocumentFragment`. In real DOM, `fragment.append(liveNode)` takes the node out of the
// document; here the fragment has no engine node of its own, so `insertOne`'s engine half is
// skipped entirely and this is the only chance to detach. Svelte does exactly that move in
// three places (§17): `dom/blocks/branches.js` (an onscreen branch parked for a later batch),
// `dom/blocks/each.js` (`destroy_effects` preserving an item a pending batch still needs), and
// `dom/blocks/boundary.js`'s `#render` (`move_effect` while a `pending` snippet shows). Without
// this the parked subtree stays committed underneath whatever replaced it — silent, since
// nothing throws and a smoke that only checks "is my new content there" still passes.
//
// A live->live move (a keyed `{#each}` reorder) reaches this too and is unaffected in outcome:
// the engine's own `appendChild`/`insertBefore` already detach first, so removing here just
// makes the same unlink explicit and earlier.
function detachFromParent(node: ShimNode): void {
  const parent = node.parent;
  if (parent === null) return;
  const index = parent.children.indexOf(node);
  if (index >= 0) parent.children.splice(index, 1);
  node.parent = null;
  const parentEngineNode = parent.engineNode;
  const engineNode = node.engineNode;
  if (parentEngineNode === undefined || engineNode === undefined) return;
  engineRemoveChild(parentEngineNode, engineNode);
  parent.surface?.requestCommit();
}

// A DOM fragment inserts its CHILDREN, not itself, and ends up empty — the rule every
// mandatory block path (`{#each}`/`{#if}`/`<svelte:boundary>`, §3e) depends on.
function normalizeInsertable(node: ShimNode): ShimNode[] {
  if (node.isDocumentFragment) {
    const children = node.children.slice();
    for (const child of children) detachFromParent(child);
    node.children.length = 0;
    return children;
  }
  return [node];
}
