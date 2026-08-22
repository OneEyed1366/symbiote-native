// Regression coverage for the anchor-vs-real-content class bug (see pressable.test.ts for the
// full writeup): a `class="..."` written on SafeAreaView's OWN use site always resolves through
// Angular's addClass/removeClass onto its non-painting ANCHOR host, never onto the real committed
// symbiote-safe-area-view node — so the resolved style was silently lost until hostProps' `style`
// merged in anchorHostStyle(this.elementRef). SafeAreaView has no inner ViewChild (a single flat
// component, per index.ts's own comment), so unlike ScrollView/Switch there is only one anchor and
// one host to reconcile. No Negative group: hostProps is a pure prop fold with no throwing branch —
// resolveAccessibilityProps is exercised (and closed) by its own core/components test, N/A here.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { SafeAreaView } from './index';

const ROOT_TAG = 910;
const fabric = installFabric();

@Component({
  selector: 'symbiote-safe-area-view-host',
  standalone: true,
  imports: [SafeAreaView],
  template: `
    <SafeAreaView [testID]="'safe-area'" class="screen">
      <symbiote-text>Hello</symbiote-text>
    </SafeAreaView>
  `,
})
class SafeAreaViewHostFixture {}

// A class toggled AFTER mount, with no @Input of the SafeAreaView changing — the case that tells
// whether the memoized hostProps still tracks the anchor's class-derived style (see index.ts's
// ngDoCheck). The instance is captured so the flip is a plain field write + markForCheck, the way
// an app's own state change reaches the template.
let toggleFixture: SafeAreaViewToggleFixture | undefined;

@Component({
  selector: 'symbiote-safe-area-view-toggle-host',
  standalone: true,
  imports: [SafeAreaView],
  template: `
    <SafeAreaView [testID]="'safe-area'" [class.dark]="dark">
      <symbiote-text>Hello</symbiote-text>
    </SafeAreaView>
  `,
})
class SafeAreaViewToggleFixture {
  dark = false;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    toggleFixture = this;
  }

  enableDark(): void {
    this.dark = true;
    this.changeDetector.markForCheck();
  }
}

// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.
function committedNode(testID: string): IFakeNode | undefined {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const found = visit(root);
    if (found) return found;
  }
  return undefined;
}

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('SafeAreaView', () => {
  // why: without the anchorHostStyle merge, a class= on <SafeAreaView> silently paints nothing —
  // addClass toggles a token on the ANCHOR element only, and the anchor is never committed to Fabric.
  it('resolves a class= on the SafeAreaView use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['screen'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'navy' },
      },
    ]);

    mount(ROOT_TAG, SafeAreaViewHostFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'safe-area');
    expect(node?.props.backgroundColor).toBe('navy');
  });

  // why: hostProps is a memoized computed() keyed on a revision signal, and a class toggle never
  // appears in SimpleChanges — it reaches the anchor through the renderer's addClass. Without
  // index.ts's ngDoCheck bump the bag would keep the class it was built with, and an [ngClass]
  // that flips after mount would silently never repaint.
  it('picks up a class toggled after mount, with no @Input change', async () => {
    registerRules([
      {
        tokens: ['dark'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'black' },
      },
    ]);

    mount(ROOT_TAG, SafeAreaViewToggleFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(committedNode('safe-area')?.props.backgroundColor).toBeUndefined();

    toggleFixture?.enableDark();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(committedNode('safe-area')?.props.backgroundColor).toBe('black');
  });
});
