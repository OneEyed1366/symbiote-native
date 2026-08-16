// A text node. Svelte's own rule (not ours to relax): raw text is only valid inside an
// `RCTText`; content outside one throws at commit time (same restriction the Vue adapter
// enforces in insert()). See svelte-adapter-dom-shim skill §3b (createTextNode).
//
// An EMPTY text node is not text at all — it is one of Svelte's positional ANCHORS, and it must
// map to an engine anchor, never to a raw text. Svelte's runtime builds every block/component
// boundary anchor with `create_text()` i.e. `document.createTextNode('')`, while template text
// always carries at least one character (a dynamic interpolation compiles to `' '` in the
// from_tree template, then `set_text` overwrites it — verified against the compiled output of
// `{#each}` + `{...}`), so "empty means anchor" is a sound discriminator, not a heuristic.
// This mirrors what the Vue adapter's renderer has always done in `createText`
// (`text === '' ? createAnchor() : createRawText(text)`) — the shim was simply missing it.
//
// It matters for three reasons, in ascending order: an anchor-as-raw-text is a REAL extra
// Fabric shadow node per block/component instance; an empty RCTRawText actually PAINTS in
// Fabric (the reason Vue's renderer maps it to an anchor rather than an empty text); and a raw
// text child of a non-Text parent is the invalid "text outside <Text>" shape. Found by
// native-node-parity.test.ts, which diffs committed native trees against the Vue adapter.

import {
  appendChild as engineAppendChild,
  createAnchor,
  createRawText,
  insertBefore as engineInsertBefore,
  isAnchor,
  removeChild as engineRemoveChild,
  setText,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { ShimNode } from './shim-node';

export class ShimText extends ShimNode {
  private value: string;

  constructor(value: string) {
    super();
    this.value = value;
  }

  override get nodeName(): string {
    return '#text';
  }

  get data(): string {
    return this.value;
  }

  set data(next: string) {
    this.value = next;
    const node = this.engineNode;
    if (node === undefined) return; // not live yet — createEngineNode() reads `value` when it is
    if (!isAnchor(node)) {
      // Deliberately NOT demoted back to an anchor when `next` is '': a node that once carried
      // content and is now empty is genuine empty text content, which is what React renders
      // there too. Demoting would also churn the engine tree on every edit that empties a
      // binding. Only the promotion direction is special-cased.
      setText(node, next);
      this.surface?.requestCommit();
      return;
    }
    if (next === '') return; // an anchor that stays empty stays an anchor
    this.promoteAnchorToRawText(node, next);
  }

  // A node that mounted empty (so became an anchor) has just been given real content. The engine
  // has no anchor->text conversion — an anchor is a distinct component — so swap the node in
  // place, keeping sibling order: remove the anchor, insert a raw text at the same position.
  private promoteAnchorToRawText(anchor: ISymbioteNode, value: string): void {
    const rawText = createRawText(value);
    const parent = this.parent;
    const parentEngineNode = parent?.engineNode;
    if (parent === null || parentEngineNode === undefined) {
      // Live node under a parent that is not itself live — nothing is committed from here yet,
      // so swapping the binding is enough; insertion places it when the parent goes live.
      this.engineNode = rawText;
      return;
    }

    // Anchor before the FIRST live following sibling, mirroring ShimNode.insertOne's own rule:
    // a not-yet-live sibling contributes no engine node to order against.
    const index = parent.children.indexOf(this);
    let reference: ISymbioteNode | undefined;
    for (let i = index + 1; i < parent.children.length; i += 1) {
      const candidate = parent.children[i]?.engineNode;
      if (candidate !== undefined) {
        reference = candidate;
        break;
      }
    }

    engineRemoveChild(parentEngineNode, anchor);
    if (reference !== undefined) engineInsertBefore(parentEngineNode, rawText, reference);
    else engineAppendChild(parentEngineNode, rawText);
    this.engineNode = rawText;
    this.surface?.requestCommit();
  }

  // Svelte reads/writes both names for a text node depending on the code path.
  get nodeValue(): string {
    return this.value;
  }

  set nodeValue(next: string) {
    this.data = next;
  }

  cloneNode(deep?: boolean): ShimText {
    void deep; // DOM signature parity only — a text node has no children to deep-clone
    return new ShimText(this.value);
  }

  createEngineNode(): ISymbioteNode {
    return this.value === '' ? createAnchor() : createRawText(this.value);
  }
}
