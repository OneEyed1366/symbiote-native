import { describe, expect, it } from 'vitest';
import { detectSymbioteFrameworkFromDependencies } from './detect-framework.js';

// `add`'s eligibility guard needs to tell "this is a @symbiote-native/* app" apart from "this is
// some other RN app that merely uses the same underlying framework" — detectFrameworkFromDependencies
// (existing) matches plain `react`/`vue`/etc. and can't make that distinction on its own.
describe('detectSymbioteFrameworkFromDependencies', () => {
  it('detects react via @symbiote-native/react', () => {
    expect(
      detectSymbioteFrameworkFromDependencies({
        '@symbiote-native/react': '1.0.0',
      }),
    ).toBe('react');
  });

  it('detects vue via @symbiote-native/vue', () => {
    expect(
      detectSymbioteFrameworkFromDependencies({
        '@symbiote-native/vue': '1.0.0',
      }),
    ).toBe('vue');
  });

  it('detects angular via @symbiote-native/angular', () => {
    expect(
      detectSymbioteFrameworkFromDependencies({
        '@symbiote-native/angular': '1.0.0',
      }),
    ).toBe('angular');
  });

  it('detects solid via @symbiote-native/solid', () => {
    expect(
      detectSymbioteFrameworkFromDependencies({
        '@symbiote-native/solid': '1.0.0',
      }),
    ).toBe('solid');
  });

  it('detects svelte via @symbiote-native/svelte', () => {
    expect(
      detectSymbioteFrameworkFromDependencies({
        '@symbiote-native/svelte': '1.0.0',
      }),
    ).toBe('svelte');
  });

  // The whole point of this function: a plain RN app using `react`/`vue`/etc. directly, with no
  // @symbiote-native/* adapter at all, must NOT be mistaken for a symbiote app.
  it('returns undefined for a plain (non-symbiote) RN app', () => {
    expect(
      detectSymbioteFrameworkFromDependencies({
        react: '19.0.0',
        'react-native': '0.86.0',
      }),
    ).toBe(undefined);
  });

  it('returns undefined when dependencies are empty', () => {
    expect(detectSymbioteFrameworkFromDependencies({})).toBe(undefined);
  });
});
