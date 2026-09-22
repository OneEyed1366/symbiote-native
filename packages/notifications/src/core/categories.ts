// Ported from expo-notifications @ sdk-57's getNotificationCategoriesAsync.ts,
// setNotificationCategoryAsync.ts, deleteNotificationCategoryAsync.ts.
import { UnavailabilityError } from 'expo-modules-core';

import { notificationCategoriesModule } from './native-modules';
import type {
  INotificationAction,
  INotificationCategory,
  INotificationCategoryOptions,
} from './types';

/** Every registered notification category. */
export async function getNotificationCategoriesAsync(): Promise<
  INotificationCategory[]
> {
  if (!notificationCategoriesModule.getNotificationCategoriesAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'getNotificationCategoriesAsync',
    );
  }
  return notificationCategoriesModule.getNotificationCategoriesAsync();
}

/**
 * Registers a category of action buttons under `identifier`, referenced later via
 * `INotificationContentInput.categoryIdentifier`. Avoid `:`/`-` in `identifier`.
 */
export async function setNotificationCategoryAsync(
  identifier: string,
  actions: INotificationAction[],
  options?: INotificationCategoryOptions,
): Promise<INotificationCategory> {
  if (!notificationCategoriesModule.setNotificationCategoryAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'setNotificationCategoryAsync',
    );
  }
  return notificationCategoriesModule.setNotificationCategoryAsync(
    identifier,
    actions,
    options,
  );
}

/** Deletes a category. Resolves `false` if it did not exist. */
export async function deleteNotificationCategoryAsync(
  identifier: string,
): Promise<boolean> {
  if (!notificationCategoriesModule.deleteNotificationCategoryAsync) {
    throw new UnavailabilityError(
      'Notifications',
      'deleteNotificationCategoryAsync',
    );
  }
  return notificationCategoriesModule.deleteNotificationCategoryAsync(
    identifier,
  );
}
