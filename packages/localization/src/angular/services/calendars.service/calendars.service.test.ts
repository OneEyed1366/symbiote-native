// Co-located Angular-driven test (ADR 0025) for CalendarsService. See locales.service.test.ts for
// the shared rationale.

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
    mount(ROOT_TAG, CalendarsHost);

    expect(capturedResult?.()).toEqual(FAKE_CALENDARS_INITIAL);
  });

  it('recomputes the signal when the registered listener fires', async () => {
    mount(ROOT_TAG, CalendarsHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
    capturedListener();

    expect(capturedResult?.()).toEqual(FAKE_CALENDARS_UPDATED);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, CalendarsHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
