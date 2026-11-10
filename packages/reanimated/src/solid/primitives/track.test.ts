import { batch, createSignal } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-solid-composable';
import { trackReads } from './track';

describe('tracking reads in Solid', () => {
  it('tells of a change in a signal the read went through', () => {
    const [value, setValue] = createSignal(1);
    const onChange = vi.fn();
    renderComposable(() => trackReads(value, onChange));

    setValue(2);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is silent while nothing it read has changed', () => {
    const [value] = createSignal(1);
    const [other, setOther] = createSignal(1);
    const onChange = vi.fn();
    renderComposable(() => trackReads(value, onChange));

    setOther(2);

    expect(other()).toBe(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells once of many changes made in one batch', () => {
    const [value, setValue] = createSignal(1);
    const onChange = vi.fn();
    renderComposable(() => trackReads(value, onChange));

    batch(() => {
      setValue(2);
      setValue(3);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops telling once stopped', () => {
    const [value, setValue] = createSignal(1);
    const onChange = vi.fn();
    const rendered = renderComposable(() => trackReads(value, onChange));

    rendered.result()();
    setValue(2);

    expect(onChange).not.toHaveBeenCalled();
  });
});
