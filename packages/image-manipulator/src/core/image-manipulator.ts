import { expoImageManipulator } from './native-module';
import { SaveFormat } from './types';
import { validateArguments } from './validators';
import type {
  NativeImageManipulatorContext,
  NativeImageRef,
} from './native-module';
import type { IAction, IImageResult, ISaveOptions } from './types';

export type { NativeImageManipulatorContext as IImageManipulatorContext };
export type { NativeImageRef as IImageRef };

/** Loads `source` and starts a new chainable manipulation context. */
export function manipulate(
  source: string | NativeImageRef,
): NativeImageManipulatorContext {
  return expoImageManipulator.manipulate(source);
}

/**
 * @deprecated replaced by `manipulate(source)` / the returned context's chainable methods.
 */
export async function manipulateAsync(
  uri: string,
  actions: IAction[] = [],
  saveOptions: ISaveOptions = {},
): Promise<IImageResult> {
  validateArguments(uri, actions, saveOptions);

  const { format = SaveFormat.JPEG, ...rest } = saveOptions;
  const context = expoImageManipulator.manipulate(uri);

  for (const action of actions) {
    if ('resize' in action) {
      context.resize(action.resize);
    } else if ('rotate' in action) {
      context.rotate(action.rotate);
    } else if ('flip' in action) {
      context.flip(action.flip);
    } else if ('crop' in action) {
      context.crop(action.crop);
    }
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format, ...rest });

  context.release();
  image.release();

  return result;
}
