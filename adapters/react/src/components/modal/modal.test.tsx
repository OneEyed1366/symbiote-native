// Co-located React-driven pipeline test.
//
// renderModal()'s own value math — the transparent/backdropColor/presentationStyle
// precedence matrix, the position:absolute host style, the default attributes, the
// collapsable:false container — and the modalReducer/shouldRenderModal keep-alive state
// machine are pure and already exhaustively unit-tested in
// core/components/src/__tests__/wave1-core.test.ts (`describe('renderModal')` /
// `describe('modal keep-alive state machine')`). This file does NOT re-walk that value
// matrix; it stays on the React-specific half of the
// <components_split_logic_view_lifecycle> split: does the real Descriptor->React->Fabric
// bridge commit the right SHAPE (one childSet, children under the container, no node at all
// when hidden), does React's own useReducer+useEffect actually drive the keep-alive timing
// across a real state transition, and do the native DirectEvents (topRequestClose/topShow/
// topDismiss) round-trip to the right JS callback. One thin spot-check per style-precedence
// branch stays here only to prove the computed style still reaches the REAL committed node
// through the engine's flattening, not to re-verify the value math itself.
//
// No Negative group: Modal (adapters/react/.../modal/index.ts) has one conditional return
// (`if (typeof container === 'string') return null`) that renderModal's own contract makes
// unreachable — renderModal always returns an object child, never a bare string — so there is
// no reachable throwing/rejecting scenario to assert here.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, Modal, mount, unmount, type ISymbioteEvent } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 220;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function modalNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'ModalHostView');
  if (!node) throw new Error('no ModalHostView was created');
  return node;
}

// The container View RN wraps children in is the one View directly under the host.
function containerNode(): IFakeNode {
  const child = modalNode().children[0];
  if (!child) throw new Error('ModalHostView has no container child');
  return child;
}

describe('React Modal on the engine', () => {
  describe('Positive — commit shape through the real Descriptor->React->Fabric bridge', () => {
    // why: proves the STRUCTURE renderModal's contract promises — one childSet, the user's
    // <View/> nested under a single collapsable container, no second root — actually survives
    // a real commit. The individual style/attribute VALUES (position:absolute, animationType,
    // presentationStyle default, white backdrop) are the exhaustive-value concern of
    // renderModal's own core test; spot-checking one of them (visible) here is enough to prove
    // the props reach the node at all.
    it('commits a visible modal as ModalHostView(RCTView(RCTView)) with the host visible prop set', () => {
      mount(
        ROOT_TAG,
        <Modal visible>
          <View />
        </Modal>,
      );
      expect(fabric.serialize(fabric.appRoot().children)).toBe('ModalHostView(RCTView(RCTView))');
      expect(modalNode().props.visible).toBe(true);
    });

    // why: shouldRenderModal's boolean result is core-tested directly; this proves the React
    // FC's `if (!shouldRenderModal(...)) return null` line actually removes the node from a
    // real commit rather than rendering an empty/placeholder host.
    it('commits no modal node when visible is false', () => {
      mount(
        ROOT_TAG,
        <Modal visible={false}>
          <View />
        </Modal>,
      );
      expect(fabric.appRoot().children.length).toBe(0);
      expect(fabric.find(n => n.viewName === 'ModalHostView')).toBeUndefined();
    });

    // why: modalReducer's isRendered transitions are core-tested against hand-built states;
    // this proves React's OWN useReducer+useEffect timing reproduces that same keep-alive
    // frame from a real visible->hidden state change — the node must still be present and
    // eventable for one render after the app sets visible=false, matching RN's
    // componentDidUpdate-driven exit animation.
    it('keeps the modal node mounted for the exit-animation frame after visible flips to false', () => {
      function KeepAliveCase(): ReactElement {
        const [visible, setVisible] = useState(true);
        return (
          <Modal visible={visible} onRequestClose={() => setVisible(false)}>
            <View />
          </Modal>
        );
      }
      mount(ROOT_TAG, <KeepAliveCase />);
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      // Still mounted and eventable: the keep-alive frame, not yet torn down.
      expect(() => modalNode()).not.toThrow();
    });
  });

  describe('Positive — native DirectEvents round-trip to the right JS callback', () => {
    // why: onRequestClose/onShow/onDismiss ride raw through `...passthrough` as real Fabric
    // DirectEvents, not through any core-tested logic — this is the only place their wiring is
    // proven at all.
    it('routes topRequestClose to onRequestClose', () => {
      let closed = false;
      mount(
        ROOT_TAG,
        <Modal
          visible
          onRequestClose={() => {
            closed = true;
          }}
        >
          <View />
        </Modal>,
      );
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      expect(closed).toBe(true);
    });

    // why: onOrientationChange is the only one of the four DirectEvents carrying a payload, so it
    // is the only one whose declared signature can disagree with what the engine delivers —
    // setEventListener registers every `onX` as `(event: ISymbioteEvent) => handler(event)`, so
    // the handler gets the wrapper and the orientation rides `nativeEvent`. A signature promising
    // a bare `{ orientation }` would make every caller read `undefined`.
    it('routes topOrientationChange to onOrientationChange with the orientation on nativeEvent', () => {
      let received: ISymbioteEvent | undefined;
      mount(
        ROOT_TAG,
        <Modal
          visible
          onOrientationChange={event => {
            received = event;
          }}
        >
          <View />
        </Modal>,
      );
      fabric.fireEvent(modalNode().instanceHandle, 'topOrientationChange', {
        orientation: 'landscape',
      });
      expect(received?.type).toBe('orientationChange');
      expect(received?.nativeEvent.orientation).toBe('landscape');
    });

    it('routes topShow to onShow', () => {
      let shown = false;
      mount(
        ROOT_TAG,
        <Modal
          visible
          onShow={() => {
            shown = true;
          }}
        >
          <View />
        </Modal>,
      );
      fabric.fireEvent(modalNode().instanceHandle, 'topShow', {});
      expect(shown).toBe(true);
    });

    // why: onDismiss must fire on the native exit-animation completion (topDismiss) and MUST
    // NOT fire merely because the app requested the close (topRequestClose / the visible->hidden
    // transition) — conflating the two would fire an app's "modal closed" side effect one frame
    // too early, before the native view has actually finished dismissing.
    it('fires onDismiss only on the native topDismiss event, not on the hide transition', () => {
      let dismissCount = 0;
      function DismissCase(): ReactElement {
        const [visible, setVisible] = useState(true);
        return (
          <Modal
            visible={visible}
            onRequestClose={() => setVisible(false)}
            onDismiss={() => {
              dismissCount += 1;
            }}
          >
            <View />
          </Modal>
        );
      }
      mount(ROOT_TAG, <DismissCase />);
      expect(dismissCount).toBe(0);

      // Drive the native close: topRequestClose -> parent sets visible=false. The keep-alive
      // holds the node mounted, but NO onDismiss fires from JS on this transition.
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      expect(dismissCount).toBe(0);

      // The native exit animation completes -> Fabric emits topDismiss on the still-mounted
      // host node -> onDismiss fires exactly once.
      fabric.fireEvent(modalNode().instanceHandle, 'topDismiss', {});
      expect(dismissCount).toBe(1);
    });
  });

  describe('Positive — style-precedence branches still reach the real committed node', () => {
    // why: renderModal's transparent->backdrop/presentationStyle precedence is exhaustively
    // value-tested in core against the pure function; this spot-checks that a REAL user style
    // prop (`style={{ backgroundColor: 'red' }}`) still loses to the computed override once it
    // goes through the engine's actual style flattening on a real node, not just the function's
    // return value.
    it('lets the transparent override win over a user style on the real committed container', () => {
      mount(
        ROOT_TAG,
        <Modal visible transparent style={{ backgroundColor: 'red' }}>
          <View />
        </Modal>,
      );
      expect(containerNode().props.backgroundColor).toBe('transparent');
      expect(modalNode().props.presentationStyle).toBe('overFullScreen');
    });
  });

  describe('Positive — React-side prop bridge not exercised by core\'s direct renderModal calls', () => {
    // why: core's renderModal test passes a hand-built `passthrough` object directly; this
    // proves the REAL path — JSX props -> resolveAccessibilityProps -> ...passthrough -> the
    // host node — carries ViewProps/a11y through a real mount without resolveAccessibilityProps
    // dropping or renaming anything.
    it('passes ViewProps / a11y through to the host node', () => {
      mount(
        ROOT_TAG,
        <Modal visible testID="my-modal" accessible accessibilityLabel="a dialog">
          <View />
        </Modal>,
      );
      const props = modalNode().props;
      expect(props.testID).toBe('my-modal');
      expect(props.accessible).toBe(true);
      expect(props.accessibilityLabel).toBe('a dialog');
    });

    // why: supportedOrientations/hardwareAccelerated/statusBarTranslucent/
    // navigationBarTranslucent/allowSwipeDismissal are each destructured and re-forwarded by
    // NAME in Modal's own index.ts (not covered by core's renderModal test, which never
    // exercises this specific field set) — this is the only place a typo/dropped field in that
    // destructuring list would be caught.
    it('forwards platform props as NAMED host props', () => {
      mount(
        ROOT_TAG,
        <Modal
          visible
          supportedOrientations={['portrait', 'landscape']}
          hardwareAccelerated
          statusBarTranslucent
          navigationBarTranslucent
          allowSwipeDismissal
          onRequestClose={() => {}}
        >
          <View />
        </Modal>,
      );
      const props = modalNode().props;
      expect(props.supportedOrientations).toEqual(['portrait', 'landscape']);
      expect(props.hardwareAccelerated).toBe(true);
      expect(props.statusBarTranslucent).toBe(true);
      expect(props.navigationBarTranslucent).toBe(true);
      expect(props.allowSwipeDismissal).toBe(true);
    });
  });
});
