// Порт `DevicePushTokenAutoRegistration.fx.ts`, ресинк токена на сервер Expo
import { UnavailabilityError } from 'expo-modules-core';

import { addPushTokenListener, getDevicePushTokenAsync } from './device-token';
import { serverRegistrationModule } from './native-modules';
import { startAbortableRegistration } from './registration-abort';
import {
  hasDeviceTokenChangedAsync,
  updateDevicePushTokenAsync,
} from './update-device-push-token';
import type { IDevicePushToken } from './types';

export type IDevicePushTokenRegistration = {
  isEnabled: boolean;
};

async function updatePushTokenAsync(token: IDevicePushToken): Promise<void> {
  if (!(await hasDeviceTokenChangedAsync(token))) return;
  await updateDevicePushTokenAsync(startAbortableRegistration(), token);
}

function isEnabledRegistration(info: string | null | undefined): boolean {
  if (!info) return false;
  try {
    const registration: IDevicePushTokenRegistration | null = JSON.parse(info);
    return registration?.isEnabled === true;
  } catch (error) {
    console.warn(
      '[notifications] Error encountered while fetching registration information for auto token updates.',
      error,
    );
    return false;
  }
}

// Досылает токен, если регистрация включена, а сервер его не получил
export async function handlePersistedRegistrationInfoAsync(
  registrationInfo: string | null | undefined,
): Promise<void> {
  if (!isEnabledRegistration(registrationInfo)) return;

  try {
    // Регистрация включена, поэтому запрос "нового" токена безопасен
    await updatePushTokenAsync(await getDevicePushTokenAsync());
  } catch (error) {
    console.warn(
      '[notifications] Error encountered while updating server registration with latest device push token.',
      error,
    );
  }
}

let removeListener: (() => void) | null = null;

// Upstream ставит подписку при загрузке модуля, здесь явно, т.к. под `inlineRequires` barrel
// не гарантирует выполнение побочного эффекта
export function installPushTokenAutoRegistration(): () => void {
  if (removeListener) return removeListener;

  const getRegistrationInfoAsync =
    serverRegistrationModule.getRegistrationInfoAsync;
  if (!getRegistrationInfoAsync) {
    console.warn(
      '[notifications] Error encountered while fetching auto-registration state, new tokens will not be automatically registered on server.',
      new UnavailabilityError(
        'ServerRegistrationModule',
        'getRegistrationInfoAsync',
      ),
    );
    return () => undefined;
  }

  const subscription = addPushTokenListener(async token => {
    try {
      if (
        isEnabledRegistration(
          await serverRegistrationModule.getRegistrationInfoAsync?.(),
        )
      ) {
        await updatePushTokenAsync(token);
      }
    } catch (error) {
      console.warn(
        '[notifications] Error encountered while updating server registration with latest device push token.',
        error,
      );
    }
  });

  getRegistrationInfoAsync().then(
    handlePersistedRegistrationInfoAsync,
    error => {
      console.error(
        '[notifications] Error reading persisted server registration info: ',
        error,
      );
    },
  );

  removeListener = () => {
    subscription.remove();
    removeListener = null;
  };
  return removeListener;
}
