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

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal, mount, unmount, type ISymbioteEvent } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 421;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function modalNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'ModalHostView');
  expect(node, 'a ModalHostView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: ModalHostView missing');
  return node;
}

function containerNode(): IFakeNode {
  const child = modalNode().children[0];
  if (child === undefined) throw new Error('ModalHostView has no container child');
  return child;
}

function mountModal(props: Record<string, unknown>, onDefault = () => h('symbiote-view')): void {
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

      expect(fabric.serialize(fabric.appRoot().children)).toBe('ModalHostView(RCTView(RCTView))');

      const host = modalNode();
      expect(host.props.visible).toBe(true);
      expect(host.props.animationType).toBe('none');
      expect(host.props.position).toBe('absolute');
      expect(host.props.presentationStyle).toBe('fullScreen');
      expect(containerNode().props.backgroundColor).toBe('white');
    });

    it('commits no modal node when visible is false', async () => {
      // why: shouldRenderModal must gate the FIRST mount too, not just a later visible->hidden
      // transition — an initially-invisible modal must never pay for a host node it never shows.
      mountModal({ visible: false });
      await tick();
      // Unlike React (whose host config commits an empty AppContainer unconditionally every
      // commit), Vue's renderer only calls surface.requestCommit() from an actual nodeOp — a
      // root that renders nothing produces no nodeOp at all, so nothing commits yet. That's
      // fine: the mirror has no entry for the root container, so the NEXT real insert (when the
      // modal becomes visible) still does a full first-mount commit, AppContainer included.
      expect(fabric.committed.length).toBe(0);
      expect(fabric.find(n => n.viewName === 'ModalHostView')).toBeUndefined();
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
      mountModal({ visible: true, transparent: true, style: { backgroundColor: 'red' } });
      await tick();
      expect(containerNode().props.backgroundColor).toBe('transparent');
      expect(modalNode().props.presentationStyle).toBe('overFullScreen');
    });

    it('sets the container background from backdropColor on a non-transparent modal', async () => {
      // why: backdropColor is the RN-documented way to tint a non-transparent modal's backdrop
      // without going through `style`.
      mountModal({ visible: true, backdropColor: 'rebeccapurple' });
      await tick();
      expect(containerNode().props.backgroundColor).toBe('rebeccapurple');
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
      const props = modalNode().props;
      expect(props.supportedOrientations).toEqual(['portrait', 'landscape']);
      expect(props.hardwareAccelerated).toBe(true);
      expect(props.statusBarTranslucent).toBe(true);
      expect(props.navigationBarTranslucent).toBe(true);
      expect(props.allowSwipeDismissal).toBe(true);
    });

    it('fires the dismiss emit only on the native topDismiss event, not on the hide transition', async () => {
      // why: the keep-alive frame (state.isRendered staying true for one extra render on
      // visible->hidden) must NOT be mistaken for the native "finished dismissing" signal — dismiss
      // is a real animation-completion event from Fabric, not something JS can infer from its own
      // state transition, or an app relying on onDismiss to release resources would do so too early.
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
              () => h('symbiote-view'),
            ),
        }),
      );
      await tick();
      expect(dismissCount).toBe(0);

      // Drive the native close: topRequestClose -> visible flips false. The keep-alive holds the
      // node mounted, but NO dismiss emit fires from JS on this transition alone.
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      await tick();
      expect(dismissCount).toBe(0);

      // The native exit animation completes -> Fabric emits topDismiss on the still-mounted host
      // node -> dismiss fires exactly once.
      fabric.fireEvent(modalNode().instanceHandle, 'topDismiss', {});
      await tick();
      expect(dismissCount).toBe(1);
    });
  });
});
