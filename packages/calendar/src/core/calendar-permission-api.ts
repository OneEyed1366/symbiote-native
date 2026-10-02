// `methods` every adapter's `useCalendarPermissions` binds to the shared
// `@symbiote-native/{react,vue,solid,svelte}` `createPermissionHook` factory

import { getCalendarPermissions, requestCalendarPermissions } from './calendar';
import { splitWriteOnlyPermissionOptions } from '@symbiote-native/engine';

export type ICalendarPermissionMethodOptions = { writeOnly?: boolean };

export const calendarPermissionMethods = {
  getMethod: (options?: ICalendarPermissionMethodOptions) =>
    getCalendarPermissions(options?.writeOnly),
  requestMethod: (options?: ICalendarPermissionMethodOptions) =>
    requestCalendarPermissions(options?.writeOnly),
};

export const splitCalendarPermissionOptions = splitWriteOnlyPermissionOptions;
