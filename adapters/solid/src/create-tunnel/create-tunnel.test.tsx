// Proves createTunnel (./index.tsx) does the thing Portal (../create-portal) deliberately cannot:
// content registered on one surface painting on a GENUINELY different, independently mount()-ed
// one. Mirrors adapters/react/src/create-tunnel/create-tunnel.test.tsx scenario for scenario, plus
// two Solid-specific ones — the ordering of several In instances, and the source surface going
// away without taking the target's commits with it.
//
// Every case builds its OWN tunnel. A module-level tunnel would let one case's leftover
// registration satisfy the next case's assertion (.claude/rules/test-harness-false-greens.md).

import {
  createContext,
  createSignal,
  Show,
  useContext,
  type Component,
} from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Text, View } from '../components';
import type { JSX } from '../jsx-runtime';
import { createTunnel } from './index';

let nextRootTag = 9_410;
const openRootTags: number[] = [];

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => {
  while (openRootTags.length > 0) {
    const rootTag = openRootTags.pop();
    if (rootTag !== undefined) unmount(rootTag);
  }
});

function mountApp(App: Component): number {
  nextRootTag += 1;
  openRootTags.push(nextRootTag);
  mount(nextRootTag, App);
  return nextRootTag;
}

function close(rootTag: number): void {
  unmount(rootTag);
  const index = openRootTags.indexOf(rootTag);
  if (index >= 0) openRootTags.splice(index, 1);
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

function committedTexts(): string[] {
  const texts: string[] = [];
  walk(fabric.committed, node => {
    if (node.viewName === 'RCTRawText') texts.push(String(node.props.text));
  });
  return texts;
}

const byText = (text: string) => (node: IFakeNode) =>
  node.viewName === 'RCTRawText' && node.props.text === text;

const byTestID = (testID: string) => (node: IFakeNode) =>
  node.props.testID === testID;

describe('createTunnel', () => {
  // why: the whole reason this exists beside Portal. The two apps below share no node, no ref and
  // no surface — only the tunnel object — and the content still paints on the surface that renders
  // Out. The registration happens BEFORE the target surface exists, which is the ordering a real
  // overlay surface actually has.
  it('paints content registered on surface A inside surface B', async () => {
    const tunnel = createTunnel();

    function SourceApp() {
      return (
        <View testID="source">
          <tunnel.In>
            <Text>across surfaces</Text>
          </tunnel.In>
        </View>
      );
    }
    function TargetApp() {
      return (
        <View testID="target">
          <tunnel.Out />
        </View>
      );
    }

    mountApp(SourceApp);
    mountApp(TargetApp);
    await tick();

    // fake-fabric's `committed` is last-write-wins across rootTags, and the target mounted second,
    // so this IS the target surface's own tree.
    const target = findCommitted(byTestID('target'));
    const ported = findCommitted(byText('across surfaces'));
    expect(target, 'the target surface committed').toBeDefined();
    expect(ported, 'the tunneled text committed on it').toBeDefined();
    expect(
      findCommitted(byTestID('source')),
      'and the source surface is NOT what we are reading',
    ).toBeUndefined();
  });

  // why: In's onCleanup is the only thing that ever drops an entry. Without it a torn-down source
  // leaves a dead snippet painted on the target forever — and since the target keeps rendering
  // fine, nothing else would report it.
  it('drops the content from the target when the source surface unmounts', async () => {
    const tunnel = createTunnel();

    function SourceApp() {
      return (
        <tunnel.In>
          <Text>still here</Text>
        </tunnel.In>
      );
    }
    function TargetApp() {
      return (
        <View testID="target">
          <tunnel.Out />
        </View>
      );
    }

    const sourceTag = mountApp(SourceApp);
    mountApp(TargetApp);
    await tick();
    expect(findCommitted(byText('still here'))).toBeDefined();

    close(sourceTag);
    await tick();

    expect(
      findCommitted(byText('still here')),
      'gone from the target once the source surface stopped',
    ).toBeUndefined();
  });

  // why: guards render.ts's teardown branch, which the cross-surface case is the first code in the
  // repo to reach. Unmounting the source used to clear the renderer's active surface outright,
  // leaving the still-mounted TARGET permanently uncommitted — every later update silently dropped
  // by renderer.ts's post-unmount guard. The assertion is an update made AFTER the source is gone.
  it('leaves the target surface still committing after the source unmounts', async () => {
    const tunnel = createTunnel();
    let setLabel: ((value: string) => void) | undefined;

    function SourceApp() {
      return (
        <tunnel.In>
          <Text>from source</Text>
        </tunnel.In>
      );
    }
    function TargetApp() {
      const [label, setLabelSignal] = createSignal('before');
      setLabel = setLabelSignal;
      return (
        <View testID="target">
          <Text>{label()}</Text>
          <tunnel.Out />
        </View>
      );
    }

    const sourceTag = mountApp(SourceApp);
    mountApp(TargetApp);
    await tick();
    expect(findCommitted(byText('before'))).toBeDefined();

    close(sourceTag);
    await tick();

    setLabel?.('after');
    await tick();

    expect(
      findCommitted(byText('after')),
      'the target still commits its own updates',
    ).toBeDefined();
  });

  // why: several In instances is the case a single-entry registry passes by accident. Order is
  // part of the contract every other adapter states ("in registration order"), and a Set or an
  // object map would quietly lose it.
  it('renders every registered entry, in registration order', async () => {
    const tunnel = createTunnel();

    function App() {
      return (
        <View testID="root">
          <tunnel.In>
            <Text>first</Text>
          </tunnel.In>
          <tunnel.In>
            <Text>second</Text>
          </tunnel.In>
          <View testID="host">
            <tunnel.Out />
          </View>
        </View>
      );
    }

    mountApp(App);
    await tick();

    expect(committedTexts()).toEqual(['first', 'second']);
  });

  // why: In and Out in ONE tree is the shape that produced a genuine infinite render loop in the
  // React adapter's earlier hook-based version — a silent white screen, since this renderer's
  // commit loop has no "maximum update depth" guard. Solid's model should make it structurally
  // impossible (a component body runs once; a signal write re-runs only readers), and this pins
  // that: In's body runs exactly once across a mount AND a later toggle that re-renders Out.
  it('does not re-enter In when In and Out share a tree', async () => {
    const tunnel = createTunnel();
    let inBodyRuns = 0;
    let setVisible: ((value: boolean) => void) | undefined;

    function CountingIn(props: { children?: JSX.Element }) {
      inBodyRuns += 1;
      return <tunnel.In>{props.children}</tunnel.In>;
    }

    function App() {
      const [visible, setVisibleSignal] = createSignal(true);
      setVisible = setVisibleSignal;
      return (
        <View testID="root">
          <Show when={visible()}>
            <CountingIn>
              <Text>same tree</Text>
            </CountingIn>
          </Show>
          <View testID="host">
            <tunnel.Out />
          </View>
        </View>
      );
    }

    mountApp(App);
    await tick();
    expect(
      findCommitted(byText('same tree')),
      'Out picked it up',
    ).toBeDefined();
    expect(inBodyRuns, 'In ran once, not once per notify').toBe(1);

    setVisible?.(false);
    await tick();
    expect(findCommitted(byText('same tree'))).toBeUndefined();

    setVisible?.(true);
    await tick();
    expect(
      findCommitted(byText('same tree')),
      'and re-registers cleanly',
    ).toBeDefined();
    expect(inBodyRuns, 'a fresh In for the fresh mount, and only one').toBe(2);
  });

  // why: the exact inverse of the Portal's context test, and the reason the two mechanisms are not
  // interchangeable. A tunnel does not move nodes — `In` hands over a THUNK and `Out` evaluates it
  // in its own owner — so the content resolves context, error boundaries and Suspense from the OUT
  // site. Pinning it here keeps that from reading as an accident: it is what buys the tunnel its
  // cross-surface reach (there is nothing to move between two surfaces), and it is what a caller
  // has to know before choosing between the two.
  it('renders the content in the Out site’s reactive scope, not the In site’s', async () => {
    const tunnel = createTunnel();
    const OriginContext = createContext('default');

    function Consumer() {
      return <Text>{useContext(OriginContext)}</Text>;
    }

    function App() {
      return (
        <View testID="root">
          <OriginContext.Provider value="in site">
            <tunnel.In>
              <Consumer />
            </tunnel.In>
          </OriginContext.Provider>
          <OriginContext.Provider value="out site">
            <View testID="host">
              <tunnel.Out />
            </View>
          </OriginContext.Provider>
        </View>
      );
    }

    mountApp(App);
    await tick();

    expect(
      findCommitted(byText('out site')),
      'context came from where the content is rendered',
    ).toBeDefined();
    expect(
      findCommitted(byText('in site')),
      'not from where it was written',
    ).toBeUndefined();
  });

  // why: In must paint NOTHING where it is written — that is what makes it mountable anywhere. If
  // it leaked its children into its own position the content would appear twice the moment an Out
  // existed, which the ordering test above would still pass.
  it('paints nothing at In’s own position when no Out is mounted', async () => {
    const tunnel = createTunnel();

    function App() {
      return (
        <View testID="root">
          <tunnel.In>
            <Text>invisible</Text>
          </tunnel.In>
        </View>
      );
    }

    mountApp(App);
    await tick();

    expect(
      findCommitted(byTestID('root')),
      'the app itself committed',
    ).toBeDefined();
    expect(
      findCommitted(byText('invisible')),
      'nothing painted without an Out',
    ).toBeUndefined();
  });
});
