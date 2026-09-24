import { requireNativeModule } from 'expo-modules-core';
import type {
  IMailClient,
  IMailComposerOptions,
  IMailComposerResult,
} from './types';

const EXPO_MAIL_COMPOSER_MODULE_NAME = 'ExpoMailComposer';

export type INativeMailComposerModule = {
  isAvailableAsync(): Promise<boolean>;
  composeAsync(options: IMailComposerOptions): Promise<IMailComposerResult>;
  getClients(): IMailClient[];
};

export const expoMailComposer = requireNativeModule<INativeMailComposerModule>(
  EXPO_MAIL_COMPOSER_MODULE_NAME,
);
