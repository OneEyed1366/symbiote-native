import { expoDocumentPicker } from './native-module';
import type { IDocumentPickerOptions, IDocumentPickerResult } from './types';

/** Opens the system UI for picking one or more documents. */
export async function getDocumentAsync(
  options: IDocumentPickerOptions = {},
): Promise<IDocumentPickerResult> {
  const {
    type = '*/*',
    copyToCacheDirectory = true,
    multiple = false,
  } = options;
  return await expoDocumentPicker.getDocumentAsync({
    type: typeof type === 'string' ? [type] : type,
    copyToCacheDirectory,
    multiple,
  });
}
