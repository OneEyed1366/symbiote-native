import { getIosPushNotificationServiceEnvironmentAsync } from '@symbiote-native/application';
import { CodedError, Platform, UnavailabilityError } from 'expo-modules-core';

import { serverRegistrationModule } from './native-modules';
import type { IDevicePushToken } from './types';

export async function getDeviceIdAsync(): Promise<string> {
  try {
    if (!serverRegistrationModule.getInstallationIdAsync) {
      throw new UnavailabilityError('Notifications', 'getInstallationIdAsync');
    }
    return await serverRegistrationModule.getInstallationIdAsync();
  } catch (error) {
    throw new CodedError(
      'ERR_NOTIF_DEVICE_ID',
      `Could not fetch the installation ID of the application: ${error}.`,
    );
  }
}

export function getTypeOfToken(devicePushToken: IDevicePushToken): string {
  switch (devicePushToken.type) {
    case 'ios':
      return 'apns';
    case 'android':
      return 'fcm';
  }
}

export async function shouldUseDevelopmentNotificationService(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    try {
      return (
        (await getIosPushNotificationServiceEnvironmentAsync()) ===
        'development'
      );
    } catch {
      // Не смогли узнать окружение, считаем что не development
    }
  }
  return false;
}
