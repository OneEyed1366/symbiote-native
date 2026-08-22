// Unit test for toPublicInstance, the framework-agnostic graft every
// adapter applies to its host nodes. Proves it attaches the six imperative methods onto the
// retained node, returns the SAME node identity (it mutates in place, so the engine commit
// mirror keyed on the raw node still resolves it), and is idempotent across repeated calls.
// Each grafted method is driven end to end through the public instance to prove it reaches
// the engine's commit layer with the node's CURRENT committed handle, and degrades to a
// silent no-op (never throws) when the node isn't committed yet.
//
// The fake Fabric slot from @symbiote-native/test-utils only implements the mutation/dispatch
// half (createNode/dispatchCommand/...); measure/measureInWindow/measureLayout aren't part of
// it, so this file extends the installed global slot with them -- the actual native-module
// call boundary the task's mocking rule points at, same idea as stubbing __turboModuleProxy
// in the other engine module tests, just for a different global.
//
// toPublicInstance never throws: every grafted method degrades to a documented no-op (dlog +
// return) when its target node (or measureLayout's relative node) isn't committed. So there is
// no Negative (toThrow) group; every scenario below is Positive.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createElement,
  createSurface,
  toPublicInstance,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 77;
const METHOD_NAMES = [
  'measure',
  'measureInWindow',
  'measureLayout',
  'setNativeProps',
  'focus',
  'blur',
] as const;

const fabric = installFabric();

function methodOf(node: ISymbioteNode, name: string): unknown {
  return Reflect.get(node, name);
}

function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

// Mount + commit a fresh public instance as the app's single child, so commit.ts's
// internal mirror has a record for it (every grafted method reads that record to
// resolve the node's CURRENT Fabric handle).
function mountCommitted(): ReturnType<typeof toPublicInstance> {
  const surface = createSurface(ROOT_TAG);
  const instance = toPublicInstance(createElement('RCTView'));
  surface.appendChild(instance);
  surface.commit();
  return instance;
}

beforeEach(() => {
  fabric.reset();
  const slot = globalThis.nativeFabricUIManager;
  if (slot) {
    slot.measure = (_node, callback) => callback(1, 2, 30, 40, 5, 6);
    slot.measureInWindow = (_node, callback) => callback(10, 20, 30, 40);
    slot.measureLayout = (_node, _relativeToNode, _onFail, onSuccess) =>
      onSuccess(1, 2, 30, 40);
  }
});

describe('toPublicInstance', () => {
  it('grafts the six imperative methods onto the retained node', () => {
    const instance = toPublicInstance(createElement('RCTView'));
    for (const name of METHOD_NAMES) {
      expect(typeof methodOf(instance, name), `${name} is a function`).toBe(
        'function',
      );
    }
  });

  // why: adapters key their own commit mirror (React's Fiber stateNode, Vue's host
  // node) off this exact object identity -- grafting must mutate in place, never
  // return a wrapper, or a caller's own ref would point at the wrong object.
  it('returns the SAME node identity, mutated in place', () => {
    const node = createElement('RCTView');
    expect(toPublicInstance(node)).toBe(node);
  });

  // why: a component's render can call toPublicInstance repeatedly (every re-render
  // re-touches the ref) -- it must not re-graft (which would silently replace a
  // closure-captured method reference an adapter may have cached).
  it('is idempotent: a second call returns the same instance with the same methods', () => {
    const first = toPublicInstance(createElement('RCTView'));
    const measureBefore = methodOf(first, 'measure');
    const second = toPublicInstance(first);
    expect(second).toBe(first);
    expect(methodOf(second, 'measure')).toBe(measureBefore);
  });

  describe('setNativeProps', () => {
    // why: this is the escape hatch libraries (reanimated) use to bypass a full
    // re-render for a hot-path prop update -- it must reach the real committed view.
    it('drives a prop change through to the committed view', () => {
      const instance = mountCommitted();
      instance.setNativeProps({ nativeID: 'grafted' });
      expect(appView().props.nativeID).toBe('grafted');
    });

    // why: a ref call before the node is ever committed (e.g. an effect racing the
    // first commit) must not throw -- it silently no-ops until the node exists on Fabric.
    it('is a no-op when the node has not been committed yet', () => {
      const instance = toPublicInstance(createElement('RCTView'));
      expect(() =>
        instance.setNativeProps({ nativeID: 'ignored' }),
      ).not.toThrow();
    });
  });

  describe('measure / measureInWindow', () => {
    // why: measure must resolve the node's CURRENT committed Fabric handle and
    // report back exactly what native returned, unmodified -- libraries read
    // pageX/pageY off this for absolute positioning.
    it('measure() reports the frame from the committed handle', () => {
      const instance = mountCommitted();
      let reported: number[] = [];
      instance.measure((x, y, width, height, pageX, pageY) => {
        reported = [x, y, width, height, pageX, pageY];
      });
      expect(reported).toEqual([1, 2, 30, 40, 5, 6]);
    });

    it('measureInWindow() reports the window-relative frame from the committed handle', () => {
      const instance = mountCommitted();
      let reported: number[] = [];
      instance.measureInWindow((x, y, width, height) => {
        reported = [x, y, width, height];
      });
      expect(reported).toEqual([10, 20, 30, 40]);
    });

    // why: a ref that measures before its node ever committed must not throw or
    // invoke the callback with garbage -- it silently no-ops.
    it('measure() is a no-op that never invokes the callback when uncommitted', () => {
      const instance = toPublicInstance(createElement('RCTView'));
      let called = false;
      expect(() => instance.measure(() => (called = true))).not.toThrow();
      expect(called).toBe(false);
    });
  });

  describe('measureLayout', () => {
    // why: this is the whole point of measureLayout over plain measure -- reporting
    // a frame relative to a caller-chosen node (a scroll container computing an
    // item's offset), not the window.
    it('reports the frame relative to a committed sibling node', () => {
      const surface = createSurface(ROOT_TAG);
      const instance = toPublicInstance(createElement('RCTView'));
      const relative = toPublicInstance(createElement('RCTView'));
      surface.appendChild(instance);
      surface.appendChild(relative);
      surface.commit();

      let reported: number[] = [];
      instance.measureLayout(relative, (left, top, width, height) => {
        reported = [left, top, width, height];
      });
      expect(reported).toEqual([1, 2, 30, 40]);
    });

    // why: the public signature accepts a raw Fabric tag (a number) as the relative
    // target for RN parity, but this engine's measureLayout only resolves a host
    // node through the commit mirror -- a numeric tag has no such record, so it must
    // degrade to the documented no-op rather than crash on a missing `.component`.
    it('is a no-op when the relative target is a raw tag number, not a host node', () => {
      const instance = mountCommitted();
      let onFailCalled = false;
      let onSuccessCalled = false;
      expect(() =>
        instance.measureLayout(
          42,
          () => (onSuccessCalled = true),
          () => (onFailCalled = true),
        ),
      ).not.toThrow();
      expect(onSuccessCalled).toBe(false);
      expect(onFailCalled).toBe(false);
    });

    // why: both sides must be committed -- measuring relative to a node not yet on
    // Fabric has no real answer, so it silently no-ops rather than report a stale frame.
    it('is a no-op when the relative host node has not been committed', () => {
      const instance = mountCommitted();
      const uncommittedRelative = toPublicInstance(createElement('RCTView'));
      let called = false;
      expect(() =>
        instance.measureLayout(uncommittedRelative, () => (called = true)),
      ).not.toThrow();
      expect(called).toBe(false);
    });
  });

  describe('focus / blur', () => {
    // why: focus/blur are dispatched as imperative Fabric view commands (the same
    // channel a TextInput's setTextAndSelection uses), not props -- a library
    // driving keyboard focus must reach the real native command dispatch.
    it('focus() dispatches a "focus" view command at the committed handle', () => {
      const instance = mountCommitted();
      instance.focus();
      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'focus',
      ]);
    });

    it('blur() dispatches a "blur" view command at the committed handle', () => {
      const instance = mountCommitted();
      instance.blur();
      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'blur',
      ]);
    });

    // why: calling focus() before the node is committed must not throw or dispatch
    // a command against a handle that doesn't exist yet.
    it('focus() is a no-op that dispatches nothing when uncommitted', () => {
      const instance = toPublicInstance(createElement('RCTView'));
      expect(() => instance.focus()).not.toThrow();
      expect(fabric.commands).toHaveLength(0);
    });
  });
});
