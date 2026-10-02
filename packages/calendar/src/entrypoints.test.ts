import { describe, expect, it, vi } from 'vitest';

// Mirrors upstream's own __tests__/Calendar-test.native.ts "entrypoints" describe block -
// both surfaces export their expected symbols, matching Expo's own default/legacy split.

vi.mock('./core/native-module', () => ({
  expoCalendarNext: {
    ExpoCalendar: class {},
    ExpoCalendarEvent: class {},
    ExpoCalendarReminder: class {},
    ExpoCalendarAttendee: class {},
    getSourcesSync: vi.fn(),
    requestCalendarPermissions: vi.fn(),
    getCalendarPermissions: vi.fn(),
    requestRemindersPermissions: vi.fn(),
    getRemindersPermissions: vi.fn(),
  },
}));

vi.mock('./legacy/native-module', () => ({
  expoCalendar: {},
}));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

describe('entrypoints', () => {
  it('default entry exports the modern calendar classes', async () => {
    const root = await import('./core/index');
    expect(root.ExpoCalendar).toBeDefined();
    expect(root.ExpoCalendarEvent).toBeDefined();
    expect(root.ExpoCalendarReminder).toBeDefined();
    expect(root.ExpoCalendarAttendee).toBeDefined();
    expect(root.createCalendar).toBeDefined();
    expect(root.getCalendars).toBeDefined();
    expect(root.listEvents).toBeDefined();
  });

  it('/legacy entry exports the old function-based methods', async () => {
    const legacy = await import('./legacy/index');
    expect(legacy.createCalendarAsync).toBeDefined();
    expect(legacy.getEventsAsync).toBeDefined();
    expect(legacy.createEventAsync).toBeDefined();
    expect(legacy.getSourcesAsync).toBeDefined();
  });
});
