// Framework-agnostic twin of expo-notifications' `determineNextResponse`, ported so every
// adapter's `useLastNotificationResponse` shares one dedup rule instead of five

import { describe, expect, it } from 'vitest';
import { determineNextResponse } from './last-notification-response';
import type { INotificationResponse } from './types';

function createResponse(identifier: string): INotificationResponse {
  return {
    notification: {
      date: 0,
      request: { identifier, content: {}, trigger: null },
    },
    actionIdentifier: 'default',
  } as unknown as INotificationResponse;
}

describe('determineNextResponse (Positive: dedups by notification request identifier)', () => {
  it('returns null when the new response is null', () => {
    const prev = createResponse('a');

    expect(determineNextResponse(prev, null)).toBeNull();
  });

  it('returns the new response when there is no previous response', () => {
    const next = createResponse('a');

    expect(determineNextResponse(undefined, next)).toBe(next);
    expect(determineNextResponse(null, next)).toBe(next);
  });

  it('returns the new response when its identifier differs from the previous one', () => {
    const prev = createResponse('a');
    const next = createResponse('b');

    expect(determineNextResponse(prev, next)).toBe(next);
  });

  it('keeps the previous response when the new one has the same identifier', () => {
    const prev = createResponse('a');
    const next = createResponse('a');

    expect(determineNextResponse(prev, next)).toBe(prev);
  });
});
