// Angular sticky headers paint but never move when `stickyHeaderIndices` arrives AFTER the first
// change-detection pass — the shape every real app has when the indices are derived from data
// (a SectionList's section offsets, a fetched list) rather than written as a template literal.
//
// The projection half self-heals: the wrapper IS created, with the right z-index, around the right
// child. What never happens is the NATIVE half — `attachSticky()` (shared.ts:757) runs only from
// `ngAfterViewInit` (shared.ts:750-753) and returns early while `hasStickyHeaders` is still false.
// Nothing calls it again when the indices land, so `addAnimatedEventToView` is never issued, the
// scroll AnimatedValue is never driven, and the pin has nothing to interpolate: a correctly-placed
// header frozen at its initial offset.
//
// Angular-only by construction. Svelte re-runs the attach from a `$effect` keyed on
// `nativeStickyAvailable` (adapters/svelte/src/components/scroll-view/index.svelte:168-173), React
// and Vue from their own effect/watcher deps — all three re-attach when the flag flips. Angular's
// once-only lifecycle hook does not.
//
// Asserted as native OPS, not as a rendered offset: the pin runs on the UI thread, so a headless
// tree assertion can never see the header move. `addAnimatedEventToView` is the one call that
// decides whether native has anything to drive.

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { setDeviceEventSource, type IEventSubscription } from '@symbiote-native/engine';
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
import { mount, unmount } from '../../render';
import { ScrollView } from './index.ios';

const ROOT_TAG = 934;
const PAST_DEBOUNCE_MS = 120;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Stand-in for RN's DeviceEventEmitter: native-animated streams value updates over this bus, and
// without it `startListeningToValue` cannot register at all.
const busListeners = new Map<string, Set<(payload: unknown) => void>>();

type IOp = { readonly method: string; readonly args: readonly unknown[] };
let ops: IOp[] = [];

function record(method: string, ...args: readonly unknown[]): void {
  ops.push({ method, args });
}

function opCount(method: string): number {
  return ops.filter(op => op.method === method).length;
}

// Indices that land after the first CD pass, read through a getter so the mounted instance and the
// test observe the same cell.
let lateIndices: number[] | undefined;

class LateStickyApp {
  get indices(): number[] | undefined {
    return lateIndices;
  }

  // Bound in the template purely so the ScrollView's onLayout prop is actually wired: an
  // EventEmitter nobody observes resolves to `undefined` (emitterCallback), the event routes
  // nowhere, and firing it would trigger no change detection at all.
  onLayout(): void {}
}
Component({
  selector: 'late-sticky-test',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [stickyHeaderIndices]="indices" (layout)="onLayout()">
      <symbiote-view testID="sticky"></symbiote-view>
      <symbiote-view testID="body"></symbiote-view>
    </ScrollView>
  `,
})(LateStickyApp);

class StaticStickyApp {
  onLayout(): void {}
}
Component({
  selector: 'static-sticky-test',
  standalone: true,
  imports: [ScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ScrollView [stickyHeaderIndices]="[0]" (layout)="onLayout()">
      <symbiote-view testID="sticky"></symbiote-view>
      <symbiote-view testID="body"></symbiote-view>
    </ScrollView>
  `,
})(StaticStickyApp);

beforeEach(() => {
  fabric.reset();
  ops = [];
  lateIndices = undefined;
  busListeners.clear();
  setDeviceEventSource({
    addListener(eventType: string, listener: (payload: unknown) => void): IEventSubscription {
      let set = busListeners.get(eventType);
      if (set === undefined) {
        set = new Set();
        busListeners.set(eventType, set);
      }
      set.add(listener);
      return {
        remove(): void {
          set?.delete(listener);
        },
      };
    },
  });
  Object.assign(globalThis, {
    nativeModuleProxy: {
      NativeAnimatedTurboModule: {
        createAnimatedNode: (tag: number, config: { type?: string }) =>
          record('createAnimatedNode', tag, config?.type),
        connectAnimatedNodes: () => record('connectAnimatedNodes'),
        disconnectAnimatedNodes: () => record('disconnectAnimatedNodes'),
        connectAnimatedNodeToView: (node: number, view: number) =>
          record('connectAnimatedNodeToView', node, view),
        disconnectAnimatedNodeFromView: () => record('disconnectAnimatedNodeFromView'),
        restoreDefaultValues: () => record('restoreDefaultValues'),
        dropAnimatedNode: () => record('dropAnimatedNode'),
        startAnimatingNode: () => record('startAnimatingNode'),
        stopAnimation: () => record('stopAnimation'),
        setAnimatedNodeValue: () => record('setAnimatedNodeValue'),
        setAnimatedNodeOffset: () => record('setAnimatedNodeOffset'),
        flattenAnimatedNodeOffset: () => record('flattenAnimatedNodeOffset'),
        extractAnimatedNodeOffset: () => record('extractAnimatedNodeOffset'),
        startListeningToAnimatedNodeValue: (tag: number) =>
          record('startListeningToAnimatedNodeValue', tag),
        stopListeningToAnimatedNodeValue: () => record('stopListeningToAnimatedNodeValue'),
        getValue: () => record('getValue'),
        addAnimatedEventToView: (view: number, eventName: string, mapping: unknown) =>
          record('addAnimatedEventToView', view, eventName, mapping),
        removeAnimatedEventFromView: () => record('removeAnimatedEventFromView'),
      },
    },
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'nativeModuleProxy');
});

function findLive(predicate: (node: IFakeNode) => boolean): IFakeNode | undefined {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (predicate(node)) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

function stickyWrapper(): IFakeNode | undefined {
  return findLive(node => node.props.zIndex === STICKY_HEADER_Z_INDEX);
}

function measureScrollView(): void {
  fabric.fireEvent(
    findLive(node => node.viewName === 'RCTScrollView')?.instanceHandle,
    'topLayout',
    { layout: { x: 0, y: 0, width: 320, height: 600 } },
  );
}

describe('Angular sticky headers — native scroll driver attach', () => {
  // why: the control. With the indices present at first CD everything wires up, which is what makes
  // the late case below a genuine regression rather than "sticky never worked on Angular".
  it('attaches the native scroll driver when the indices are there from the start', async () => {
    mount(ROOT_TAG, StaticStickyApp);
    await tick();
    await tick();

    expect(stickyWrapper(), 'the sticky wrapper must be projected').toBeDefined();
    expect(opCount('addAnimatedEventToView')).toBe(1);
  });

  // why: THE bug. The wrapper appears, so everything visible says the feature is on; only the
  // native driver is missing, so the header sits at the right place and never moves.
  it('attaches the native scroll driver when the indices arrive later', async () => {
    mount(ROOT_TAG, LateStickyApp);
    await tick();
    await tick();

    expect(stickyWrapper(), 'no wrapper yet: no indices').toBeUndefined();

    lateIndices = [0];
    measureScrollView();
    await tick();
    await tick();
    await wait(PAST_DEBOUNCE_MS);
    await tick();

    // The projection half self-heals.
    expect(stickyWrapper(), 'the wrapper is projected once the indices land').toBeDefined();
    // The native half does not: attachSticky() only ever ran from ngAfterViewInit.
    expect(opCount('addAnimatedEventToView')).toBe(1);
  });
});
