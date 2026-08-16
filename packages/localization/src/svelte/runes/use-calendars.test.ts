// Co-located Svelte-driven test (ADR 0025) for useCalendars. See use-locales' test for the
// shared rationale — the rune runs inside a REAL compiled .svelte component because $state/$effect
// require a real component context.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installFabric } from '@symbiote-native/test-utils';
import { CalendarIdentifier, Weekday, type Calendar } from '../../core/types';
import metroSvelteTransformer from '@symbiote-native/svelte/metro-svelte-transformer';

const {
  compileSvelteModuleFile,
}: { compileSvelteModuleFile: (src: string, filename: string) => string } = metroSvelteTransformer;

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_611;
const PROBE_OUT = join(__dirname, '.smoke-compiled-use-calendars-probe.mjs');
const RUNE_OUT = join(__dirname, '.smoke-compiled-use-calendars.svelte.mjs');

const FAKE_CALENDARS_INITIAL: Calendar[] = [
  {
    calendar: CalendarIdentifier.GREGORY,
    uses24hourClock: true,
    firstWeekday: Weekday.SUNDAY,
    timeZone: 'Europe/Warsaw',
  },
];

const FAKE_CALENDARS_UPDATED: Calendar[] = [
  {
    calendar: CalendarIdentifier.ISO8601,
    uses24hourClock: false,
    firstWeekday: Weekday.MONDAY,
    timeZone: 'America/New_York',
  },
];

let registeredListener: (() => void) | undefined;
const removeMock = vi.fn();
const addListenerMock = vi.fn((listener: () => void) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getCalendarsMock = vi.fn(() => FAKE_CALENDARS_INITIAL);

vi.mock('../../core', () => ({
  addCalendarListener: (listener: () => void) => addListenerMock(listener),
  getCalendars: () => getCalendarsMock(),
}));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getCalendarsMock.mockClear();
  getCalendarsMock.mockReturnValue(FAKE_CALENDARS_INITIAL);
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
  rmSync(RUNE_OUT, { force: true });
});

const COMPILE_OPTIONS = { generate: 'client', fragments: 'tree', css: 'external' } as const;

function compileRuneModule(): void {
  const source = readFileSync(join(__dirname, 'use-calendars.svelte.ts'), 'utf-8');
  writeFileSync(RUNE_OUT, compileSvelteModuleFile(source, 'use-calendars.svelte.ts'));
}

async function loadProbe(): Promise<Component> {
  compileRuneModule();
  const result = compile(
    `<script lang="ts">
       import { useCalendars } from './.smoke-compiled-use-calendars.svelte.mjs';
       import type { Calendar } from '../../core';
       let { onValue }: { onValue: (calendars: Calendar[]) => void } = $props();
       const calendars = useCalendars();
       $effect(() => { onValue(calendars.current); });
     </script>
     <symbiote-view p={{}} />`,
    { ...COMPILE_OPTIONS, filename: 'CalendarsProbe.svelte' },
  );
  writeFileSync(PROBE_OUT, result.js.code);
  const mod: unknown = await import(`file://${PROBE_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('CalendarsProbe.svelte produced no default export');
  }
  return mod.default as Component;
}

async function mountCalendars(values: Calendar[][]): Promise<void> {
  const Probe = await loadProbe();
  mount(ROOT_TAG, Probe, { onValue: (calendars: Calendar[]) => values.push(calendars) });
  await tick();
}

// No Negative group: getCalendars() is a synchronous native read with no guard clause — the
// effect only ever writes `calendars` from it (at mount, and again on each native event) or
// unsubscribes. Nothing here is meant to reject/throw.
describe('useCalendars (Svelte)', () => {
  describe('Positive — boxed value tracks a re-read on mount, the native listener, and unmount', () => {
    // why: calendar settings (24h clock, first weekday, time zone) can differ between when this
    // function was called and when its effect actually runs — re-reading on mount is what keeps
    // the very first value honest rather than trusting a possibly-stale call-time snapshot.
    it('reads the current calendars at rune-call time', async () => {
      const values: Calendar[][] = [];
      await mountCalendars(values);

      expect(values[0]).toEqual(FAKE_CALENDARS_INITIAL);
    });

    // why: calendar settings can change while the app is running (locale/region change) — the
    // rune exists to stay in sync with that live device signal, not just report a mount-time read.
    it('recomputes the state when the native listener fires', async () => {
      const values: Calendar[][] = [];
      await mountCalendars(values);

      getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
      registeredListener?.();
      await tick();

      expect(values[values.length - 1]).toEqual(FAKE_CALENDARS_UPDATED);
    });

    // why: a rune that outlives its subscription leaks a live native listener into a scope Svelte
    // already considers destroyed — the effect's teardown is what prevents that leak.
    it('removes the subscription on unmount', async () => {
      await mountCalendars([]);
      unmount(ROOT_TAG);

      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });
});
