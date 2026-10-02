// Порт `utils/updateDevicePushTokenAsync.ts` из upstream sdk-57
import { applicationId } from '@symbiote-native/application';
import { dlog } from '@symbiote-native/engine';

import { computeNextBackoffInterval } from './backoff';
import { serverRegistrationModule } from './native-modules';
import {
  getDeviceIdAsync,
  getTypeOfToken,
  shouldUseDevelopmentNotificationService,
} from './token-metadata';
import type { IDevicePushToken } from './types';

const UPDATE_DEVICE_PUSH_TOKEN_URL =
  'https://exp.host/--/api/v2/push/updateDeviceToken';
const LAST_TOKEN_KEY = 'lastRegisteredDeviceToken';
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 2 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Повторная регистрация раз в 7 дней, т.к. сервер мог потерять запись об устройстве
const REGISTRATION_TTL_MS = 7 * MS_PER_DAY;

type IStoredTokenData = {
  deviceToken: string;
  appId: string | null;
  development: boolean;
  type: string;
  registeredAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoredTokenData(value: unknown): value is IStoredTokenData {
  return (
    isRecord(value) &&
    typeof value.deviceToken === 'string' &&
    typeof value.development === 'boolean' &&
    typeof value.type === 'string' &&
    typeof value.registeredAt === 'number'
  );
}

async function getLastRegisteredTokenDataAsync(): Promise<IStoredTokenData | null> {
  try {
    if (!serverRegistrationModule.getRegistrationInfoAsync) return null;
    const info = await serverRegistrationModule.getRegistrationInfoAsync();
    if (!info) return null;
    const stored: unknown = JSON.parse(info)?.[LAST_TOKEN_KEY];
    return isStoredTokenData(stored) ? stored : null;
  } catch {
    return null;
  }
}

async function setLastRegisteredTokenDataAsync(
  tokenData: IStoredTokenData,
): Promise<void> {
  try {
    if (
      !serverRegistrationModule.getRegistrationInfoAsync ||
      !serverRegistrationModule.setRegistrationInfoAsync
    ) {
      return;
    }
    const info = await serverRegistrationModule.getRegistrationInfoAsync();
    const existing = info ? JSON.parse(info) : {};
    existing[LAST_TOKEN_KEY] = tokenData;
    await serverRegistrationModule.setRegistrationInfoAsync(
      JSON.stringify(existing),
    );
  } catch {
    // Best-effort, при следующем запуске приложение зарегистрируется снова
  }
}

// Если проверка невозможна, считаем токен изменившимся (fail-open)
export async function hasDeviceTokenChangedAsync(
  token: IDevicePushToken,
): Promise<boolean> {
  try {
    const development = await shouldUseDevelopmentNotificationService();
    const lastTokenData = await getLastRegisteredTokenDataAsync();

    if (lastTokenData == null) return true;

    const age = Date.now() - lastTokenData.registeredAt;
    if (age < 0 || age >= REGISTRATION_TTL_MS) return true;

    return (
      token.data !== lastTokenData.deviceToken ||
      applicationId !== lastTokenData.appId ||
      development !== lastTokenData.development ||
      getTypeOfToken(token) !== lastTokenData.type
    );
  } catch {
    return true;
  }
}

// `true` значит запрос надо повторить
async function sendTokenOnceAsync(
  signal: AbortSignal,
  token: IDevicePushToken,
): Promise<boolean> {
  const [development, deviceId] = await Promise.all([
    shouldUseDevelopmentNotificationService(),
    getDeviceIdAsync(),
  ]);
  const type = getTypeOfToken(token);

  try {
    const response = await fetch(UPDATE_DEVICE_PUSH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: deviceId.toLowerCase(),
        development,
        deviceToken: token.data,
        appId: applicationId,
        type,
      }),
      signal,
    });

    if (!response.ok) {
      dlog(
        `[notifications] device push token update rejected: ${await response.text()}`,
      );
      return true;
    }

    await setLastRegisteredTokenDataAsync({
      deviceToken: token.data,
      appId: applicationId,
      development,
      type,
      registeredAt: Date.now(),
    });
    return false;
  } catch (error) {
    // Прерванный запрос может упасть с `AbortError` или нативной ошибкой отмены
    if (signal.aborted || (isRecord(error) && error.name === 'AbortError'))
      return false;

    console.warn(
      '[notifications] Error thrown while updating the device push token with the server:',
      error,
    );
    return true;
  }
}

export async function updateDevicePushTokenAsync(
  signal: AbortSignal,
  token: IDevicePushToken,
): Promise<void> {
  const backoffOptions = { maxBackoff: MAX_BACKOFF_MS };

  for (let retriesCount = 0; !signal.aborted; retriesCount += 1) {
    const shouldRetry = await sendTokenOnceAsync(signal, token);
    if (!shouldRetry || signal.aborted) return;

    const backoff = computeNextBackoffInterval(
      INITIAL_BACKOFF_MS,
      retriesCount,
      backoffOptions,
    );
    await new Promise<void>(resolve => setTimeout(resolve, backoff));
  }
}
