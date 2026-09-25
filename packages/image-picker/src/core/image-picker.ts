import { CodedError, UnavailabilityError } from 'expo-modules-core';
import { expoImagePicker } from './native-module';
import { mapDeprecatedOptions } from './utils';
import type {
  ICameraPermissionResponse,
  IImagePickerErrorResult,
  IImagePickerOptions,
  IImagePickerResult,
  IMediaLibraryPermissionResponse,
} from './types';

function validateOptions(options: IImagePickerOptions): IImagePickerOptions {
  const { aspect, quality, videoMaxDuration } = options;
  if (aspect != null) {
    const [x, y] = aspect;
    if (x <= 0 || y <= 0) {
      throw new CodedError(
        'ERR_INVALID_ARGUMENT',
        `Invalid aspect ratio values ${x}:${y}. Provide positive numbers.`,
      );
    }
  }
  if (quality != null && (quality < 0 || quality > 1)) {
    throw new CodedError(
      'ERR_INVALID_ARGUMENT',
      `Invalid 'quality' value ${quality}. Provide a value between 0 and 1.`,
    );
  }
  if (videoMaxDuration != null && videoMaxDuration < 0) {
    throw new CodedError(
      'ERR_INVALID_ARGUMENT',
      `Invalid 'videoMaxDuration' value ${videoMaxDuration}. Provide a non-negative number.`,
    );
  }
  return options;
}

export async function getCameraPermissionsAsync(): Promise<ICameraPermissionResponse> {
  return expoImagePicker.getCameraPermissionsAsync();
}

export async function getMediaLibraryPermissionsAsync(
  writeOnly: boolean = false,
): Promise<IMediaLibraryPermissionResponse> {
  return expoImagePicker.getMediaLibraryPermissionsAsync(writeOnly);
}

export async function requestCameraPermissionsAsync(): Promise<ICameraPermissionResponse> {
  return expoImagePicker.requestCameraPermissionsAsync();
}

export async function requestMediaLibraryPermissionsAsync(
  writeOnly: boolean = false,
): Promise<IMediaLibraryPermissionResponse> {
  return expoImagePicker.requestMediaLibraryPermissionsAsync(writeOnly);
}

/** Android only — recovers a result lost to `MainActivity` being killed mid-pick. */
export async function getPendingResultAsync(): Promise<
  IImagePickerResult | IImagePickerErrorResult | null
> {
  if (expoImagePicker.getPendingResultAsync) {
    return expoImagePicker.getPendingResultAsync();
  }
  return null;
}

export async function launchCameraAsync(
  options: IImagePickerOptions = {},
): Promise<IImagePickerResult> {
  if (!expoImagePicker.launchCameraAsync) {
    throw new UnavailabilityError('ImagePicker', 'launchCameraAsync');
  }
  const mappedOptions = mapDeprecatedOptions(options);
  return await expoImagePicker.launchCameraAsync(
    validateOptions(mappedOptions),
  );
}

export async function launchImageLibraryAsync(
  options: IImagePickerOptions = {},
): Promise<IImagePickerResult> {
  const mappedOptions = mapDeprecatedOptions(options);
  if (mappedOptions.allowsEditing && mappedOptions.allowsMultipleSelection) {
    console.warn(
      '[image-picker] `allowsEditing` is ignored when `allowsMultipleSelection` is enabled.',
    );
  }
  return await expoImagePicker.launchImageLibraryAsync(mappedOptions);
}
