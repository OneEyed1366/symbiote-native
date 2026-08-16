// Integration coverage: run the real Angular runtime (createComponent + RendererFactory2)
// over the headless fake Fabric slot. Unlike renderer.test.ts, this proves mount() wires
// Angular's bootstrap to the Symbiote renderer, so a standalone template paints and updates
// through the engine.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './index';

const ROOT_TAG = 808;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const drainAngularAndCommit = async (): Promise<void> => {
  await tick();
  await tick();
};

class TestView {}
Component({
  selector: 'symbiote-view',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestView);

class TestText {}
Component({
  selector: 'symbiote-text',
  standalone: true,
  template: '<ng-content></ng-content>',
})(TestText);

class SmokeComponent {
  name = 'Angular';
  count = 0;
  boxStyle = { padding: 12 };

  increment(): void {
    this.count += 1;
  }
}

Component({
  selector: 'symbiote-angular-smoke',
  standalone: true,
  imports: [TestView, TestText],
  template: `<symbiote-view [style]="boxStyle"><symbiote-text>Hello {{ name }}</symbiote-text><symbiote-view testID="counter" (press)="increment()"><symbiote-text>tapped {{ count }}×</symbiote-text></symbiote-view></symbiote-view>`,
})(SmokeComponent);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// A plain (non-OnPush) child component compiles as SignalView in Angular 20+, so an UNTOUCHED
// sibling child is skipped by the per-view CheckAlways/Dirty/RefreshView gate inside
// detectChangesInView — true with or without ApplicationRef (the gate lives inside
// detectChangesInView regardless of who calls it). This is NOT a claim that the root's own
// template is spared: markViewDirty (used by both native (event) bindings and
// ChangeDetectorRef.markForCheck(), see SymbioteHostPropsDirective) unconditionally sets
// RefreshView on every ancestor up to the root — a press anywhere always re-runs the root's
// own template, in every Angular app, regardless of scheduler. What this guards is narrower
// but still real: a SIBLING component with no dirty descendant of its own must not be dragged
// along for the ride.
let unrelatedRenderCount = 0;
class CounterChild {
  count = 0;

  increment(): void {
    this.count += 1;
  }
}
Component({
  selector: 'counter-child',
  standalone: true,
  imports: [TestView, TestText],
  template:
    '<symbiote-view testID="counter" (press)="increment()"><symbiote-text>tapped {{ count }}×</symbiote-text></symbiote-view>',
})(CounterChild);

class UnrelatedSiblingChild {
  trackRender(): number {
    unrelatedRenderCount++;
    return unrelatedRenderCount;
  }
}
Component({
  selector: 'unrelated-sibling-child',
  standalone: true,
  template: '<symbiote-text>unrelated {{ trackRender() }}</symbiote-text>',
})(UnrelatedSiblingChild);

class TargetedComponent {}
Component({
  selector: 'symbiote-angular-targeted',
  standalone: true,
  imports: [TestView, CounterChild, UnrelatedSiblingChild],
  template: `<symbiote-view><counter-child /><unrelated-sibling-child /></symbiote-view>`,
})(TargetedComponent);

class InitialPropsComponent {
  greeting = 'unset';
}
Component({
  selector: 'symbiote-angular-initial-props',
  standalone: true,
  imports: [TestText],
  inputs: ['greeting'],
  template: '<symbiote-text>{{ greeting }}</symbiote-text>',
})(InitialPropsComponent);

// mount() has no throwing path of its own (Angular bootstrap errors surface through the
// provided ErrorHandler, not a thrown mount() call) — Positive is the only group. Grouped by
// the three things render.ts's own header/comments claim it does: bootstrap a tree, drive CD
// off native events, and isolate unrelated siblings. `wrapperComponent`
// (AppRegistry's setWrapperComponentProvider seam) is covered by
// modules/app-registry/app-registry.test.ts's "projects the root component into a registered
// wrapper via <ng-content>" — not duplicated here.
describe('Angular mount', () => {
  it('bootstraps a standalone component into a committed Fabric tree', async () => {
    mount(ROOT_TAG, SmokeComponent);
    await tick();

    const root = fabric.appRoot();
    expect(fabric.serialize(root.children)).toBe(
      'RCTView(RCTText(RCTRawText "Hello Angular")RCTView(RCTText(RCTRawText "tapped 0×")))',
    );
    expect(root.children[0]?.props).toMatchObject({ padding: 12 });
  });

  // why: mount() provides the real ChangeDetectionSchedulerImpl + zoneless bundle (render.ts's
  // own long comment on `provideZonelessChangeDetectionInternal`) instead of forcing
  // `detectChanges()` on every tick — this proves that swap still leaves the ordinary
  // native-event -> markForCheck -> repaint loop working end to end, not just that the
  // scheduler is wired.
  it('runs Angular change detection after a native press and recommits text', async () => {
    mount(ROOT_TAG, SmokeComponent);
    await tick();

    const counter = fabric.find(node => node.props.testID === 'counter');
    expect(counter).toBeDefined();

    fabric.fireEvent(counter?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchEnd');
    await drainAngularAndCommit();

    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 1×"');
  });

  // why: see the file-level comment above CounterChild/UnrelatedSiblingChild — a real
  // ApplicationRef.tick() must respect Angular's per-view CheckAlways/Dirty/RefreshView gate for
  // an untouched sibling branch, or every native press would silently degrade into re-checking
  // the whole tree (defeating the point of the zoneless scheduler swap).
  it('does not re-check a sibling child component on a press inside a different child', async () => {
    unrelatedRenderCount = 0;
    mount(ROOT_TAG, TargetedComponent);
    await tick();

    const afterFirstPaint = unrelatedRenderCount;
    expect(afterFirstPaint).toBeGreaterThan(0);

    const counter = fabric.find(node => node.props.testID === 'counter');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchEnd');
    await drainAngularAndCommit();

    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 1×"');
    // UnrelatedSiblingChild has no dirty descendant of its own, so it must not be re-checked
    // just because CounterChild (a completely separate branch) got pressed. This does NOT prove
    // the root's own template stays untouched — the root's template still re-runs on every
    // press (see render.ts).
    expect(unrelatedRenderCount).toBe(afterFirstPaint);
  });

  // why: IMountOptions.initialProps (render.ts's applyInputs) is the ONLY way a native host
  // hands the root component data at mount time — AppRegistry threads `appParameters.
  // initialProps` through it too (modules/app-registry/index.ts), so a regression here breaks
  // every app that passes launch params. Untested before this rewrite.
  it('applies IMountOptions.initialProps to the root component via setInput', async () => {
    mount(ROOT_TAG, InitialPropsComponent, { initialProps: { greeting: 'from native' } });
    await tick();

    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "from native"');
  });

  // why: mount()'s own header comment states "A re-mount on a live rootTag starts clean;
  // otherwise the stale app double-drives the surface" — the bridgeless host re-mounts on the
  // SAME rootTag on Fast Refresh and focus/lifecycle changes WITHOUT calling unmount() first
  // (that's the whole point of mount() calling teardown() itself). If that internal teardown
  // ever silently no-oped, the previous app's incremented state would survive into the "fresh"
  // remount instead of the new instance starting from its own initial state.
  it('tears down a stale app before re-mounting the same live rootTag', async () => {
    mount(ROOT_TAG, SmokeComponent);
    await tick();
    const counter = fabric.find(node => node.props.testID === 'counter');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchEnd');
    await drainAngularAndCommit();
    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 1×"');

    // Re-mount the SAME rootTag WITHOUT an intervening unmount() call.
    mount(ROOT_TAG, SmokeComponent);
    await tick();
    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 0×"');
  });

  // why: `global.RN$stopSurface` is the JSI hook C++ calls to stop a Fabric surface (render.ts's
  // installStopSurfaceGlobal comment) — Fast Refresh and focus/lifecycle changes drive teardown
  // through THIS path, not a direct `unmount()` call from JS. It must reach the exact same
  // `teardown()` as the public `unmount` export, proven the same way as the previous test: a
  // fresh re-mount on the stopped rootTag must start from initial state, not resume the old app.
  it('global.RN$stopSurface tears down the surface exactly like unmount()', async () => {
    mount(ROOT_TAG, SmokeComponent);
    await tick();
    const counter = fabric.find(node => node.props.testID === 'counter');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchStart');
    fabric.fireEvent(counter?.instanceHandle, 'topTouchEnd');
    await drainAngularAndCommit();
    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 1×"');

    expect(globalThis.RN$stopSurface).toBeTypeOf('function');
    globalThis.RN$stopSurface?.(ROOT_TAG);

    mount(ROOT_TAG, SmokeComponent);
    await tick();
    expect(fabric.serialize(fabric.appRoot().children)).toContain('RCTRawText "tapped 0×"');
  });
});
