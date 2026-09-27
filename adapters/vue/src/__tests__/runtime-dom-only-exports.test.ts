// runtime-helpers re-exports @vue/runtime-core only, so a runtime-dom-only export
// resolves to undefined unless this module grows its own (vShow/vModelText's history).
// useCssVars is a deliberate, deferred gap (see vue-adapter-gap-list reference).

import { describe, expect, it } from 'vitest';
import * as runtimeHelpers from '@symbiote-native/vue/runtime-helpers';

describe('vue runtime-dom-only exports through the Metro-rewritten "vue" import', () => {
  it('Transition has a native implementation', () => {
    expect(
      (runtimeHelpers as Record<string, unknown>).Transition,
    ).toBeDefined();
  });

  it('TransitionGroup has a native implementation', () => {
    expect(
      (runtimeHelpers as Record<string, unknown>).TransitionGroup,
    ).toBeDefined();
  });

  it('useCssVars is still missing (deferred, no CSS custom-property foundation yet)', () => {
    expect(
      (runtimeHelpers as Record<string, unknown>).useCssVars,
    ).toBeUndefined();
  });
});
