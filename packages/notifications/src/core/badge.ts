// Ported from expo-notifications @ sdk-57's getBadgeCountAsync.ts / setBadgeCountAsync.ts.
//
// ponytail: upstream's `SetBadgeCountOptions.web` (a `badgin` options bag) is web-only and this
// project targets iOS/Android — not ported.
import { UnavailabilityError } from 'expo-modules-core';

import { badgeModule } from './native-modules';

/** Current app-icon badge count. `0` if unset — not every Android launcher supports badges. */
export async function getBadgeCountAsync(): Promise<number> {
  if (!badgeModule.getBadgeCountAsync) {
    throw new UnavailabilityError('Notifications', 'getBadgeCountAsync');
  }
  return badgeModule.getBadgeCountAsync();
}

/**
 * Sets the app-icon badge. `0` clears it. On iOS this needs the `allowBadge` permission
 * (`requestPermissionsAsync`) or it resolves to `false`.
 */
export async function setBadgeCountAsync(badgeCount: number): Promise<boolean> {
  if (!badgeModule.setBadgeCountAsync) {
    throw new UnavailabilityError('Notifications', 'setBadgeCountAsync');
  }
  return badgeModule.setBadgeCountAsync(badgeCount);
}
