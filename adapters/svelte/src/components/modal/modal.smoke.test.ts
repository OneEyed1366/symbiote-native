// Proves the one genuinely novel, unverified-by-typecheck behavior in index.svelte: the iOS
// keep-alive state machine (modalReducer / shouldRenderModal, state/modal.ts) actually round-
// trips through a real compiled mount — a visible modal commits ModalHostView(RCTView(RCTView)),
// a real native topRequestClose event flips the controlling parent's own state, and the modal
// genuinely disappears from the committed tree once the reducer settles, rather than getting
// stuck mounted or never appearing at all. Compiles the REAL index.svelte source (not a hand-
// written stand-in) through svelte/compiler, wraps it in a small controlling parent (mirrors
// React's own modal.test.tsx DismissCase: onRequestClose flips its own `visible` $state), and
// asserts against a real fake-Fabric recorder — same harness shape as switch.smoke.test.ts.
//
// Two real gotchas measured while building this file, both worth recording so the next co-
// located smoke test doesn't rediscover them:
//   1. `fabric.find()` walks the fake Fabric's `created` log — every node ever createNode'd this
//      run — NOT the currently-committed tree, so it stays "defined" forever after a node is
//      created even once it is later removed. Checking "the modal is gone" needs a walk of the
//      CURRENTLY COMMITTED tree (`findInCommittedTree` below), not `fabric.find`.
//   2. Node's dynamic `import()` caches by resolved file URL. switch.smoke.test.ts's single
//      compiled-parent path is safe to reuse across its two tests because the COMPILED SOURCE is
//      byte-identical every time (the varying bit — `fixedValue` — travels through `mount()`'s
//      own `props` argument, read fresh at MOUNT time, not baked into the compiled string). This
//      file's two parent variants (Dismissible vs Hidden) instead bake different markup into the
//      compiled STRING itself, so each needs its OWN output filename — reusing one path silently
//      re-imports the stale cached module from an earlier test.
//   3. Also measured: under this adapter's microtask-coalesced requestCommit(), the entire
//      visible->hidden cascade (the render that observes the new `visible` with the OLD
//      `isRendered`, then the effect that flips `isRendered`) settles within the same microtask
//      flush that processes the triggering prop change, before any `await tick()` can observe an
//      in-between frame. The keep-alive frame is real (confirmed by direct effect inspection
//      during development) but isn't independently snapshot-able as its own Fabric commit at
//      this granularity, so this test proves the end-to-end contract (native event -> reducer ->
//      node actually removed) rather than the unobservable intermediate frame.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_003;
// Co-located with the real source (not an isolated temp dir) — same reason as
// switch.smoke.test.ts: a compiled component's own relative imports resolve relative to where
// the compiled FILE lives, and index.svelte sits next to its real sibling `modal-props.ts`.
const MODAL_OUT = join(__dirname, '.smoke-compiled-modal.mjs');
const DISMISSIBLE_PARENT_OUT = join(__dirname, '.smoke-compiled-parent-dismissible.mjs');
const HIDDEN_PARENT_OUT = join(__dirname, '.smoke-compiled-parent-hidden.mjs');

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const settle = async (rounds = 4): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) await tick();
};

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(MODAL_OUT, { force: true });
  rmSync(DISMISSIBLE_PARENT_OUT, { force: true });
  rmSync(HIDDEN_PARENT_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

async function importDefault(path: string, sourceLabel: string): Promise<Component> {
  const mod: unknown = await import(`file://${path}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`${sourceLabel} produced no default export`);
  }
  return mod.default as Component;
}

// Walks the CURRENTLY COMMITTED tree (unlike `fabric.find`, which walks the creation log and
// stays "defined" even after a node is later removed from the committed childSet).
function findInCommittedTree(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  function walk(nodes: IFakeNode[]): IFakeNode | undefined {
    for (const node of nodes) {
      if (predicate(node)) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  return walk(fabric.appRoot().children);
}

function committedModalNode(): IFakeNode {
  const node = findInCommittedTree(n => n.viewName === 'ModalHostView');
  if (!node) throw new Error('no ModalHostView is currently committed');
  return node;
}

function compileModal(): void {
  compileToFile(readFileSync(join(__dirname, 'index.svelte'), 'utf8'), 'Modal.svelte', MODAL_OUT);
}

async function loadDismissible(): Promise<Component> {
  compileModal();
  // Mirrors React's own modal.test.tsx `DismissCase`: a parent that owns `visible` as its OWN
  // reactive state and flips it to false in response to the native topRequestClose event —
  // exactly the transition state/modal.ts's keep-alive reducer exists to survive. Written on one
  // line so the compiler emits no incidental whitespace-only text nodes between the tags.
  compileToFile(
    `<script>import Modal from './.smoke-compiled-modal.mjs';let visible = $state(true);</script><Modal {visible} onRequestClose={() => { visible = false; }}><symbiote-view p={{}} /></Modal>`,
    'DismissibleParent.svelte',
    DISMISSIBLE_PARENT_OUT,
  );
  return importDefault(DISMISSIBLE_PARENT_OUT, 'DismissibleParent.svelte');
}

async function loadHidden(): Promise<Component> {
  compileModal();
  compileToFile(
    `<script>import Modal from './.smoke-compiled-modal.mjs';</script><Modal visible={false}><symbiote-view p={{}} /></Modal>`,
    'HiddenParent.svelte',
    HIDDEN_PARENT_OUT,
  );
  return importDefault(HIDDEN_PARENT_OUT, 'HiddenParent.svelte');
}

describe('Modal (real compiled index.svelte)', () => {
  it('commits a visible modal as ModalHostView(RCTView(RCTView)) with default host props', async () => {
    const Dismissible = await loadDismissible();
    mount(ROOT_TAG, Dismissible);
    await settle();

    // appRoot() is the engine's synthetic box-none AppContainer; its one child is this Svelte
    // adapter's own root symbiote-view (root-element.ts), under which the mounted component's
    // own output lands — hence the extra RCTView wrapper vs React's/Vue's own tests. `toContain`
    // (not exact equality), matching mount-pipeline.smoke.test.ts's own precedent: mount()'s
    // component boundary contributes a couple of empty RCTRawText siblings alongside the real
    // content that aren't this test's concern.
    expect(fabric.serialize(fabric.appRoot().children)).toContain(
      'ModalHostView(RCTView(RCTView))',
    );

    const host = committedModalNode();
    expect(host.props.visible).toBe(true);
    expect(host.props.animationType).toBe('none');
    // RN sets styles.modal (position:'absolute') on RCTModalHostView itself.
    expect(host.props.position).toBe('absolute');
    // Default (opaque, non-transparent) presentationStyle is 'fullScreen'.
    expect(host.props.presentationStyle).toBe('fullScreen');
    // The opaque modal's container backdrop stays the default white.
    expect(host.children[0]?.props.backgroundColor).toBe('white');
  });

  it('round-trips a native topRequestClose through the reducer and drops the node once it settles', async () => {
    const Dismissible = await loadDismissible();
    mount(ROOT_TAG, Dismissible);
    await settle();
    expect(findInCommittedTree(n => n.viewName === 'ModalHostView')).toBeDefined();

    // Drive the native close exactly like React's DismissCase: topRequestClose -> the parent's
    // own $state flips visible=false, which flows back down through the SAME onRequestClose bag
    // entry the passthrough props wired onto the host node.
    fabric.fireEvent(committedModalNode().instanceHandle, 'topRequestClose', {});
    await settle();

    // The keep-alive reducer must have actually transitioned (not gotten stuck): the node is
    // fully gone from the CURRENTLY COMMITTED tree.
    expect(findInCommittedTree(n => n.viewName === 'ModalHostView')).toBeUndefined();
  });

  it('commits no modal node when visible starts false', async () => {
    const Hidden = await loadHidden();
    mount(ROOT_TAG, Hidden);
    await settle();

    expect(findInCommittedTree(n => n.viewName === 'ModalHostView')).toBeUndefined();
  });
});
