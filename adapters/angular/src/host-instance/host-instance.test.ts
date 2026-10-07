// `hostNodeOf` сводит любую Angular-ссылку на host-элемент к узлу движка

import '@angular/compiler';
import { Component, ElementRef } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getNativeTag, isSymbioteNode } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { ViewHost } from '../primitives';
import { findNodeHandle, hostNodeOf } from '.';

const ROOT_TAG = 906;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'host-instance-fixture',
  standalone: true,
  imports: [ViewHost],
  template: `<view testID="target"></view>`,
})
class HostFixture {}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

async function mountedNode() {
  mount(ROOT_TAG, HostFixture);
  await tick();
  const found = live.findLive(
    live.appRoot(),
    candidate => candidate.payload.testID === 'target',
  );
  if (found === undefined) throw new Error('fixture view was not committed');
  return found.handle;
}

describe('hostNodeOf (Positive)', () => {
  it('returns an engine node as is', async () => {
    const node = await mountedNode();

    expect(isSymbioteNode(node)).toBe(true);
    expect(hostNodeOf(node)).toBe(node);
  });

  it('unwraps an ElementRef to the engine node', async () => {
    const node = await mountedNode();
    const ref = new ElementRef(node);

    expect(hostNodeOf(ref)).toBe(node);
    expect(findNodeHandle(ref)).toBe(getNativeTag(node));
  });

  it('unwraps an object that exposes the node as nativeElement', async () => {
    const node = await mountedNode();

    expect(hostNodeOf({ nativeElement: node })).toBe(node);
  });
});

describe('hostNodeOf (Negative)', () => {
  it('reports null for missing and foreign values', () => {
    expect(hostNodeOf(null)).toBeNull();
    expect(hostNodeOf(undefined)).toBeNull();
    expect(hostNodeOf({})).toBeNull();
    expect(hostNodeOf(42)).toBeNull();
  });
});
