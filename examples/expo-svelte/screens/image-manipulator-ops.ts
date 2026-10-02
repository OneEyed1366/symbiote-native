import {
  FlipType,
  SaveFormat,
} from '@symbiote-native/image-manipulator/svelte';
import type {
  IAction,
  IImageManipulatorContext,
  ISaveOptions,
} from '@symbiote-native/image-manipulator/svelte';

export const NO_FLIP = 'no flip';

export type IOps = {
  resizeWidth: string;
  resizeHeight: string;
  rotate: string;
  flip: FlipType | typeof NO_FLIP;
  cropX: string;
  cropY: string;
  cropWidth: string;
  cropHeight: string;
  format: SaveFormat;
  compress: string;
  base64: boolean;
};
export type ISetOps = (patch: Partial<IOps>) => void;

export const INITIAL_OPS: IOps = {
  resizeWidth: '300',
  resizeHeight: '',
  rotate: '90',
  flip: NO_FLIP,
  cropX: '',
  cropY: '',
  cropWidth: '',
  cropHeight: '',
  format: SaveFormat.JPEG,
  compress: '1',
  base64: false,
};

export const FLIP_CHOICES = [
  { label: NO_FLIP, value: NO_FLIP },
  { label: 'vertical', value: FlipType.Vertical },
  { label: 'horizontal', value: FlipType.Horizontal },
] as const;

export const FORMAT_CHOICES = [
  { label: 'jpeg', value: SaveFormat.JPEG },
  { label: 'png', value: SaveFormat.PNG },
  { label: 'webp', value: SaveFormat.WEBP },
] as const;

function num(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

export function toActions(ops: IOps): IAction[] {
  const actions: IAction[] = [];
  const width = num(ops.resizeWidth);
  const height = num(ops.resizeHeight);
  if (width !== undefined || height !== undefined) {
    actions.push({ resize: { width, height } });
  }
  const rotate = num(ops.rotate);
  if (rotate !== undefined) {
    actions.push({ rotate });
  }
  if (ops.flip !== NO_FLIP) {
    actions.push({ flip: ops.flip });
  }
  const originX = num(ops.cropX);
  const originY = num(ops.cropY);
  const cropWidth = num(ops.cropWidth);
  const cropHeight = num(ops.cropHeight);
  if (
    originX !== undefined &&
    originY !== undefined &&
    cropWidth !== undefined &&
    cropHeight !== undefined
  ) {
    actions.push({
      crop: { originX, originY, width: cropWidth, height: cropHeight },
    });
  }
  return actions;
}

export function toSaveOptions(ops: IOps): ISaveOptions {
  return {
    format: ops.format,
    compress: num(ops.compress),
    base64: ops.base64,
  };
}

export function applyActions(
  context: IImageManipulatorContext,
  actions: IAction[],
): IImageManipulatorContext {
  return actions.reduce((current, action) => {
    if ('resize' in action) {
      return current.resize(action.resize);
    }
    if ('rotate' in action) {
      return current.rotate(action.rotate);
    }
    if ('flip' in action) {
      return current.flip(action.flip);
    }
    return current.crop(action.crop);
  }, context);
}
