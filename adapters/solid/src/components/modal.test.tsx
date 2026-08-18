// Solid twin of adapters/react/src/components/modal/modal.test.tsx and the Svelte smoke suite.
//
// renderModal()'s own value math — the transparent/backdropColor/presentationStyle precedence
// matrix, the position:absolute host style, the collapsable:false container — and the
// modalReducer/shouldRenderModal keep-alive machine are pure and already exhaustively unit-tested
// in core/components/src/__tests__/wave1-core.test.ts. This file stays on the Solid-specific half
// of the <components_split_logic_view_lifecycle> split: does the real Descriptor->JSX->Fabric path
// commit the right SHAPE, does Solid's signal+createEffect lifecycle reproduce the keep-alive
// transition, do the native DirectEvents round-trip, and — the part no other adapter's suite needs
// — does the tree keep its NODE IDENTITY across updates.
//
// That last group is why this file is longer than React's. Solid runs a component body ONCE and has
// no reconciler between what it returns and the host nodes: `insert` REPLACES a subtree rather than
// diffing it. So "a prop changed and the node survived" and "a key vanished and native was told" are
// real, silently-breakable claims here, not tautologies (.claude/rules/solid-descriptor-bridge.md).
//
// No Negative group: the only throwing paths (the descriptor shape guard around the container child)
// are unreachable — renderModal's contract fixes that shape — and a malformed native payload has
// nowhere to land, since all four DirectEvents forward the engine's wrapper untouched.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  registerRules,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Modal } from './modal';
import { Text } from './text';
import { View } from './view';

const ROOT_TAG = 818;
const MODAL_VIEW = 'ModalHostView';
const SHEET_FLEX = 1;
const SHEET_OPACITY = 0.25;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
  registerRules([
    {
      tokens: ['sheet'],
      specificity: [0, 1, 0],
      order: 0,
      style: { flex: SHEET_FLEX, opacity: SHEET_OPACITY },
    },
  ]);
});

afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// The LIVE committed node. `fabric.created` hands back the mount-time snapshot, which clone-on-write
// supersedes, so anything asserted after a second commit has to be read off the committed tree.
function findCommittedModal(): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && node.viewName === MODAL_VIEW) found = node;
  });
  return found;
}

function committedModal(): IFakeNode {
  const node = findCommittedModal();
  if (node === undefined) throw new Error(`no ${MODAL_VIEW} is committed`);
  return node;
}

// The container View renderModal wraps the children in: the single child of the host.
function committedContainer(): IFakeNode {
  const child = committedModal().children[0];
  if (child === undefined)
    throw new Error(`${MODAL_VIEW} has no container child`);
  return child;
}

// The still-live handle events are fired at. The created log is the only place instanceHandle is
// exposed, and the host node keeps its identity across commits, so the first one stays valid.
function modalHandle(): unknown {
  const node = fabric.find(n => n.viewName === MODAL_VIEW);
  if (node === undefined) throw new Error(`no ${MODAL_VIEW} was created`);
  return node.instanceHandle;
}

function modalsCreated(): number {
  return fabric.created.filter(node => node.viewName === MODAL_VIEW).length;
}

describe('Solid Modal on the engine', () => {
  describe('Positive — commit shape through the real Descriptor->JSX->Fabric path', () => {
    // why: proves the STRUCTURE renderModal promises — one childSet, the user's <View/> nested
    // UNDER a single container, no second root or surface — survives a real Solid commit. Emitting
    // the children as a sibling of the container (or of the host) paints them outside the modal
    // window on device while every prop assertion here would still pass.
    it('commits a visible modal as ModalHostView(RCTView(RCTView))', async () => {
      mount(ROOT_TAG, () => (
        <Modal visible>
          <View />
        </Modal>
      ));
      await tick();

      expect(fabric.serialize(fabric.appRoot().children)).toBe(
        'ModalHostView(RCTView(RCTView))',
      );
      expect(committedModal().props.visible).toBe(true);
    });

    // why: shouldRenderModal's boolean is core-tested directly; this proves the <Show> gate actually
    // keeps the node out of a real commit rather than committing an invisible placeholder host.
    it('commits no modal node when visible starts false', async () => {
      mount(ROOT_TAG, () => (
        <Modal visible={false}>
          <View />
        </Modal>
      ));
      await tick();

      expect(findCommittedModal()).toBeUndefined();
      expect(modalsCreated()).toBe(0);
    });

    // why: Solid runs a component body ONCE. `visible` is read through an accessor precisely so a
    // later flip still reaches the gate; one destructure at setup would freeze the modal hidden
    // forever while every mount-time test in this file still passed.
    it('commits the modal only once visible flips true after mount', async () => {
      const [visible, setVisible] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Modal visible={visible()}>
          <View />
        </Modal>
      ));
      await tick();
      expect(findCommittedModal()).toBeUndefined();

      setVisible(true);
      await tick();

      expect(findCommittedModal()).toBeDefined();
      expect(committedModal().props.visible).toBe(true);
    });

    // why: the keep-alive reducer must TRANSITION, not latch. If the hide effect never ran (a
    // render effect placed too early, or an effect that reads state and so never re-runs), the node
    // would stay committed forever after the app closed the modal — and the app would be stuck
    // behind an invisible full-screen window.
    it('drops the committed node once a native requestClose settles the hide transition', async () => {
      const [visible, setVisible] = createSignal(true);
      mount(ROOT_TAG, () => (
        <Modal visible={visible()} onRequestClose={() => setVisible(false)}>
          <View />
        </Modal>
      ));
      await tick();
      expect(findCommittedModal()).toBeDefined();

      fabric.fireEvent(modalHandle(), 'topRequestClose', {});
      await tick();

      expect(findCommittedModal()).toBeUndefined();
    });
  });

  describe('Positive — node identity across updates (the Solid-only hazard)', () => {
    // why: Solid's `insert` REPLACES a subtree instead of diffing it, so a reactive read that
    // crosses into the <Show> children getter rebuilds the whole modal on every prop change — which
    // on device destroys the native window mid-animation and drops the Fabric tag every imperative
    // call keys on. The createNode counter is the line between a re-prop and a re-render, and it is
    // the only headless trace of that failure.
    it('creates no node when a prop changes while the modal stays visible', async () => {
      const [transparent, setTransparent] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Modal visible transparent={transparent()}>
          <View />
        </Modal>
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(committedContainer().props.backgroundColor).toBe('white');

      setTransparent(true);
      await tick();

      expect(
        committedContainer().props.backgroundColor,
        'the prop must still land',
      ).toBe('transparent');
      expect(
        fabric.counts.createNode,
        'the update rebuilt the modal subtree',
      ).toBe(createdAtMount);
    });

    // why: a full hide→show cycle legitimately tears the subtree down and builds it again — ONCE.
    // A gate that rebuilds on the keep-alive frame too (isVisible false, isRendered still true)
    // would create a third host here, and on device that extra node is a native window presented
    // and destroyed inside the exit animation.
    it('creates the modal host exactly once per visible cycle', async () => {
      const [visible, setVisible] = createSignal(true);
      mount(ROOT_TAG, () => (
        <Modal visible={visible()}>
          <View />
        </Modal>
      ));
      await tick();
      expect(modalsCreated()).toBe(1);

      setVisible(false);
      await tick();
      expect(
        modalsCreated(),
        'the hide transition must not build anything',
      ).toBe(1);

      setVisible(true);
      await tick();
      expect(modalsCreated()).toBe(2);
      expect(findCommittedModal()).toBeDefined();
    });

    // why: the children are a live user subtree handed to the compiler's own `insert`. A signal
    // inside them must update its leaf without touching the modal host — if the children accessor
    // were read where the host tag is built, every keystroke inside a modal would recreate the
    // native window.
    it('updates a child leaf without recreating the modal host', async () => {
      const [label, setLabel] = createSignal('first');
      mount(ROOT_TAG, () => (
        <Modal visible>
          <Text>{label()}</Text>
        </Modal>
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;

      setLabel('second');
      await tick();

      let text: unknown;
      walk(fabric.committed, node => {
        if (node.viewName === 'RCTRawText') text = node.props.text;
      });
      expect(text).toBe('second');
      expect(fabric.counts.createNode, 'the child update rebuilt a node').toBe(
        createdAtMount,
      );
    });

    // why: resolveAccessibilityProps has two branches with DIFFERENT key sets, and Solid's `spread`
    // walks only the CURRENT keys with no removal pass — so without withStableKeys the folded
    // accessibilityLabel key simply vanishes from the bag and native keeps announcing a label the
    // app already removed. React and Vue never meet this: their reconciler sends a vanished key
    // down as an explicit null (.claude/rules/solid-descriptor-bridge.md §1).
    it('clears the folded accessibilityLabel when the aria-label signal goes undefined', async () => {
      const [label, setLabel] = createSignal<string | undefined>('a dialog');
      mount(ROOT_TAG, () => (
        <Modal visible aria-label={label()}>
          <View />
        </Modal>
      ));
      await tick();
      expect(committedModal().props.accessibilityLabel).toBe('a dialog');

      setLabel(undefined);
      await tick();

      // `null`, not absent: routeProp treats the widened `undefined` as a delete, and the engine's
      // diffProps sends a removed prop down to Fabric as an explicit null (symbiote-engine-core §8).
      expect(committedModal().props.accessibilityLabel).toBeNull();
    });
  });

  describe('Positive — native DirectEvents round-trip to the right callback', () => {
    // why: the four callbacks ride raw through `passthrough` as real Fabric DirectEvents, not
    // through any core-tested logic — this is the only place their wiring is proven at all. Naming
    // one of them in HANDLED_PROPS would strip it silently.
    it('routes topShow to onShow', async () => {
      let shown = false;
      mount(ROOT_TAG, () => (
        <Modal
          visible
          onShow={() => {
            shown = true;
          }}
        >
          <View />
        </Modal>
      ));
      await tick();

      fabric.fireEvent(modalHandle(), 'topShow', {});
      expect(shown).toBe(true);
    });

    // why: onOrientationChange is the only one of the four carrying a payload, so it is the only one
    // whose declared signature can disagree with what the engine delivers — setEventListener
    // registers every `onX` as `(event) => handler(event)`, so the orientation arrives on
    // nativeEvent. A signature promising a bare { orientation } leaves every caller reading
    // undefined.
    it('routes topOrientationChange to onOrientationChange with the orientation on nativeEvent', async () => {
      let received: ISymbioteEvent | undefined;
      mount(ROOT_TAG, () => (
        <Modal
          visible
          onOrientationChange={event => {
            received = event;
          }}
        >
          <View />
        </Modal>
      ));
      await tick();

      fabric.fireEvent(modalHandle(), 'topOrientationChange', {
        orientation: 'landscape',
      });

      expect(received?.type).toBe('orientationChange');
      expect(received?.nativeEvent.orientation).toBe('landscape');
    });

    // why: onDismiss must fire on the native exit-animation completion (topDismiss) and MUST NOT
    // fire merely because the app requested the close — conflating the two runs an app's "modal
    // closed" side effect a frame early, before the native view has finished dismissing.
    it('fires onDismiss only on the native topDismiss, not on the hide transition', async () => {
      let dismissCount = 0;
      const [visible, setVisible] = createSignal(true);
      mount(ROOT_TAG, () => (
        <Modal
          visible={visible()}
          onRequestClose={() => setVisible(false)}
          onDismiss={() => {
            dismissCount += 1;
          }}
        >
          <View />
        </Modal>
      ));
      await tick();
      const handle = modalHandle();
      expect(dismissCount).toBe(0);

      fabric.fireEvent(handle, 'topRequestClose', {});
      await tick();
      expect(
        dismissCount,
        'the hide transition must not synthesize a dismiss',
      ).toBe(0);

      // The node is unmounted by now, but the native event still reaches the listener the host node
      // carried — which is what makes "onDismiss is native-only" observable at all.
      fabric.fireEvent(handle, 'topDismiss', {});
      expect(dismissCount).toBe(1);
    });
  });

  describe('Positive — the Solid prop bridge core never exercises', () => {
    // why: these five are destructured and re-forwarded BY NAME through renderModal's typed fields;
    // a typo or a dropped entry in HANDLED_PROPS drops the prop into `passthrough` (where it still
    // reaches the host, hiding the bug) or off the node entirely. Reading them off the real
    // committed node is the only check.
    it('forwards the platform props as named host props', async () => {
      mount(ROOT_TAG, () => (
        <Modal
          visible
          supportedOrientations={['portrait', 'landscape']}
          hardwareAccelerated
          statusBarTranslucent
          navigationBarTranslucent
          allowSwipeDismissal
          animationType="slide"
          onRequestClose={() => {}}
        >
          <View />
        </Modal>
      ));
      await tick();

      const props = committedModal().props;
      expect(props.supportedOrientations).toEqual(['portrait', 'landscape']);
      expect(props.hardwareAccelerated).toBe(true);
      expect(props.statusBarTranslucent).toBe(true);
      expect(props.navigationBarTranslucent).toBe(true);
      expect(props.allowSwipeDismissal).toBe(true);
      expect(props.animationType).toBe('slide');
    });

    // why: Modal owns its host element rather than rendering through a View, so folding the web
    // aria aliases into the canonical accessibility* props is its OWN job — skipping it leaves
    // `aria-label` riding to Fabric as a meaningless prop and the dialog unlabelled.
    it('passes testID and folds aria aliases through to the host node', async () => {
      mount(ROOT_TAG, () => (
        <Modal visible testID="my-modal" accessible aria-label="a dialog">
          <View />
        </Modal>
      ));
      await tick();

      const props = committedModal().props;
      expect(props.testID).toBe('my-modal');
      expect(props.accessible).toBe(true);
      expect(props.accessibilityLabel).toBe('a dialog');
    });

    // why: the transparent override is composed LAST by renderModal so it beats a user `style`; this
    // proves it still wins after the engine's real style flattening on a real node, and that the
    // style targets the CONTAINER rather than the host (which carries only position:absolute).
    it('lets the transparent override beat a user style on the committed container', async () => {
      mount(ROOT_TAG, () => (
        <Modal visible transparent style={{ backgroundColor: 'red' }}>
          <View />
        </Modal>
      ));
      await tick();

      expect(committedContainer().props.backgroundColor).toBe('transparent');
      expect(committedModal().props.presentationStyle).toBe('overFullScreen');
      expect(committedModal().props.position).toBe('absolute');
    });

    // why: `class` is Solid's spelling of React's className and, like `style`, targets the CONTAINER
    // — left in the passthrough bag it would land on the outer host, whose own style renderModal
    // fixes, and the app's modal sheet would simply lose its layout with nothing thrown.
    it('resolves class onto the container, not onto the host', async () => {
      mount(ROOT_TAG, () => (
        <Modal visible class="sheet">
          <View />
        </Modal>
      ));
      await tick();

      expect(committedContainer().props.opacity).toBe(SHEET_OPACITY);
      expect(committedModal().props.opacity).toBeUndefined();
    });
  });
});
