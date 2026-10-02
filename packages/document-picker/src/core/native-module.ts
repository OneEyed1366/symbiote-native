import { requireNativeModule } from 'expo-modules-core';
import type { IDocumentPickerOptions, IDocumentPickerResult } from './types';

const EXPO_DOCUMENT_PICKER_MODULE_NAME = 'ExpoDocumentPicker';

export type INativeDocumentPickerModule = {
  getDocumentAsync(
    options: IDocumentPickerOptions,
  ): Promise<IDocumentPickerResult>;
};

export const expoDocumentPicker =
  requireNativeModule<INativeDocumentPickerModule>(
    EXPO_DOCUMENT_PICKER_MODULE_NAME,
  );
