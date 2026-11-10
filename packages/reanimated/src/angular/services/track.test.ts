import { signal } from '@angular/core';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-angular-composable';
import { trackReads } from './track';

installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
let unmountTree = () => {};

afterEach(() => unmountTree());

async function render<Result>(composable: () => Result) {
  const rendered = await renderComposable(composable);
  unmountTree = rendered.unmount;
  return rendered;
}

describe('tracking reads in Angular', () => {
  it('tells of a change in a signal the read went through', async () => {
    const value = signal(1);
    const onChange = vi.fn();
    await render(() => trackReads(() => value(), onChange));

    value.set(2);
    await tick();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is silent while nothing it read has changed', async () => {
    const value = signal(1);
    const other = signal(1);
    const onChange = vi.fn();
    await render(() => trackReads(() => value(), onChange));

    other.set(2);
    await tick();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells once of many changes made before the next run', async () => {
    const value = signal(1);
    const onChange = vi.fn();
    await render(() => trackReads(() => value(), onChange));

    value.set(2);
    value.set(3);
    await tick();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops telling once stopped', async () => {
    const value = signal(1);
    const onChange = vi.fn();
    const rendered = await render(() => trackReads(() => value(), onChange));

    rendered.result()();
    value.set(2);
    await tick();

    expect(onChange).not.toHaveBeenCalled();
  });
});
