import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import {
  reactiveBox,
  renderComposable,
} from '../../../test-support/render-svelte-composable.svelte';
import { trackReads } from './track.svelte';

describe('tracking reads in Svelte', () => {
  it('tells of a change in a rune the read went through', () => {
    const box = reactiveBox(1);
    const onChange = vi.fn();
    renderComposable(() => trackReads(() => box.value, onChange));

    box.value = 2;
    flushSync();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is silent while nothing it read has changed', () => {
    const box = reactiveBox(1);
    const other = reactiveBox(1);
    const onChange = vi.fn();
    renderComposable(() => trackReads(() => box.value, onChange));

    other.value = 2;
    flushSync();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells once of many changes made before the next flush', () => {
    const box = reactiveBox(1);
    const onChange = vi.fn();
    renderComposable(() => trackReads(() => box.value, onChange));

    box.value = 2;
    box.value = 3;
    flushSync();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops telling once stopped', () => {
    const box = reactiveBox(1);
    const onChange = vi.fn();
    const rendered = renderComposable(() =>
      trackReads(() => box.value, onChange),
    );

    rendered.result()();
    box.value = 2;
    flushSync();

    expect(onChange).not.toHaveBeenCalled();
  });
});
