import { UnavailabilityError } from 'expo-modules-core';
import { expoIntentLauncher } from './native-module';
import type { IIntentLauncherParams, IIntentLauncherResult } from './types';
import { ActivityAction } from './types';

/** Starts the given Android activity, resolving once the user returns to this app */
export async function startActivityAsync(
  activityAction: ActivityAction | string,
  params: IIntentLauncherParams = {},
): Promise<IIntentLauncherResult> {
  if (!expoIntentLauncher.startActivity) {
    throw new UnavailabilityError('IntentLauncher', 'startActivityAsync');
  }
  if (!activityAction || typeof activityAction !== 'string') {
    throw new TypeError(
      "'activityAction' argument must be a non-empty string!",
    );
  }
  return expoIntentLauncher.startActivity(activityAction, params);
}

/** Opens another app by its package name, for example `com.google.android.gm` for Gmail */
export function openApplication(packageName: string): void {
  if (!expoIntentLauncher.openApplication) {
    throw new UnavailabilityError('IntentLauncher', 'openApplication');
  }
  return expoIntentLauncher.openApplication(packageName);
}

/** Resolves the target app's icon as a base64-encoded PNG data URI */
export async function getApplicationIconAsync(
  packageName: string,
): Promise<string> {
  if (!expoIntentLauncher.getApplicationIcon) {
    throw new UnavailabilityError('IntentLauncher', 'getApplicationIconAsync');
  }
  return expoIntentLauncher.getApplicationIcon(packageName);
}
