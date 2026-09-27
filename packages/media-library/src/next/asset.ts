import { Platform } from 'react-native';
import { UnavailabilityError } from 'expo-modules-core';
import { expoMediaLibraryNext } from './native-module';
import type { MediaSubtype } from './types';

/**
 * A single media asset on the device (image, video, or audio). Four getters are iOS-only on
 * upstream's own native side; guarded here to fail with the same `UnavailabilityError` upstream
 * throws rather than whatever the Android native method happens to do when called anyway.
 */
export class Asset extends expoMediaLibraryNext.Asset {
  override getMediaSubtypes(): Promise<MediaSubtype[]> {
    if (Platform.OS !== 'ios') {
      throw new UnavailabilityError(
        'MediaLibrary',
        'getMediaSubtypes is only available on iOS',
      );
    }
    return super.getMediaSubtypes() as Promise<MediaSubtype[]>;
  }

  override getLivePhotoVideoUri(): Promise<string | null> {
    if (Platform.OS !== 'ios') {
      throw new UnavailabilityError(
        'MediaLibrary',
        'getLivePhotoVideoUri is only available on iOS',
      );
    }
    return super.getLivePhotoVideoUri();
  }

  override getIsInCloud(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      throw new UnavailabilityError(
        'MediaLibrary',
        'getIsInCloud is only available on iOS',
      );
    }
    return super.getIsInCloud();
  }

  override getOrientation(): Promise<number | null> {
    if (Platform.OS !== 'ios') {
      throw new UnavailabilityError(
        'MediaLibrary',
        'getOrientation is only available on iOS',
      );
    }
    return super.getOrientation();
  }
}
