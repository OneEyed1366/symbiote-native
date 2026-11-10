// RN's `Mounting-itest`, view flattening group: reordering and reparenting, same trees and logs.
// Run twice by the entry files, with `useLISAlgorithmInDifferentiator` on and off

import { createElement, type ReactElement } from 'react';

import { createRoot, render, takeLogs, view } from './culling-fixture';
import { rendered, rnView } from './mounting-fixture';
import { beforeEach, describe, expect, it } from './harness';

const BOX = { height: 10, width: 10 };
const KEYS = ['nativeID', 'width'] as const;

function keyed(id: string, props: Record<string, unknown> = {}): ReactElement {
  return view({ key: id, nativeID: id, ...props });
}

const CREATE_ANON = 'Create {type: "View", nativeID: (N/A)}';
const UPDATE_CHILD = 'Update {type: "View", nativeID: "child"}';
const INSERT_ANON_UNDER_ROOT =
  'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: (N/A)}';
const INSERT_CHILD_UNDER_ANON =
  'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}';
const REMOVE_CHILD =
  'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}';
const REMOVE_ANON_UNDER_ROOT =
  'Remove {type: "View", parentNativeID: (root), index: 0, nativeID: (N/A)}';

function opacityPair(
  outerOpacity: number | undefined,
  innerOpacity: number | undefined,
  childProps: Record<string, unknown>,
): ReactElement {
  return view(
    { style: { marginTop: 100, opacity: outerOpacity } },
    view(
      { style: { marginTop: 50, opacity: innerOpacity } },
      view({ nativeID: 'child', style: childProps }),
    ),
  );
}

export function defineMountingCases(isLis: boolean): void {
  describe('ViewFlattening', () => {
    beforeEach(() => createRoot(100, 100));

    it('reorders views of the same parent', () => {
      render(view({ nativeID: 'A' }, keyed('B'), keyed('C'), keyed('D')));

      expect(rendered()).toEqual([
        rnView(
          { nativeID: 'A' },
          rnView({ nativeID: 'B' }),
          rnView({ nativeID: 'C' }),
          rnView({ nativeID: 'D' }),
        ),
      ]);
      expect(takeLogs()).toEqual([
        'Update {type: "RootView", nativeID: (root)}',
        'Create {type: "View", nativeID: "A"}',
        'Create {type: "View", nativeID: "B"}',
        'Create {type: "View", nativeID: "C"}',
        'Create {type: "View", nativeID: "D"}',
        'Insert {type: "View", parentNativeID: "A", index: 0, nativeID: "B"}',
        'Insert {type: "View", parentNativeID: "A", index: 1, nativeID: "C"}',
        'Insert {type: "View", parentNativeID: "A", index: 2, nativeID: "D"}',
        'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "A"}',
      ]);

      render(view({ nativeID: 'A' }, keyed('D'), keyed('B'), keyed('C')));

      expect(rendered()).toEqual([
        rnView(
          { nativeID: 'A' },
          rnView({ nativeID: 'D' }),
          rnView({ nativeID: 'B' }),
          rnView({ nativeID: 'C' }),
        ),
      ]);
      expect(takeLogs()).toEqual([
        'Remove {type: "View", parentNativeID: "A", index: 2, nativeID: "D"}',
        'Insert {type: "View", parentNativeID: "A", index: 0, nativeID: "D"}',
      ]);
    });

    it('reorders: moves the first child to the last', () => {
      const list = (ids: string[]): ReactElement =>
        view({ nativeID: 'P' }, ...ids.map(id => keyed(id)));

      render(list(['A', 'B', 'C', 'D', 'E']));
      takeLogs();

      render(list(['B', 'C', 'D', 'E', 'A']));

      expect(rendered()).toEqual([
        rnView(
          { nativeID: 'P' },
          ...['B', 'C', 'D', 'E', 'A'].map(id => rnView({ nativeID: id })),
        ),
      ]);
      // LIS keeps [B,C,D,E] in place, the greedy walk moves four of them
      expect(takeLogs()).toEqual(
        isLis
          ? [
              'Remove {type: "View", parentNativeID: "P", index: 0, nativeID: "A"}',
              'Insert {type: "View", parentNativeID: "P", index: 4, nativeID: "A"}',
            ]
          : [
              'Remove {type: "View", parentNativeID: "P", index: 4, nativeID: "E"}',
              'Remove {type: "View", parentNativeID: "P", index: 3, nativeID: "D"}',
              'Remove {type: "View", parentNativeID: "P", index: 2, nativeID: "C"}',
              'Remove {type: "View", parentNativeID: "P", index: 1, nativeID: "B"}',
              'Insert {type: "View", parentNativeID: "P", index: 0, nativeID: "B"}',
              'Insert {type: "View", parentNativeID: "P", index: 1, nativeID: "C"}',
              'Insert {type: "View", parentNativeID: "P", index: 2, nativeID: "D"}',
              'Insert {type: "View", parentNativeID: "P", index: 3, nativeID: "E"}',
            ],
      );
    });

    it('reparents views', () => {
      const wrapped = (inner: ReactElement): ReactElement =>
        view({}, view({}, inner));

      // Root -> G* -> H -> I -> J -> A*, a * is a view that is not flattened
      render(view({ nativeID: 'G' }, view({}, wrapped(keyed('A')))));

      expect(rendered()).toEqual([
        rnView({ nativeID: 'G' }, rnView({ nativeID: 'A' })),
      ]);
      expect(takeLogs()).toEqual([
        'Update {type: "RootView", nativeID: (root)}',
        'Create {type: "View", nativeID: "G"}',
        'Create {type: "View", nativeID: "A"}',
        'Insert {type: "View", parentNativeID: "G", index: 0, nativeID: "A"}',
        'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "G"}',
      ]);

      // Root -> G* -> H* -> I -> J -> A*, with A given new props
      render(
        view(
          { nativeID: 'G' },
          view(
            { nativeID: 'H' },
            wrapped(keyed('A', { style: { width: 100 } })),
          ),
        ),
      );

      expect(rendered(KEYS)).toEqual([
        rnView(
          { nativeID: 'G' },
          rnView({ nativeID: 'H' }, rnView({ nativeID: 'A', width: '100' })),
        ),
      ]);
      expect(takeLogs()).toEqual([
        'Update {type: "View", nativeID: "A"}',
        'Remove {type: "View", parentNativeID: "G", index: 0, nativeID: "A"}',
        'Create {type: "View", nativeID: "H"}',
        ...(isLis
          ? [
              'Insert {type: "View", parentNativeID: "H", index: 0, nativeID: "A"}',
              'Insert {type: "View", parentNativeID: "G", index: 0, nativeID: "H"}',
            ]
          : [
              'Insert {type: "View", parentNativeID: "G", index: 0, nativeID: "H"}',
              'Insert {type: "View", parentNativeID: "H", index: 0, nativeID: "A"}',
            ]),
      ]);

      // A moves one level down and gains a sibling: G* -> H* -> I* -> J -> [B*, A*]
      render(
        view(
          { nativeID: 'G' },
          view(
            { nativeID: 'H' },
            view(
              { nativeID: 'I' },
              view({}, keyed('B'), keyed('A', { style: { width: 100 } })),
            ),
          ),
        ),
      );

      expect(rendered(KEYS)).toEqual([
        rnView(
          { nativeID: 'G' },
          rnView(
            { nativeID: 'H' },
            rnView(
              { nativeID: 'I' },
              rnView({ nativeID: 'B' }),
              rnView({ nativeID: 'A', width: '100' }),
            ),
          ),
        ),
      ]);
      expect(takeLogs()).toEqual([
        'Remove {type: "View", parentNativeID: "H", index: 0, nativeID: "A"}',
        'Create {type: "View", nativeID: "I"}',
        'Create {type: "View", nativeID: "B"}',
        ...(isLis
          ? [
              'Insert {type: "View", parentNativeID: "I", index: 0, nativeID: "B"}',
              'Insert {type: "View", parentNativeID: "I", index: 1, nativeID: "A"}',
              'Insert {type: "View", parentNativeID: "H", index: 0, nativeID: "I"}',
            ]
          : [
              'Insert {type: "View", parentNativeID: "H", index: 0, nativeID: "I"}',
              'Insert {type: "View", parentNativeID: "I", index: 0, nativeID: "B"}',
              'Insert {type: "View", parentNativeID: "I", index: 1, nativeID: "A"}',
            ]),
      ]);

      // One more level down, the order of A and B swapped: G* -> H* -> I* -> J* -> [A*, B*]
      render(
        view(
          { nativeID: 'G' },
          view(
            { nativeID: 'H' },
            view(
              { nativeID: 'I' },
              view(
                { nativeID: 'J' },
                keyed('A', { style: { width: 100 } }),
                keyed('B'),
              ),
            ),
          ),
        ),
      );

      expect(rendered(KEYS)).toEqual([
        rnView(
          { nativeID: 'G' },
          rnView(
            { nativeID: 'H' },
            rnView(
              { nativeID: 'I' },
              rnView(
                { nativeID: 'J' },
                rnView({ nativeID: 'A', width: '100' }),
                rnView({ nativeID: 'B' }),
              ),
            ),
          ),
        ),
      ]);
      expect(takeLogs()).toEqual([
        'Remove {type: "View", parentNativeID: "I", index: 1, nativeID: "A"}',
        'Remove {type: "View", parentNativeID: "I", index: 0, nativeID: "B"}',
        'Create {type: "View", nativeID: "J"}',
        ...(isLis
          ? [
              'Insert {type: "View", parentNativeID: "J", index: 0, nativeID: "A"}',
              'Insert {type: "View", parentNativeID: "J", index: 1, nativeID: "B"}',
              'Insert {type: "View", parentNativeID: "I", index: 0, nativeID: "J"}',
            ]
          : [
              'Insert {type: "View", parentNativeID: "I", index: 0, nativeID: "J"}',
              'Insert {type: "View", parentNativeID: "J", index: 0, nativeID: "A"}',
              'Insert {type: "View", parentNativeID: "J", index: 1, nativeID: "B"}',
            ]),
      ]);
    });

    it('switches parent-child from unflattened-flattened to flattened-unflattened', () => {
      const red = { ...BOX, backgroundColor: 'red' };

      render(opacityPair(0, undefined, red));

      expect(takeLogs()).toEqual([
        'Update {type: "RootView", nativeID: (root)}',
        CREATE_ANON,
        'Create {type: "View", nativeID: "child"}',
        INSERT_CHILD_UNDER_ANON,
        INSERT_ANON_UNDER_ROOT,
      ]);

      render(opacityPair(undefined, 0, red));

      expect(takeLogs()).toEqual([
        UPDATE_CHILD,
        REMOVE_CHILD,
        REMOVE_ANON_UNDER_ROOT,
        'Delete {type: "View", nativeID: (N/A)}',
        CREATE_ANON,
        INSERT_CHILD_UNDER_ANON,
        INSERT_ANON_UNDER_ROOT,
      ]);
    });

    it('switches parent-child from flattened-unflattened to unflattened-flattened', () => {
      render(opacityPair(undefined, 0, BOX));

      expect(takeLogs()).toEqual([
        'Update {type: "RootView", nativeID: (root)}',
        CREATE_ANON,
        'Create {type: "View", nativeID: "child"}',
        INSERT_CHILD_UNDER_ANON,
        INSERT_ANON_UNDER_ROOT,
      ]);

      render(opacityPair(0, undefined, BOX));

      expect(takeLogs()).toEqual(
        isLis
          ? [
              UPDATE_CHILD,
              REMOVE_ANON_UNDER_ROOT,
              REMOVE_CHILD,
              'Delete {type: "View", nativeID: (N/A)}',
              CREATE_ANON,
              INSERT_CHILD_UNDER_ANON,
              INSERT_ANON_UNDER_ROOT,
            ]
          : [
              UPDATE_CHILD,
              REMOVE_ANON_UNDER_ROOT,
              REMOVE_CHILD,
              'Delete {type: "View", nativeID: (N/A)}',
              CREATE_ANON,
              INSERT_ANON_UNDER_ROOT,
              INSERT_CHILD_UNDER_ANON,
            ],
      );
    });

    it('does not flatten a view with the rgba(255,255,255,127/256) background (#51378)', () => {
      render(
        createElement('view', {
          style: {
            width: 100,
            height: 100,
            backgroundColor: `rgba(255, 255, 255, ${127 / 256})`,
          },
        }),
      );

      expect(takeLogs()).toEqual([
        'Update {type: "RootView", nativeID: (root)}',
        CREATE_ANON,
        INSERT_ANON_UNDER_ROOT,
      ]);
      expect(rendered(['width', 'height', 'backgroundColor'])).toEqual([
        rnView({
          width: '100',
          height: '100',
          backgroundColor: 'rgba(255, 255, 255, 0.498039)',
        }),
      ]);
    });
  });
}
