// Co-located React-driven test (ADR 0025) for useCalendars. See use-locales' test for the shared
// rationale (mocks `core`, not expo-modules-core internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { CalendarIdentifier, Weekday, type Calendar } from '../../../core/types';
import { useCalendars } from './index';

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

const { addListener, getCalendars, remove } = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    addListener: vi.fn((_listener: () => void) => ({ remove })),
    getCalendars: vi.fn(),
    remove,
  };
});

vi.mock('../../../core', () => ({
  addCalendarListener: addListener,
  getCalendars,
}));

const ROOT_TAG = 955;

const results: Calendar[][] = [];

function Probe(): ReactElement {
  results.push(useCalendars());
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
  getCalendars.mockReturnValue(FAKE_CALENDARS_INITIAL);
});

afterEach(() => unmount(ROOT_TAG));

describe('useCalendars', () => {
  it('reads the current calendars synchronously on first render', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toEqual(FAKE_CALENDARS_INITIAL);
  });

  it('recomputes calendars when the native listener fires', async () => {
    mount(ROOT_TAG, createElement(Probe));

    const invalidate = addListener.mock.calls[0][0];
    getCalendars.mockReturnValue(FAKE_CALENDARS_UPDATED);
    invalidate();

    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(FAKE_CALENDARS_UPDATED));
  });

  it('unsubscribes from the native listener on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(remove).toHaveBeenCalledTimes(1);
  });
});
