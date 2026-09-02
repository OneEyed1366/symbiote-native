// HOST_VIEW / HOST_TEXT are the last second encoding of the lowering spec's tag map. They stay
// literals here because `hostComponent` and every adapter-internal `h(HOST_VIEW, …)` want the
// literal type, and the spec types `intrinsic` as a plain `string`. That is a deliberate
// duplication, so it needs a guard: if the spec ever renames a tag, the transforms follow it
// automatically and these two do not, and the mismatch is a lowered element the renderer maps to
// one tag while our own components emit another — two view names for one primitive, visible only
// as a wrong native view on device.
//
// The spec also carries tags this adapter has no wrapper for (none today), so the assertion runs
// per known name rather than comparing the two sets whole.

import { describe, expect, it } from 'vitest';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { HOST_TEXT, HOST_VIEW } from './components';

describe('host primitive tags', () => {
  it('match the shared lowering spec', () => {
    expect(HOST_VIEW).toBe(HOST_PRIMITIVES.View?.intrinsic);
    expect(HOST_TEXT).toBe(HOST_PRIMITIVES.Text?.intrinsic);
  });
});
