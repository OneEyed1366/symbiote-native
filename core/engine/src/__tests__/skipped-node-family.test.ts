// A node SKIPPED at commit keeps a committed record whose Fabric family may have been orphaned
// underneath it, and adopting that stale handle later aborts Fabric.
//
// Found 2026-09-05 by the commit fuzzer, one value after the generator learned to write an EMPTY
// string. Shrunk from 150 steps to 10, and the throw came from the fake slot's `assertSameFamily`
// rather than from any oracle — which is why the runner now treats a throw as a violation.
//
// THE MECHANISM, and it turns on one fact about identity. `committed.parent` holds the RETAINED
// node, and a retained node survives its own Fabric re-creation: when a `<Text>` moves, the engine
// creates a fresh Fabric node with a fresh family and keeps the same JS object. Children that
// reconcile during that commit are told, through `forceFreshFamily`, to re-create too. A SKIPPED
// child is never visited, so it is never told — its record still points at a handle whose family
// belongs to the parent's OLD Fabric node. When it stops being skipped, `committed.parent` still
// equals its renderable parent, so `parentChanged` is false, the update path adopts the stale
// handle, and Fabric refuses:
//
//   Fabric family reparent: child RCTRawText#… already belongs to parent #…, cannot append to RCTText#…
//
// On a device that is a NATIVE ABORT, not a misrender — `ShadowNode` family reparenting is an
// invariant Fabric enforces in C++.
//
// Only an empty `RCTRawText` can reach this: it is the one thing `isSkippedAtCommit` drops
// entirely. An ANCHOR is not affected — its children are hoisted into the grandparent's list and
// DO reconcile, so they receive `forceFreshFamily` like any other child.

import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  setProp,
  setText,
} from '../index';
// From the module, not the barrel: the barrel does not re-export it, so importing it from there
// silently yields `undefined` and every node is built with no component. The control arm caught
// that — both arms threw a TypeError from inside reconcile rather than the Fabric error under test.
import { TEXT_COMPONENT } from '../node';

const fabric = installFabric();

describe('a skipped node does not carry a stale Fabric family back', () => {
  it('survives empty -> reparent-the-parent -> non-empty', () => {
    fabric.reset();
    const surface = createSurface(6201);
    const from = createElement('RCTView');
    setProp(from, 'testID', 'from');
    const to = createElement('RCTView');
    setProp(to, 'testID', 'to');
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('hello');
    appendChild(text, raw);
    appendChild(from, text);
    surface.appendChild(from);
    surface.appendChild(to);
    surface.commit();

    // 1. The raw text goes empty, so the next commit SKIPS it and never revisits it.
    setText(raw, '');
    // 2. Its parent moves, so the parent is re-created with a fresh Fabric family. The raw text is
    //    not visited, so nothing tells it that its own handle's family is now orphaned.
    appendChild(to, text);
    surface.commit();

    // 3. It comes back. `committed.parent` is still the same JS object, so the reparent check sees
    //    no change and the update path adopts the stale handle.
    setText(raw, 'back');
    expect(() => surface.commit()).not.toThrow();
  });

  it('control: the same sequence without the empty step has always worked', () => {
    // The raw text is never skipped here, so it reconciles during the move and is re-created with
    // its parent. This arm was green before the fix and after — it is the DIFFERENCE between the
    // two arms that carries the finding, and without it a red above could be about the move alone.
    fabric.reset();
    const surface = createSurface(6202);
    const from = createElement('RCTView');
    const to = createElement('RCTView');
    const text = createElement(TEXT_COMPONENT, true);
    const raw = createRawText('hello');
    appendChild(text, raw);
    appendChild(from, text);
    surface.appendChild(from);
    surface.appendChild(to);
    surface.commit();

    appendChild(to, text);
    surface.commit();
    setText(raw, 'back');
    expect(() => surface.commit()).not.toThrow();
  });
});
