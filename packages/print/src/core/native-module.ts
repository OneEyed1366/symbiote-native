import { requireNativeModule } from 'expo-modules-core';
import type {
  IFilePrintOptions,
  IFilePrintResult,
  IPrintOptions,
  IPrintOrientation,
  IPrinter,
} from './types';

const EXPO_PRINT_MODULE_NAME = 'ExpoPrint';

export type INativePrintModule = {
  Orientation: IPrintOrientation;
  print(options: IPrintOptions): Promise<void>;
  /** iOS only — absent on Android's native module. */
  selectPrinter?(): Promise<IPrinter>;
  printToFileAsync(options: IFilePrintOptions): Promise<IFilePrintResult>;
};

export const expoPrint = requireNativeModule<INativePrintModule>(
  EXPO_PRINT_MODULE_NAME,
);
