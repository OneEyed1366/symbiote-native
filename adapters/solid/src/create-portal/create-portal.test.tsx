// Proves Portal (./index.tsx) against the fake Fabric slot: content authored in one JSX position
// commits under a DIFFERENT node's subtree, keeps updating there, leaves when the Portal unmounts,
// and refuses a target that is not a real host node. The React twin
// (adapters/react/src/create-portal/create-portal.test.tsx) asserts the same four things; every
// assertion below reads the COMMITTED tree, never `fabric.created`, because parentage after a
// clone-on-write only exists there (.claude/rules/test-harness-false-greens.md §2).

import {
  createContext,
  createSignal,
  Show,
  useContext,
  type Component,
} from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import type { SymbioteSurface } from '@symbiote-native/engine';
import { mount, unmount } from '../render';
import { Text, View } from '../components';
import type { IHostInstance } from '../host-instance';
import { Portal, type IPortalTarget } from './index';

// A fresh rootTag per case. The engine keeps a per-rootTag root container and the renderer keeps
// one active surface, so reusing a tag across cases lets one case's leftovers answer the next
// one's assertion — the accumulating-state trap the same rules file warns about.
let nextRootTag = 9_310;

const fabric = installFabric();

// Every mutation goes through renderer.ts's requestCommit, which coalesces on a microtask.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());

let mounted: number | undefined;
afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
});

function mountApp(App: Component): SymbioteSurface {
  nextRootTag += 1;
  mounted = nextRootTag;
  return mount(nextRootTag, App);
}

function walk(
  nodes: readonly IFakeNode[],
  visit: (node: IFakeNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

const byText = (text: string) => (node: IFakeNode) =>
  node.viewName === 'RCTRawText' && node.props.text === text;

const byTestID = (testID: string) => (node: IFakeNode) =>
  node.props.testID === testID;

function contains(root: IFakeNode, target: IFakeNode): boolean {
  if (root === target) return true;
  return root.children.some(child => contains(child, target));
}

describe('Portal', () => {
  // why: the entire point. `ported in` is authored inside <Text testID="source"> and must commit
  // under the overlay host instead — asserted BOTH ways, since "present somewhere" would pass even
  // if the Portal had done nothing at all.
  it('commits content under the target node, not its own JSX position', async () => {
    function App() {
      // A signal, not a bare variable: a Solid `ref` fires while the element is being created, so
      // the overlay node does not exist yet when the Portal above it in source order first runs.
      // <Show> is the idiomatic gate — the Solid analogue of React's callback-ref timing gotcha.
      const [overlay, setOverlay] = createSignal<IHostInstance | undefined>();
      return (
        <View testID="root">
          <View testID="source">
            <Show when={overlay()}>
              {target => (
                <Portal mount={target()}>
                  <Text>ported in</Text>
                </Portal>
              )}
            </Show>
          </View>
          <View testID="overlay-host" ref={setOverlay} />
        </View>
      );
    }

    mountApp(App);
    await tick();

    const ported = findCommitted(byText('ported in'));
    const overlayHost = findCommitted(byTestID('overlay-host'));
    const source = findCommitted(byTestID('source'));
    expect(ported, 'the portaled text committed').toBeDefined();
    expect(overlayHost, 'the overlay host committed').toBeDefined();
    expect(source, 'the source View committed').toBeDefined();
    if (
      ported === undefined ||
      overlayHost === undefined ||
      source === undefined
    ) {
      throw new Error('unreachable');
    }

    expect(
      contains(overlayHost, ported),
      'portal landed under the overlay host',
    ).toBe(true);
    expect(
      contains(source, ported),
      'portal did NOT stay under its own JSX parent',
    ).toBe(false);
  });

  // why: the anchor host is retained-tree bookkeeping only. If the engine ever stopped flattening
  // an anchor's children into its parent, the portaled Text would either vanish or gain a wrapper
  // view — this pins it as a DIRECT Fabric child of the target, which is what makes the surface
  // match React's createPortal rather than solid-js/web's container-div Portal.
  it('makes the content a direct child of the target, with no wrapper view', async () => {
    function App() {
      const [overlay, setOverlay] = createSignal<IHostInstance | undefined>();
      return (
        <View testID="root">
          <Show when={overlay()}>
            {target => (
              <Portal mount={target()}>
                <Text testID="ported">direct</Text>
              </Portal>
            )}
          </Show>
          <View testID="overlay-host" ref={setOverlay} />
        </View>
      );
    }

    mountApp(App);
    await tick();

    const overlayHost = findCommitted(byTestID('overlay-host'));
    expect(overlayHost).toBeDefined();
    if (overlayHost === undefined) throw new Error('unreachable');
    expect(
      overlayHost.children.map(child => child.props.testID),
      'exactly one direct child, the portaled Text itself',
    ).toEqual(['ported']);
  });

  // why: the content is created under the Portal's own owner but lives in someone else's subtree.
  // A reactive update has to keep reaching it there — otherwise the portal is a one-shot move and
  // every dynamic overlay (a toast with a countdown, a live status line) silently freezes.
  //
  // The dynamic part sits at the PORTAL's own children level (a ternary swapping whole elements),
  // deliberately: `<Portal><Text>{label()}</Text></Portal>` would prove nothing about the Portal —
  // Text's own inner insert owns that update, so the assertion passes even if the Portal hands its
  // children to `insert` as a dead snapshot. Measured: that weaker shape survived the break.
  it('keeps updating the content in place after the move', async () => {
    let setLabel: ((value: string) => void) | undefined;

    function App() {
      const [overlay, setOverlay] = createSignal<IHostInstance | undefined>();
      const [label, setLabelSignal] = createSignal('first');
      setLabel = setLabelSignal;
      return (
        <View testID="root">
          <Show when={overlay()}>
            {target => (
              <Portal mount={target()}>
                {label() === 'first' ? <Text>first</Text> : <Text>second</Text>}
              </Portal>
            )}
          </Show>
          <View testID="overlay-host" ref={setOverlay} />
        </View>
      );
    }

    mountApp(App);
    await tick();
    expect(findCommitted(byText('first'))).toBeDefined();

    expect(setLabel).toBeDefined();
    setLabel?.('second');
    await tick();

    expect(
      findCommitted(byText('second')),
      'the update reached the target',
    ).toBeDefined();
    expect(
      findCommitted(byText('first')),
      'the old text is gone',
    ).toBeUndefined();
    const overlayHost = findCommitted(byTestID('overlay-host'));
    const updated = findCommitted(byText('second'));
    if (overlayHost === undefined || updated === undefined)
      throw new Error('unreachable');
    expect(
      contains(overlayHost, updated),
      'the update stayed under the target, it did not snap back',
    ).toBe(true);
  });

  // why: `onCleanup` must detach the anchor host from a target the Portal does not own. Nothing
  // else removes it — the target outlives the Portal, so a leaked anchor would keep the whole
  // portaled subtree painted forever.
  it('removes the content from the target when the Portal unmounts', async () => {
    let setVisible: ((value: boolean) => void) | undefined;

    function App() {
      const [overlay, setOverlay] = createSignal<IHostInstance | undefined>();
      const [visible, setVisibleSignal] = createSignal(true);
      setVisible = setVisibleSignal;
      return (
        <View testID="root">
          <Show when={visible() ? overlay() : undefined}>
            {target => (
              <Portal mount={target()}>
                <Text>transient</Text>
              </Portal>
            )}
          </Show>
          <View testID="overlay-host" ref={setOverlay} />
        </View>
      );
    }

    mountApp(App);
    await tick();
    expect(findCommitted(byText('transient'))).toBeDefined();

    setVisible?.(false);
    await tick();

    expect(
      findCommitted(byText('transient')),
      'gone from the target once the Portal unmounted',
    ).toBeUndefined();
    const overlayHost = findCommitted(byTestID('overlay-host'));
    expect(overlayHost?.children, 'the target is empty again').toEqual([]);
  });

  // why: `mount` is documented as reactive, and React's createPortal gets the same behaviour for
  // free (it is called again on every render with whatever container it is handed). Untested, the
  // memo + render-effect pair here could quietly freeze on the first target and nobody would know
  // until an app moved an overlay host.
  it('moves the content when `mount` points at a different target', async () => {
    let setSecond: ((value: boolean) => void) | undefined;

    function App() {
      const [first, setFirst] = createSignal<IHostInstance | undefined>();
      const [second, setSecondHost] = createSignal<IHostInstance | undefined>();
      const [useSecond, setUseSecondSignal] = createSignal(false);
      setSecond = setUseSecondSignal;
      const target = (): IHostInstance | undefined =>
        useSecond() ? second() : first();
      return (
        <View testID="root">
          <Show when={target()}>
            {mount => (
              <Portal mount={mount()}>
                <Text testID="ported">movable</Text>
              </Portal>
            )}
          </Show>
          <View testID="host-a" ref={setFirst} />
          <View testID="host-b" ref={setSecondHost} />
        </View>
      );
    }

    mountApp(App);
    await tick();
    expect(
      findCommitted(byTestID('host-a'))?.children.map(
        child => child.props.testID,
      ),
      'starts on host A',
    ).toEqual(['ported']);

    setSecond?.(true);
    await tick();

    expect(
      findCommitted(byTestID('host-b'))?.children.map(
        child => child.props.testID,
      ),
      'moved to host B',
    ).toEqual(['ported']);
    expect(
      findCommitted(byTestID('host-a'))?.children,
      'and host A is empty again — moved, not copied',
    ).toEqual([]);
  });

  // why: the surface is the other half of IPortalTarget, and it takes a different branch in both
  // insertNode and removeNode (surface.appendChild vs the engine's node append). Untested, that
  // branch would only fail on a real app that portals to the app root.
  it('accepts the surface itself as a target', async () => {
    const [target, setTarget] = createSignal<IPortalTarget | undefined>();

    function App() {
      return (
        <View testID="source">
          <Show when={target()}>
            {surface => (
              <Portal mount={surface()}>
                <Text>top level</Text>
              </Portal>
            )}
          </Show>
        </View>
      );
    }

    const surface = mountApp(App);
    await tick();
    setTarget(surface);
    await tick();

    const ported = findCommitted(byText('top level'));
    const source = findCommitted(byTestID('source'));
    expect(ported, 'the portaled text committed').toBeDefined();
    expect(source).toBeDefined();
    if (ported === undefined || source === undefined)
      throw new Error('unreachable');
    expect(
      contains(source, ported),
      'it left the source subtree for the surface root',
    ).toBe(false);
  });

  // why: this is the one capability a tunnel cannot reproduce, so it is worth pinning rather than
  // asserting in prose. The portaled content is CREATED in the Portal's own owner — the call site —
  // and only its host nodes move, so context, error boundaries and Suspense all still resolve from
  // where the content was written. The overlay host below sits OUTSIDE the provider on purpose:
  // under a tunnel the same content would resolve against the OUT site instead and read 'default'
  // (see the twin test in ../create-tunnel/create-tunnel.test.tsx).
  it('creates the content in the call site’s reactive scope, so context resolves there', async () => {
    const OriginContext = createContext('default');

    function Consumer() {
      return <Text>{useContext(OriginContext)}</Text>;
    }

    function App() {
      const [overlay, setOverlay] = createSignal<IHostInstance | undefined>();
      return (
        <View testID="root">
          <OriginContext.Provider value="call site">
            <Show when={overlay()}>
              {target => (
                <Portal mount={target()}>
                  <Consumer />
                </Portal>
              )}
            </Show>
          </OriginContext.Provider>
          <View testID="overlay-host" ref={setOverlay} />
        </View>
      );
    }

    mountApp(App);
    await tick();

    expect(
      findCommitted(byText('call site')),
      'context came from where the content was written',
    ).toBeDefined();
    expect(
      findCommitted(byText('default')),
      'not from where it landed',
    ).toBeUndefined();
  });

  // why: the guard exists so a wrong `mount` fails at the call site with an actionable message
  // instead of somewhere inside the engine's appendChild. JSON.parse is how this repo produces an
  // untyped value without an `as` cast (the React twin does the same).
  it('throws an actionable error for a target that is not a host node', () => {
    const plainObject: IPortalTarget = JSON.parse('{}');
    const selectorString: IPortalTarget = JSON.parse('"body"');

    function BadObject() {
      return <Portal mount={plainObject}>{null}</Portal>;
    }
    function BadString() {
      return <Portal mount={selectorString}>{null}</Portal>;
    }

    expect(() => mountApp(BadObject)).toThrow(/already-mounted host node/);
    expect(() => mountApp(BadString)).toThrow(/already-mounted host node/);
  });
});
