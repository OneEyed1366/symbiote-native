import { Platform, UnavailabilityError } from 'expo-modules-core';
import { expoPrint } from './native-module';
import type {
  IFilePrintOptions,
  IFilePrintResult,
  IPrintOptions,
  IPrinter,
} from './types';

export const Orientation = expoPrint.Orientation;

let isPrinting = false;

/** Opens the native print window (AirPrint / Android's print framework). */
export async function printAsync(options: IPrintOptions): Promise<void> {
  // The deprecated formatter option stands in for `html` and `uri` on iOS only
  const hasMarkupFormatter = Platform.select({
    ios: Boolean(options.markupFormatterIOS),
    default: false,
  });
  if (!options.uri && !options.html && !hasMarkupFormatter) {
    throw new Error('Must provide either `html` or `uri` to print');
  }
  if (options.uri && options.html) {
    throw new Error(
      'Must provide exactly one of `html` and `uri` but both were specified',
    );
  }
  if (options.markupFormatterIOS !== undefined) {
    console.warn(
      'The markupFormatterIOS option is deprecated. Use useMarkupFormatter instead.',
    );
  }
  if (isPrinting) {
    throw new Error('Another print request is already in progress');
  }

  isPrinting = true;
  try {
    return await expoPrint.print(options);
  } finally {
    isPrinting = false;
  }
}

/** Opens a printer picker; the result feeds `printerUrl` into `printAsync`. iOS only. */
export async function selectPrinterAsync(): Promise<IPrinter> {
  if (expoPrint.selectPrinter) {
    return await expoPrint.selectPrinter();
  }
  throw new UnavailabilityError('Print', 'selectPrinterAsync');
}

/** Renders HTML to a PDF file in the app's cache directory. */
export async function printToFileAsync(
  options: IFilePrintOptions = {},
): Promise<IFilePrintResult> {
  return await expoPrint.printToFileAsync(options);
}
