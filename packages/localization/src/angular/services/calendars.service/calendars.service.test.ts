// Co-located Angular-driven test (ADR 0025) for CalendarsService. See locales.service.test.ts
// for the shared rationale: `core` is mocked wholesale (the real getCalendars/addCalendarListener
// delegation is covered once in packages/localization/src/core/localization.test.ts), this file
// proves only connect()'s own read/subscribe/recompute/unsubscribe lifecycle.
//
// No Negative group: connect() has no guard clause or throwing path — getCalendars() is a
// synchronous, always-succeeding native read (unlike battery's async fetch, there is no "before
// resolve" state to seed a placeholder for).

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { CalendarIdentifier, Weekday, type Calendar } from '../../../core/types';
import { CalendarsService } from './index';

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

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const getCalendarsMock = vi.fn(() => FAKE_CALENDARS_INITIAL);

vi.mock('../../../core', () => ({
  addCalendarListener: (listener: () => void) => addListenerMock(listener),
  getCalendars: () => getCalendarsMock(),
}));

const ROOT_TAG = 975;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<Calendar[]> | undefined;
let capturedListener: (() => void) | undefined;

@Component({
  selector: 'symbiote-calendars-host',
  standalone: true,
  template: '',
})
class CalendarsHost {
  readonly calendars = inject(CalendarsService).connect();

  constructor() {
    capturedResult = this.calendars;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  getCalendarsMock.mockReturnValue(FAKE_CALENDARS_INITIAL);
  addListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('CalendarsService.connect', () => {
  it('reads the current calendars synchronously', () => {
    // why: unlike battery's async seed, getCalendars() is synchronous — the signal must hold
    // the real value on the very first read, with no "loading" gap at all.
    mount(ROOT_TAG, CalendarsHost);

    expect(capturedResult?.()).toEqual(FAKE_CALENDARS_INITIAL);
  });

  it('recomputes the signal when the registered listener fires', async () => {
    // why: calendar settings can change while the app runs (device settings change) — the
    // signal must re-read getCalendars() off the native invalidation event, not cache the
    // initial snapshot forever.
    mount(ROOT_TAG, CalendarsHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
    capturedListener();

    expect(capturedResult?.()).toEqual(FAKE_CALENDARS_UPDATED);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    // why: a leaked subscription keeps re-reading calendars for a signal no component observes,
    // and leaks the native listener — the effect's onCleanup must run on teardown.
    mount(ROOT_TAG, CalendarsHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
