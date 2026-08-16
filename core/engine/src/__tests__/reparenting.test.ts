import { describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { appendChild, createElement, createSurface, setProp } from '../index';

const ROOT_TAG = 613;

// Reparenting (a node's committed `parent` no longer matching its renderable parent) is one of
// several `createNode` reasons commit.ts's reconcile() recognizes ('mount' / 'fresh-parent' /
// 'view-kind' / 'reparent') — this file's scope is specifically the 'reparent' branch a move
// between two already-mounted parents triggers. It has no throwing path of its own (a stale/
// moved node degrades to a fresh subtree rather than corrupting Fabric's tree), so this stays
// Positive-only; the second test below explicitly proves the "not throwing" contract too, since
// a naive reparent-by-append implementation could otherwise double-register the old family.
describe('Fabric family reparenting', () => {
  it('recreates a moved subtree instead of appending the old family under a new parent', () => {
    const fabric = installFabric();
    const surface = createSurface(ROOT_TAG);

    const sourceParent = createElement('RCTView');
    const targetParent = createElement('RCTView');
    const moved = createElement('RCTView');
    const movedChild = createElement('RCTView');

    setProp(moved, 'testID', 'moved');
    setProp(movedChild, 'testID', 'movedChild');
    appendChild(moved, movedChild);
    appendChild(sourceParent, moved);
    surface.appendChild(sourceParent);
    surface.appendChild(targetParent);
    surface.commit();

    const firstMoved = fabric.find(node => node.props.testID === 'moved');
    const firstMovedChild = fabric.find(node => node.props.testID === 'movedChild');
    expect(firstMoved).toBeDefined();
    expect(firstMovedChild).toBeDefined();

    fabric.reset();
    appendChild(targetParent, moved);

    expect(() => surface.commit()).not.toThrow();

    const secondMoved = fabric.find(node => node.props.testID === 'moved');
    expect(secondMoved).toBeDefined();
    expect(secondMoved).not.toBe(firstMoved);
    expect(secondMoved?.tag).not.toBe(firstMoved?.tag);

    // why: reconcile() recreates a reparented node with forceFreshFamily=true for its OWN
    // subtree too (line 259's recursive call) — the moved node's child must get a fresh
    // identity right along with it, not stay pinned to the stale family the parent just left.
    const secondMovedChild = fabric.find(node => node.props.testID === 'movedChild');
    expect(secondMovedChild).toBeDefined();
    expect(secondMovedChild?.tag).not.toBe(firstMovedChild?.tag);
  });

  // why: a stale ordering ref (a `beforeChild` from the framework's diff that no longer applies
  // after the move) or a double-move in the same commit must not corrupt the tree or crash —
  // the tree must stay walkable and re-committable afterward, not just "not throw once".
  it('the tree is still walkable and re-committable after a reparent', () => {
    const fabric = installFabric();
    const surface = createSurface(ROOT_TAG + 1);

    const sourceParent = createElement('RCTView');
    const targetParent = createElement('RCTView');
    const moved = createElement('RCTView');
    setProp(moved, 'testID', 'moved');
    appendChild(sourceParent, moved);
    surface.appendChild(sourceParent);
    surface.appendChild(targetParent);
    surface.commit();

    appendChild(targetParent, moved);
    surface.commit();

    // A second, unrelated commit after the reparent must still succeed and still find the
    // moved node exactly once (not duplicated under both parents).
    setProp(moved, 'opacity', 0.4);
    expect(() => surface.commit()).not.toThrow();
    expect(sourceParent.children).toEqual([]);
    expect(targetParent.children).toEqual([moved]);
  });
});
