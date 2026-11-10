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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Modal,
  mount,
  unmount,
  type ISymbioteEvent,
} from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 220;
const USER_STYLE = { backgroundColor: 'red' };

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function modalNode(): ILiveNode {
  const node = live.findLive(
    live.appRoot(),
    n => n.viewName === 'ModalHostView',
  );
  if (!node) throw new Error('no ModalHostView was created');
  return node;
}

// The container View RN wraps children in is the one View directly under the host.
function containerNode(): ILiveNode {
  const child = modalNode().children[0];
  if (!child) throw new Error('ModalHostView has no container child');
  return child;
}

// The serializer runs siblings together, same shorthand `fabric.serialize` used to produce.
function serialize(nodes: ILiveNode[]): string {
  return nodes.map(node => live.serialize(node.handle)).join('');
}

describe('React Modal on the engine', () => {
  describe('Positive — commit shape through the real Descriptor->React->Fabric bridge', () => {
    // The shape survives a real commit, the values are `renderModal`'s own core test
    it('commits a visible modal as ModalHostView(RCTView(RCTView)) with the host visible prop set', () => {
      mount(
        ROOT_TAG,
        <Modal visible>
          <view />
        </Modal>,
      );
      expect(serialize(live.nodeOf(live.appRoot()).children)).toBe(
        'ModalHostView(RCTView(RCTView))',
      );
      expect(modalNode().payload.visible).toBe(true);
    });

    // RN `defaultProps.visible` is true
    it('shows a modal written without visible, as RN defaults it', () => {
      mount(
        ROOT_TAG,
        <Modal>
          <view />
        </Modal>,
      );
      expect(modalNode().payload.visible).toBe(true);
    });

    // A hidden modal leaves no node behind, not an empty host
    it('commits no modal node when visible is false', () => {
      mount(
        ROOT_TAG,
        <Modal visible={false}>
          <view />
        </Modal>,
      );
      expect(live.nodeOf(live.appRoot()).children.length).toBe(0);
      expect(fabric.find(n => n.viewName === 'ModalHostView')).toBeUndefined();
    });

    // The node stays eventable for one render after `visible` flips, like RN's exit animation
    it('keeps the modal node mounted for the exit-animation frame after visible flips to false', () => {
      function KeepAliveCase(): ReactElement {
        const [visible, setVisible] = useState(true);
        return (
          <Modal visible={visible} onRequestClose={() => setVisible(false)}>
            <view />
          </Modal>
        );
      }
      mount(ROOT_TAG, <KeepAliveCase />);
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      // Still mounted and eventable: the keep-alive frame, not yet torn down.
      expect(() => modalNode()).not.toThrow();
    });

    // On iOS only the native dismiss drops the keep-alive, then the app hears it
    it('holds the modal on iOS until the native dismiss, then unmounts and calls onDismiss', async () => {
      let dismissed = 0;
      function HoldCase(): ReactElement {
        const [visible, setVisible] = useState(true);
        return (
          <Modal
            visible={visible}
            onRequestClose={() => setVisible(false)}
            onDismiss={() => {
              dismissed += 1;
            }}
          >
            <view />
          </Modal>
        );
      }
      mount(ROOT_TAG, <HoldCase />);
      const host = modalNode().instanceHandle;
      fabric.fireEvent(host, 'topRequestClose', {});
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(() => modalNode()).not.toThrow();

      fabric.fireEvent(host, 'topDismiss', {});
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(
        live.findLive(live.appRoot(), n => n.viewName === 'ModalHostView'),
      ).toBeUndefined();
      expect(dismissed).toBe(1);
    });
  });

  describe('Positive — native DirectEvents round-trip to the right JS callback', () => {
    // The events ride raw through `passthrough` as DirectEvents, this is their only wiring test
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
          <view />
        </Modal>,
      );
      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      expect(closed).toBe(true);
    });

    // The handler gets the event wrapper, a bare `{ orientation }` signature would read `undefined`
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
          <view />
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
          <view />
        </Modal>,
      );
      fabric.fireEvent(modalNode().instanceHandle, 'topShow', {});
      expect(shown).toBe(true);
    });

    // A requested close must not fire `onDismiss`, the native dismiss does
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
            <view />
          </Modal>
        );
      }
      mount(ROOT_TAG, <DismissCase />);
      expect(dismissCount).toBe(0);

      fabric.fireEvent(modalNode().instanceHandle, 'topRequestClose', {});
      expect(dismissCount).toBe(0);

      fabric.fireEvent(modalNode().instanceHandle, 'topDismiss', {});
      expect(dismissCount).toBe(1);
    });
  });

  describe('Positive — style-precedence branches still reach the real committed node', () => {
    // A user style still loses to the transparent override after the engine flattens it
    it('lets the transparent override win over a user style on the real committed container', () => {
      mount(
        ROOT_TAG,
        <Modal visible transparent style={USER_STYLE}>
          <view />
        </Modal>,
      );
      expect(containerNode().payload.backgroundColor).toBe('transparent');
      expect(modalNode().payload.presentationStyle).toBe('overFullScreen');
    });
  });

  describe("Positive — React-side prop bridge not exercised by core's direct renderModal calls", () => {
    // The real path from JSX props to the host node drops and renames nothing
    it('passes ViewProps / a11y through to the host node', () => {
      mount(
        ROOT_TAG,
        <Modal
          visible
          testID="my-modal"
          accessible
          accessibilityLabel="a dialog"
        >
          <view />
        </Modal>,
      );
      const props = modalNode().payload;
      expect(props.testID).toBe('my-modal');
      expect(props.accessible).toBe(true);
      expect(props.accessibilityLabel).toBe('a dialog');
    });

    // Each is forwarded by name in `Modal`, a dropped field shows only here
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
          <view />
        </Modal>,
      );
      const props = modalNode().payload;
      expect(props.supportedOrientations).toEqual(['portrait', 'landscape']);
      expect(props.hardwareAccelerated).toBe(true);
      expect(props.statusBarTranslucent).toBe(true);
      expect(props.navigationBarTranslucent).toBe(true);
      expect(props.allowSwipeDismissal).toBe(true);
    });
  });

  describe('dev warnings', () => {
    afterEach(() => {
      Reflect.deleteProperty(globalThis, '__DEV__');
      vi.restoreAllMocks();
    });

    it('warns in a dev build about a prop combination RN cannot honour', () => {
      Reflect.set(globalThis, '__DEV__', true);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mount(
        ROOT_TAG,
        <Modal visible transparent presentationStyle="pageSheet">
          <view />
        </Modal>,
      );

      expect(warn).toHaveBeenCalledWith(
        "Modal with 'pageSheet' presentation style and 'transparent' value is not supported.",
      );
    });

    it('stays quiet in a release build', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mount(
        ROOT_TAG,
        <Modal visible transparent presentationStyle="pageSheet">
          <view />
        </Modal>,
      );

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('responder boundary', () => {
    // RN's host claims `onStartShouldSetResponder`, so no touch inside the modal reaches an
    // ancestor's responder handlers
    it('keeps a touch inside the modal from granting the responder to a view above it', () => {
      const granted: string[] = [];
      mount(
        ROOT_TAG,
        <view
          testID="above"
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => granted.push('above')}
        >
          <Modal visible>
            <view testID="inside" />
          </Modal>
        </view>,
      );
      const inside = fabric.find(node => node.props.testID === 'inside');
      if (inside === undefined) throw new Error('no node inside the modal');

      fabric.fireEvent(inside.instanceHandle ?? {}, 'topTouchStart', {});

      expect(granted).toEqual([]);
    });
  });
});
