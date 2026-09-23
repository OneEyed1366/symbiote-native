// Co-located Vue-driven pipeline test, the Vue twin of
// adapters/react/src/components/modal/modal.test.tsx. Proves the SAME shared contract
// (renderModal/modalReducer/shouldRenderModal from @symbiote-native/components) through Vue's own
// lifecycle: a visible modal commits ModalHostView(RCTView(RCTView)) with children nested under
// the container (one childSet, not a second root); a hidden modal commits no modal node; the
// direct events round-trip back to Vue emits; and the RN-faithful style precedence (transparent
// override, backdropColor, presentationStyle default) matches React's twin exactly, since both
// adapters render through the same `renderModal` call.
//
// Unit under test: adapters/vue/src/components/modal/index.ts's lifecycle wiring — the
// visible-attr -> renderModal() -> Descriptor->VNode bridge, the emit wiring
// (onShow/onDismiss/onRequestClose), and the POST-flush watch driving the keep-alive `state` ref
// through the shared `modalReducer`/`shouldRenderModal`. renderModal's own style math
// (transparent override, backdropColor, presentationStyle default) is shared
// @symbiote-native/components logic — asserted here only as an END-TO-END proof that Vue's attrs
// reach it correctly, not re-deriving the style rules themselves (those are covered at the
// React/shared level).
//
// No Negative group: Modal's public props have no throwing path — every runtime guard
// (asBoolean/asString/asAnimationType/…) degrades an unrecognized value to `undefined`, it never
// rejects.
//
// A RECORDING host. Locating a node uses `fabric.find` over the CREATION log, on purpose: the
// last case below fires an event on a modal that may already have left the LIVE tree by the time
// the native `topDismiss` arrives (the keep-alive is one render wide), and `fireEvent` targets an
// `instanceHandle` regardless of current residency — the same thing a real device event would do.
// Payload/child reads go through the engine's own `payloadOf`/`childrenOf` directly off that same
// handle, which stays current (the engine mutates the node in place, it does not clone it), so no
// live-tree walk is needed for those either. `createLiveTree` is used only where the CLAIM is
// genuinely about current tree shape — the root's child count and the serialized shape.
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Modal,
  mount,
  unmount,
  type ISymbioteEvent,
} from '@symbiote-native/vue';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  payloadOf,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 421;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function modalNode(): IAuthoredNode {
  const node = fabric.find(n => n.viewName === 'ModalHostView');
  expect(node, 'a ModalHostView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: ModalHostView missing');
  return node;
}

function containerHandle(): ISymbioteNode {
  const child = childrenOf(modalNode().handle)[0];
  if (child === undefined)
    throw new Error('ModalHostView has no container child');
  return child;
}

function mountModal(
  props: Record<string, unknown>,
  onDefault = () => h('view'),
): void {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () => h(Modal, props, onDefault),
    }),
  );
}

describe('Vue Modal on the engine', () => {
  describe('Positive (a visible modal commits a faithful ModalHostView tree)', () => {
    it('commits a visible modal as ModalHostView(RCTView(RCTView)) with default host props', async () => {
      // why: the modal's children must nest UNDER the shared container View, inside the SAME
      // childSet as the rest of the tree — not as a second root — so Fabric commits it atomically
      // with everything else.
      mountModal({ visible: true });
      await tick();

      const rootChildren = live.nodeOf(live.appRoot()).children;
      const serialized = rootChildren
        .map(c => live.serialize(c.handle))
        .join('');
      expect(serialized).toBe('ModalHostView(RCTView(RCTView))');

      const hostPayload = payloadOf(modalNode().handle);
      expect(hostPayload.visible).toBe(true);
      expect(hostPayload.animationType).toBe('none');
      expect(hostPayload.position).toBe('absolute');
      expect(hostPayload.presentationStyle).toBe('fullScreen');
      expect(payloadOf(containerHandle()).backgroundColor).toBe('white');
    });

    // why: Modal.js `defaultProps.visible = true` — a `<Modal>` without `visible` shows.
    it('shows a modal written without visible, as RN defaults it', async () => {
      mountModal({});
      await tick();
      expect(modalNode().props.visible).toBe(true);
    });

    it('commits no modal node when visible is false', async () => {
      // why: shouldRenderModal must gate the FIRST mount too, not just a later visible->hidden
      // transition — an initially-invisible modal must never pay for a host node it never shows.
      mountModal({ visible: false });
      await tick();
      // A surface always commits its own AppContainer root, so the question is what hangs UNDER
      // it: a modal that never became visible must contribute no child at all.
      expect(live.nodeOf(live.appRoot()).children.length).toBe(0);
      expect(
        live.findLive(live.appRoot(), n => n.viewName === 'ModalHostView'),
      ).toBeUndefined();
    });

    it('routes topRequestClose to the requestClose emit', async () => {
      // why: the hardware back button / swipe dismiss round-trips as a direct Fabric event, not a
      // JS-synthesized one — the wrapper must forward it verbatim to the app's own close handler.
      let closed = false;
      mountModal({ visible: true, onRequestClose: () => (closed = true) });
      await tick();
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      expect(closed).toBe(true);
    });

    // why: Modal.js (iOS) drops the keep-alive ONLY in its onDismiss handler — the node stays
    // mounted through the native exit animation, then unmounts, then the app hears `dismiss`.
    it('holds the modal on iOS until the native dismiss, then unmounts and emits dismiss', async () => {
      const visible = ref(true);
      let dismissed = 0;
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(
              Modal,
              {
                visible: visible.value,
                onDismiss: () => (dismissed += 1),
              },
              () => h('view'),
            ),
        }),
      );
      await tick();
      const host = modalNode().instanceHandle;

      visible.value = false;
      await tick();
      await tick();
      expect(
        live.findLive(live.appRoot(), n => n.viewName === 'ModalHostView'),
      ).toBeDefined();

      fabric.fireEvent(host, 'topDismiss', {});
      await tick();
      await tick();
      expect(
        live.findLive(live.appRoot(), n => n.viewName === 'ModalHostView'),
      ).toBeUndefined();
      expect(dismissed).toBe(1);
    });

    it('routes topShow to the show emit', async () => {
      // why: same direct-event contract as topRequestClose, for the native "modal finished
      // presenting" signal.
      let shown = false;
      mountModal({ visible: true, onShow: () => (shown = true) });
      await tick();
      fabric.fireEvent(modalNode().instanceHandle, 'topShow', {});
      expect(shown).toBe(true);
    });

    it('routes topOrientationChange to the orientationChange emit with the orientation on nativeEvent', async () => {
      // why: the only one of the four DirectEvents carrying a payload — the emit forwards the
      // engine's ISymbioteEvent wrapper verbatim, so the orientation rides nativeEvent rather than
      // sitting on the event itself; a listener reading `event.orientation` would get undefined.
      let received: ISymbioteEvent | undefined;
      mountModal({
        visible: true,
        onOrientationChange: (event: ISymbioteEvent) => (received = event),
      });
      await tick();
      fabric.fireEvent(modalNode().instanceHandle, 'topOrientationChange', {
        orientation: 'landscape',
      });
      expect(received?.type).toBe('orientationChange');
      expect(received?.nativeEvent.orientation).toBe('landscape');
    });

    it('lets the transparent override win over a user style and flips the presentation default', async () => {
      // why: RN's own precedence rule for a transparent modal — transparent forces the container
      // background to 'transparent' regardless of a user-supplied backgroundColor, and flips the
      // iOS presentationStyle default to overFullScreen so the modal doesn't paint an opaque sheet
      // behind transparent content.
      mountModal({
        visible: true,
        transparent: true,
        style: { backgroundColor: 'red' },
      });
      await tick();
      expect(payloadOf(containerHandle()).backgroundColor).toBe('transparent');
      expect(payloadOf(modalNode().handle).presentationStyle).toBe(
        'overFullScreen',
      );
    });

    it('sets the container background from backdropColor on a non-transparent modal', async () => {
      // why: backdropColor is the RN-documented way to tint a non-transparent modal's backdrop
      // without going through `style`.
      mountModal({ visible: true, backdropColor: 'rebeccapurple' });
      await tick();
      expect(payloadOf(containerHandle()).backgroundColor).toBe(
        'rebeccapurple',
      );
    });

    it('forwards platform props as NAMED host props', async () => {
      // why: each of these is a real ViewConfig prop on RCTModalHostView, not free-form
      // passthrough — proves the typed HANDLED_ATTRS list actually reaches the host under its own
      // name rather than being swallowed by forwardAttrs' passthrough bag.
      mountModal({
        visible: true,
        supportedOrientations: ['portrait', 'landscape'],
        hardwareAccelerated: true,
        statusBarTranslucent: true,
        navigationBarTranslucent: true,
        allowSwipeDismissal: true,
      });
      await tick();
      const payload = payloadOf(modalNode().handle);
      expect(payload.supportedOrientations).toEqual(['portrait', 'landscape']);
      expect(payload.hardwareAccelerated).toBe(true);
      expect(payload.statusBarTranslucent).toBe(true);
      expect(payload.navigationBarTranslucent).toBe(true);
      expect(payload.allowSwipeDismissal).toBe(true);
    });

    it('fires the dismiss emit only on the native topDismiss event, not on the hide transition', async () => {
      // why: the hide transition must NOT be mistaken for the native "finished dismissing" signal —
      // dismiss is a real animation-completion event from Fabric, or an app relying on onDismiss to
      // release resources would do so too early.
      let dismissCount = 0;
      const visible = ref(true);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(
              Modal,
              {
                visible: visible.value,
                onRequestClose: () => (visible.value = false),
                onDismiss: () => (dismissCount += 1),
              },
              () => h('view'),
            ),
        }),
      );
      await tick();
      expect(dismissCount).toBe(0);

      // Drive the native close: topRequestClose -> visible flips false. The node is held (iOS
      // keep-alive) and no dismiss emit fires from JS on this transition.
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      await tick();
      expect(dismissCount).toBe(0);

      // The native exit animation completes -> Fabric emits topDismiss -> dismiss fires once.
      fabric.fireEvent(modalNode().instanceHandle, 'topDismiss', {});
      await tick();
      expect(dismissCount).toBe(1);
    });
  });
});
