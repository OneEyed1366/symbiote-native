// Co-located Solid test for createCalendars. See create-locales' test for the shared rationale
// (core mocked wholesale, `createRoot` + explicit dispose, why `remove()` really unregisters).
//
// No Negative group: getCalendars() is a synchronous, always-succeeding native read.

import { createRoot, type Accessor } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Calendar } from '../../core';
import { createCalendars } from './create-calendars';

const FAKE_CALENDARS_INITIAL: Calendar[] = [
  {
    calendar: null,
    uses24hourClock: true,
    firstWeekday: 2,
    timeZone: 'Europe/Warsaw',
  },
];

const FAKE_CALENDARS_UPDATED: Calendar[] = [
  {
    calendar: null,
    uses24hourClock: false,
    firstWeekday: 1,
    timeZone: 'America/Los_Angeles',
  },
];

let registeredListener: (() => void) | undefined;
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: () => void) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getCalendarsMock = vi.fn(() => FAKE_CALENDARS_INITIAL);

vi.mock('../../core', () => ({
  addCalendarListener: (listener: () => void) => addListenerMock(listener),
  getCalendars: () => getCalendarsMock(),
}));

function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

beforeEach(() => {
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getCalendarsMock.mockClear();
  getCalendarsMock.mockReturnValue(FAKE_CALENDARS_INITIAL);
});

describe('createCalendars (Solid)', () => {
  it('reads the current calendars synchronously at call time', () => {
    // why: getCalendars() is a synchronous native read — no "loading" gap, no sentinel.
    const { value: calendars, dispose } = inRoot(createCalendars);

    expect(calendars()).toEqual(FAKE_CALENDARS_INITIAL);

    dispose();
  });

  it('recomputes the accessor when the native listener fires', () => {
    // why: calendar settings (24-hour clock, first weekday, time zone) change while the app runs;
    // the accessor must re-read off the native invalidation event.
    const { value: calendars, dispose } = inRoot(createCalendars);

    getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
    registeredListener?.();

    expect(calendars()).toEqual(FAKE_CALENDARS_UPDATED);

    dispose();
  });

  it('is already subscribed before any effect has flushed', () => {
    // why: the listener is registered inline in the body, not deferred to onMounted/$effect, so
    // an event firing in the very same tick as the call cannot be missed.
    let calendars: Accessor<Calendar[]> | undefined;
    const dispose = createRoot(disposeRoot => {
      calendars = createCalendars();
      getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
      registeredListener?.();
      return disposeRoot;
    });

    expect(calendars?.()).toEqual(FAKE_CALENDARS_UPDATED);

    dispose();
  });

  it('unsubscribes on dispose', () => {
    // why: a listener that outlives its owner writes into a disposed scope forever.
    const { value: calendars, dispose } = inRoot(createCalendars);

    dispose();
    getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
    registeredListener?.();

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(calendars()).toEqual(FAKE_CALENDARS_INITIAL);
  });
});
