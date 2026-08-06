// Co-located Vue-driven test (ADR 0025) for useCalendars. See use-locales' test for the shared
// rationale.

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { CalendarIdentifier, Weekday, type Calendar } from '../../../core/types';
import { useCalendars } from './index';

const ROOT_TAG = 9955;

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

vi.mock('../../../core', () => ({
  addCalendarListener: (listener: () => void) => addListenerMock(listener),
  getCalendars: () => getCalendarsMock(),
}));

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getCalendarsMock.mockClear();
  getCalendarsMock.mockReturnValue(FAKE_CALENDARS_INITIAL);
});

afterEach(() => unmount(ROOT_TAG));

function mountCalendars(): Ref<Calendar[]> {
  let calendars: Ref<Calendar[]> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        calendars = useCalendars();
        return () => h('symbiote-text', {}, 'calendars');
      },
    }),
  );
  if (calendars === undefined) {
    throw new Error('setup() did not run');
  }
  return calendars;
}

describe('useCalendars (Vue)', () => {
  it('reads the current calendars synchronously at setup', () => {
    const calendars = mountCalendars();

    expect(calendars.value).toEqual(FAKE_CALENDARS_INITIAL);
  });

  it('recomputes the ref when the native listener fires', () => {
    const calendars = mountCalendars();

    getCalendarsMock.mockReturnValue(FAKE_CALENDARS_UPDATED);
    registeredListener?.();

    expect(calendars.value).toEqual(FAKE_CALENDARS_UPDATED);
  });

  it('removes the subscription on unmount', () => {
    mountCalendars();
    unmount(ROOT_TAG);

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
