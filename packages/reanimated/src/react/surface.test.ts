import { describe, expect, it } from 'vitest';
import * as upstream from 'react-native-reanimated';
import * as ours from './index';

// What the entry does not carry yet, each with what stands in the way. The list only shrinks
const NOT_YET: Record<string, string> = {};

describe('the React entry', () => {
  it('carries every runtime export of upstream, but the ones listed as not yet', () => {
    const missing = Object.keys(upstream)
      .filter(name => !(name in ours) && !(name in NOT_YET))
      .sort();

    expect(missing).toEqual([]);
  });

  it('lists as not yet only what it really lacks', () => {
    const carried = Object.keys(NOT_YET).filter(name => name in ours);

    expect(carried).toEqual([]);
  });

  it('passes the animations through as the very same functions', () => {
    expect(ours.withTiming).toBe(upstream.withTiming);
    expect(ours.interpolate).toBe(upstream.interpolate);
    expect(ours.Easing).toBe(upstream.Easing);
  });

  it('carries its own hooks, not the upstream ones', () => {
    expect(ours.useSharedValue).not.toBe(upstream.useSharedValue);
    expect(ours.useAnimatedStyle).not.toBe(upstream.useAnimatedStyle);
  });

  it('carries a TextInput tag too, which the animated props of a text can be written to', () => {
    expect(ours.TextInput).toBe('text-input');
  });

  it('keeps the old name of useScrollOffset pointing at it', () => {
    expect(ours.useScrollViewOffset).toBe(ours.useScrollOffset);
  });
});
