// Hand-ported from .vendors/expo/packages/expo-cellular/src/Cellular.ts (sdk-57). Carrier/SIM
// info (ISO country code, carrier name, MCC/MNC) and allowsVoipAsync are Android-only upstream —
// each short-circuits to `null` on iOS before ever reaching the native module, since iOS exposes
// none of this. getPermissionsAsync/requestPermissionsAsync mirror that same split: Android
// delegates to the native module, every other platform needs no permission for cellular info at
// all and resolves a plain GRANTED literal. Upstream's web branch (navigator.connection) is out
// of scope — this repo has no web target for this package's native-module resolution path.
import {
  Platform,
  PermissionStatus,
  UnavailabilityError,
  type PermissionResponse,
} from 'expo-modules-core';
import { expoCellular } from './native-module';
import { CellularGeneration } from './types';

const NATIVE_MODULE_NAME = 'expo-cellular';

const GRANTED_PERMISSION_RESPONSE: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  expires: 'never',
  granted: true,
  canAskAgain: true,
};

/** Gets the generation of the device's current connection. */
export async function getCellularGenerationAsync(): Promise<CellularGeneration> {
  if (!expoCellular.getCellularGenerationAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'getCellularGenerationAsync',
    );
  }
  return expoCellular.getCellularGenerationAsync();
}

/**
 * Tells if the carrier of the SIM card allows to make VoIP calls on its network.
 * @deprecated This method is deprecated and will be removed in a future SDK version.
 * @platform android
 */
export async function allowsVoipAsync(): Promise<boolean | null> {
  if (Platform.OS === 'ios') {
    return null;
  }
  if (!expoCellular.allowsVoipAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'allowsVoipAsync');
  }
  return expoCellular.allowsVoipAsync();
}

/**
 * Gets the ISO country code of the current registered operator's MCC (Mobile Country Code).
 * @platform android
 */
export async function getIsoCountryCodeAsync(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return null;
  }
  if (!expoCellular.getIsoCountryCodeAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getIsoCountryCodeAsync');
  }
  return expoCellular.getIsoCountryCodeAsync();
}

/**
 * Gets the name of the user's cellular service provider.
 * @platform android
 */
export async function getCarrierNameAsync(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return null;
  }
  if (!expoCellular.getCarrierNameAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getCarrierNameAsync');
  }
  return expoCellular.getCarrierNameAsync();
}

/**
 * Gets the mobile country code (MCC) of the device's current registered operator.
 * @platform android
 */
export async function getMobileCountryCodeAsync(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return null;
  }
  if (!expoCellular.getMobileCountryCodeAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'getMobileCountryCodeAsync',
    );
  }
  return expoCellular.getMobileCountryCodeAsync();
}

/**
 * Gets the mobile network code (MNC) of the device's current registered operator.
 * @platform android
 */
export async function getMobileNetworkCodeAsync(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return null;
  }
  if (!expoCellular.getMobileNetworkCodeAsync) {
    throw new UnavailabilityError(
      NATIVE_MODULE_NAME,
      'getMobileNetworkCodeAsync',
    );
  }
  return expoCellular.getMobileNetworkCodeAsync();
}

/**
 * Checks user's permissions for accessing cellular information. Android only — iOS/web need no
 * permission for cellular info, so this always resolves granted there.
 */
export async function getPermissionsAsync(): Promise<PermissionResponse> {
  if (Platform.OS === 'android') {
    if (!expoCellular.getPermissionsAsync) {
      throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getPermissionsAsync');
    }
    return expoCellular.getPermissionsAsync();
  }
  return GRANTED_PERMISSION_RESPONSE;
}

/**
 * Asks the user to grant permissions for accessing cellular information. Android only — iOS/web
 * need no permission for cellular info, so this always resolves granted there.
 */
export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  if (Platform.OS === 'android') {
    if (!expoCellular.requestPermissionsAsync) {
      throw new UnavailabilityError(
        NATIVE_MODULE_NAME,
        'requestPermissionsAsync',
      );
    }
    return expoCellular.requestPermissionsAsync();
  }
  return GRANTED_PERMISSION_RESPONSE;
}
