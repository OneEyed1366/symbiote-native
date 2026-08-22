// Co-located unit test (ADR 0025) for the pure serialize/deserialize passthrough. No framework,
// no wiring - just the JSON-safe round trip and the deserialize-side runtime guard rejecting
// malformed persisted data (a corrupted AsyncStorage entry, a schema change across app versions).

import { describe, expect, it } from 'vitest';
import { deserializeNavigatorState, serializeNavigatorState } from './index';
import type { INavigatorState } from '../navigator-state';

describe('positive — a valid persisted state round-trips through JSON', () => {
  it('round-trips a navigator state through JSON', () => {
    const state: INavigatorState = {
      routes: [{ key: 'home-1', name: 'Home', params: { tab: 'feed' } }],
    };
    const roundTripped = deserializeNavigatorState(
      JSON.parse(JSON.stringify(serializeNavigatorState(state))),
    );
    expect(roundTripped).toEqual(state);
  });

  // why: JSON.stringify drops undefined-valued keys, so a route pushed with no params
  // legitimately arrives at deserialize as `{key, name}` with no `params` key at all - the guard
  // must accept that shape, not require every route to carry a literal `params` key.
  it('round-trips a route pushed without params (the undefined key is dropped by JSON)', () => {
    const state: INavigatorState = {
      routes: [{ key: 'menu-1', name: 'Menu', params: undefined }],
    };
    const roundTripped = deserializeNavigatorState(
      JSON.parse(JSON.stringify(serializeNavigatorState(state))),
    );
    expect(roundTripped).toEqual(state);
  });

  // why: `Array.isArray(value.routes) && value.routes.every(isRoute)` is vacuously true for an
  // empty array - a persisted state for a navigator that hasn't pushed anything yet is a real,
  // legal boundary, not a malformed payload.
  it('accepts a state with an empty routes array', () => {
    expect(deserializeNavigatorState({ routes: [] })).toEqual({ routes: [] });
  });
});

describe('negative — malformed persisted data is rejected with a specific error', () => {
  const ERROR_MESSAGE =
    'deserializeNavigatorState: persisted value is not a valid navigator state';

  it('rejects a payload missing the routes array', () => {
    expect(() => deserializeNavigatorState({ notRoutes: [] })).toThrow(
      ERROR_MESSAGE,
    );
  });

  it('rejects a payload whose routes are not route-shaped', () => {
    expect(() =>
      deserializeNavigatorState({ routes: [{ key: 'r1' }] }),
    ).toThrow(ERROR_MESSAGE);
  });

  it('rejects a route missing its name, key present', () => {
    expect(() =>
      deserializeNavigatorState({ routes: [{ key: 'r1', params: undefined }] }),
    ).toThrow(ERROR_MESSAGE);
  });

  it('rejects a non-object payload', () => {
    expect(() => deserializeNavigatorState('not a state')).toThrow(
      ERROR_MESSAGE,
    );
    expect(() => deserializeNavigatorState(null)).toThrow(ERROR_MESSAGE);
    expect(() => deserializeNavigatorState(undefined)).toThrow(ERROR_MESSAGE);
  });

  // why: isRecord (the shared guard - see core/guards.ts's own rationale comment) deliberately
  // excludes arrays, specifically so a malformed persisted value shaped like a bare `[]` fails
  // HERE with the guard's real error instead of passing this check and blowing up confusingly
  // deeper in on a missing `.routes` property.
  it('rejects a bare array payload, even though Array.isArray(value.routes) is what usually gates', () => {
    expect(() => deserializeNavigatorState([])).toThrow(ERROR_MESSAGE);
  });
});
