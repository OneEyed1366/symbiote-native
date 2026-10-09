import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { stubCancelAnimationFrame } from '../../test-support/cancel-animation-frame';
import { installWrapperHost } from '../../test-support/wrapper-host';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../test-support/update-writes';
import { settle } from '../../test-support/worklet';
import { PerformanceMonitor } from './performance-monitor';
import '../register';

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

const host = installWrapperHost();
const ROOT_TAG = 17_001;
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  stubCancelAnimationFrame();
  vi.useFakeTimers();
  recordUpdateWrites(updateProps, writes);
});

afterEach(async () => {
  act(() => unmount(ROOT_TAG));
  await settle();
  vi.useRealTimers();
});

function textInputs() {
  return host.fabric.findAll(node => node.props.editable === false);
}

function writtenTexts(): string[] {
  return writes.flatMap(write =>
    typeof write.updates === 'object' &&
    write.updates !== null &&
    'text' in write.updates &&
    typeof write.updates.text === 'string'
      ? [write.updates.text]
      : [],
  );
}

describe('PerformanceMonitor', () => {
  it('shows a JS and a UI reading, neither editable', () => {
    act(() => mount(ROOT_TAG, createElement(PerformanceMonitor, {})));

    expect(textInputs()).toHaveLength(2);
  });

  // A frame every 16 ms of the mocked clock is 62.5 frames a second, shown rounded
  it('reports the UI frame rate once frames have been counted', async () => {
    act(() => mount(ROOT_TAG, createElement(PerformanceMonitor, {})));

    await settle();
    await vi.advanceTimersByTimeAsync(500);

    expect(writtenTexts()).toContain('UI: 63 ');
  });

  it('reports the JS frame rate once frames have been counted', async () => {
    act(() => mount(ROOT_TAG, createElement(PerformanceMonitor, {})));

    await settle();
    await vi.advanceTimersByTimeAsync(500);

    expect(writtenTexts()).toContain('JS: 63 ');
  });

  it('leaves no frame loop running once it is unmounted', async () => {
    act(() => mount(ROOT_TAG, createElement(PerformanceMonitor, {})));
    await settle();
    act(() => unmount(ROOT_TAG));
    await settle();

    expect(vi.getTimerCount()).toBe(0);
  });
});
