import { nextTick, reactive } from '@vue/runtime-core';
import { describe, expect, it, vi } from 'vitest';
import { trackReads } from './track';

describe('tracking reads in Vue', () => {
  it('tells of a change in a reactive object the read went through', async () => {
    const props = reactive({ scale: 1 });
    const onChange = vi.fn();
    trackReads(() => props.scale, onChange);

    props.scale = 2;
    await nextTick();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is silent while nothing it read has changed', async () => {
    const props = reactive({ scale: 1, other: 1 });
    const onChange = vi.fn();
    trackReads(() => props.scale, onChange);

    props.other = 2;
    await nextTick();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('tells once of many changes made before the next tick', async () => {
    const props = reactive({ scale: 1 });
    const onChange = vi.fn();
    trackReads(() => props.scale, onChange);

    props.scale = 2;
    props.scale = 3;
    await nextTick();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reads once more after each change, so what it reads can move', async () => {
    const props = reactive({ useFirst: true, first: 1, second: 1 });
    const onChange = vi.fn();
    trackReads(() => (props.useFirst ? props.first : props.second), onChange);

    props.useFirst = false;
    await nextTick();
    props.second = 5;
    await nextTick();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('stops telling once stopped', async () => {
    const props = reactive({ scale: 1 });
    const onChange = vi.fn();
    const stop = trackReads(() => props.scale, onChange);

    stop();
    props.scale = 2;
    await nextTick();

    expect(onChange).not.toHaveBeenCalled();
  });
});
