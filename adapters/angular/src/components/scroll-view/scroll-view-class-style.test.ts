// Regression test for the anchor/class bug: a composed component's own
// use-site `class="..."` resolves through Angular's addClass/removeClass onto the component's
// non-painting ANCHOR host (ANCHOR_HOST_COMPONENTS in renderer.ts), never onto the real Fabric
// node its own template renders — so the resolved style was silently lost. Fixed via
// anchorHostStyle(this.elementRef) merged into ScrollView's own scrollProps/androidWrappedScrollProps
// getters (see index.ios.ts / index.android.ts). Mirrors pressable.test.ts's "resolves a class=" case,
// covering BOTH platforms and the Android refresh-control-wrapped branch (androidWrappedScrollProps
// is a SEPARATE override from scrollProps, since it recomputes `style` from scratch rather than
// inheriting the base getter's result).
import '@angular/compiler';
import {
  ChangeDetectorRef,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  inject,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { RefreshControl } from '../refresh-control';
import { ScrollView as AndroidScrollView } from './index.android';
import { ScrollView as IOSScrollView } from './index.ios';

const ROOT_TAG = 950;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'symbiote-scroll-ios-class-host',
  standalone: true,
  imports: [IOSScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="card">
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class IOSScrollViewClassHost {}

@Component({
  selector: 'symbiote-scroll-android-class-host',
  standalone: true,
  imports: [AndroidScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="card">
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class AndroidScrollViewClassHost {}

@Component({
  selector: 'symbiote-scroll-android-wrapped-class-host',
  standalone: true,
  imports: [AndroidScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="card">
      <RefreshControl [refreshing]="true" (refresh)="refresh()" />
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class AndroidWrappedScrollViewClassHost {
  refresh = (): void => undefined;
}

@Component({
  selector: 'symbiote-scroll-android-wrapped-layout-class-host',
  standalone: true,
  imports: [AndroidScrollView, RefreshControl],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView class="box">
      <RefreshControl [refreshing]="true" (refresh)="refresh()" />
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class AndroidWrappedScrollViewLayoutClassHost {
  refresh = (): void => undefined;
}

// A class toggled AFTER mount with no @Input of the ScrollView changing — the case that separates
// "the bag reads the anchor" from "the bag still reads the anchor once it is memoized". The
// instance is captured so the flip is a plain field write + markForCheck, the way an app's own
// state change reaches the template.
let toggleHost: ScrollViewClassToggleHost | undefined;

@Component({
  selector: 'symbiote-scroll-class-toggle-host',
  standalone: true,
  imports: [IOSScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [class.card]="lit">
      <symbiote-view testID="cell"></symbiote-view>
    </ScrollView>
  `,
})
class ScrollViewClassToggleHost {
  lit = false;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    toggleHost = this;
  }

  light(): void {
    this.lit = true;
    this.changeDetector.markForCheck();
  }
}

// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount shows up only on the live clone in `fabric.committed`.
function committedScrollBackground(): unknown {
  const visit = (node: IFakeNode): unknown => {
    if (node.viewName === 'RCTScrollView') return node.props.backgroundColor;
    for (const child of node.children) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const found = visit(root);
    if (found !== undefined) return found;
  }
  return undefined;
}

beforeEach(() => {
  fabric.reset();
  registerRules([
    {
      tokens: ['card'],
      specificity: [0, 1, 0],
      order: 0,
      style: { backgroundColor: 'red' },
    },
    {
      tokens: ['box'],
      specificity: [0, 1, 0],
      order: 1,
      style: { flex: 1, height: 84 },
    },
  ]);
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('ScrollView anchor class= resolution', () => {
  // why: scrollProps is the iOS getter that merges anchorHostStyle(this.elementRef) with its own
  // resolved style — without that merge a class= at the use site addClass-toggles the non-painting
  // anchor and is silently lost, never reaching the real committed RCTScrollView.
  it('resolves a class= on the iOS ScrollView use site onto the real committed scroll host', async () => {
    mount(ROOT_TAG, IOSScrollViewClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(
      node,
      'a real Fabric node carries the class-derived style',
    ).toBeDefined();
  });

  // why: androidWrappedScrollProps is a SEPARATE override from scrollProps (it recomputes `style`
  // from scratch rather than inheriting the base getter), so the plain-Android (no refresh control)
  // branch needs its own proof the anchor merge still lands.
  it('resolves a class= on the Android ScrollView use site (no refresh control)', async () => {
    mount(ROOT_TAG, AndroidScrollViewClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(
      node,
      'a real Fabric node carries the class-derived style',
    ).toBeDefined();
  });

  // why: a projected RefreshControl wraps the Android scroll view in an outer native node —
  // the class-derived style must still reach a real committed node once that wrapper is present,
  // not just in the simpler no-refresh-control shape above.
  it('resolves a class= on the Android ScrollView use site wrapped by a projected RefreshControl', async () => {
    mount(ROOT_TAG, AndroidWrappedScrollViewClassHost);
    await tick();

    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(
      node,
      'a real Fabric node carries the class-derived style',
    ).toBeDefined();
  });

  // Regression for a real device bug distinct from the one above: a class-derived LAYOUT
  // property (flex/height/…) must reach the OUTER refresh-control wrapper via splitLayoutProps,
  // not just the inner scroll view — a class carrying only a color property (the test above)
  // never exercises this split at all, since color is never a layout key. Without
  // `layoutSplitStyle` feeding the anchor's style INTO the split (not tacked on after), the
  // wrapper never receives its flex/height share and collapses to zero size — the whole
  // ScrollView renders nothing on a real Android device. Mirrors the Vue adapter's identical
  // `layoutSplitStyle` fix (same root cause, same symptom).
  it('resolves a class-derived LAYOUT style onto the Android outer refresh-control wrapper', async () => {
    mount(ROOT_TAG, AndroidWrappedScrollViewLayoutClassHost);
    await tick();

    const wrapper = fabric.find(n => n.props.refreshing === true);
    expect(
      wrapper,
      'the outer refresh-control wrapper committed',
    ).toBeDefined();
    expect(wrapper?.props.flex).toBe(1);
    expect(wrapper?.props.height).toBe(84);
  });

  // why: `scrollProps` is a memoized computed() keyed on a revision signal, and a class toggle
  // never appears in SimpleChanges — it reaches the anchor through the renderer's addClass. Without
  // shared.ts's ngDoCheck poll of `anchorStyle` the bag would keep the class it was first built
  // with, so a [class.x]/[ngClass] that flips after mount would silently never repaint. Verified to
  // go red when that poll is removed.
  it('picks up a class toggled after mount, with no @Input change', async () => {
    mount(ROOT_TAG, ScrollViewClassToggleHost);
    await tick();
    expect(
      committedScrollBackground(),
      'nothing painted before the toggle',
    ).toBeUndefined();

    toggleHost?.light();
    await tick();

    expect(committedScrollBackground()).toBe('red');
  });
});
