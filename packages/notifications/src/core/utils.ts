// Ported from expo-notifications @ sdk-57's utils/mapNotificationResponse.ts and
// hasValidTriggerObject.ts.
//
// ponytail: upstream's `warnOfExpoGoPushUsage` (warnOfExpoGoPushUsage.ts) checks
// `isRunningInExpoGo()` from the `expo` meta-package, which this project never depends on and
// never runs under (own Metro pipeline, dev-build only — see the `symbiote-expo-native-module`
// skill) — not ported, there is no Expo Go to warn about here.
import type {
  INotification,
  INotificationContent,
  INotificationRequest,
  INotificationResponse,
} from './types';

export function hasValidTriggerObject(trigger: unknown): boolean {
  if (trigger === null) return true;
  if (typeof trigger !== 'object') return false;
  return 'type' in trigger || 'channelId' in trigger;
}

let warnedAboutDataString = false;

// Native hands over a raw payload that may carry a legacy `dataString` field this package's own
// `INotificationContent` type does not declare — the one narrowing boundary for that dynamic
// extra field lives here, not scattered across call sites.
function readLegacyDataString(
  content: INotificationContent,
): string | undefined {
  const record: Record<string, unknown> = content;
  const dataString = record.dataString;
  return typeof dataString === 'string' ? dataString : undefined;
}

export function mapNotificationContent(
  content: INotificationContent,
): INotificationContent {
  try {
    const dataString = readLegacyDataString(content);
    if (typeof dataString === 'string') {
      const mapped: INotificationContent & { dataString?: string } = {
        ...content,
      };
      mapped.data = JSON.parse(dataString);
      Object.defineProperty(mapped, 'dataString', {
        get() {
          if (!warnedAboutDataString) {
            warnedAboutDataString = true;
            console.warn(
              '[notifications] reading dataString is deprecated, use data instead',
            );
          }
          return dataString;
        },
      });
      return mapped;
    }
  } catch (error) {
    console.error(
      `[notifications] Error parsing notification content: ${error}`,
    );
  }
  return content;
}

export function mapNotificationRequest(
  request: INotificationRequest,
): INotificationRequest {
  return { ...request, content: mapNotificationContent(request.content) };
}

export function mapNotification(notification: INotification): INotification {
  return {
    ...notification,
    request: mapNotificationRequest(notification.request),
  };
}

export function mapNotificationResponse(
  response: INotificationResponse,
): INotificationResponse {
  return { ...response, notification: mapNotification(response.notification) };
}
