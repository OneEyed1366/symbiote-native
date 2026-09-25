import { FlipType, SaveFormat } from './types';
import type {
  IAction,
  IActionCrop,
  IActionFlip,
  IActionResize,
  IActionRotate,
  ISaveOptions,
} from './types';

const SUPPORTED_ACTION_TYPES = ['crop', 'flip', 'rotate', 'resize'];

export function validateArguments(
  uri: string,
  actions: IAction[],
  saveOptions: ISaveOptions,
): void {
  validateUri(uri);
  validateActions(actions);
  validateSaveOptions(saveOptions);
}

export function validateUri(uri: string): void {
  if (typeof uri !== 'string') {
    throw new TypeError('The "uri" argument must be a string');
  }
}

export function validateActions(actions: IAction[]): void {
  if (!Array.isArray(actions)) {
    throw new TypeError('The "actions" argument must be an array');
  }
  for (const action of actions) {
    if (typeof action !== 'object' || action === null) {
      throw new TypeError('Action must be an object');
    }
    const actionKeys = Object.keys(action);
    if (actionKeys.length !== 1) {
      throw new TypeError(
        `Single action must contain exactly one transformation: ${SUPPORTED_ACTION_TYPES.join(', ')}`,
      );
    }
    const actionType = actionKeys[0];
    if (!SUPPORTED_ACTION_TYPES.includes(actionType)) {
      throw new TypeError(`Unsupported action type: ${actionType}`);
    }
    if ('crop' in action) {
      validateCropAction(action);
    } else if ('flip' in action) {
      validateFlipAction(action);
    } else if ('rotate' in action) {
      validateRotateAction(action);
    } else if ('resize' in action) {
      validateResizeAction(action);
    }
  }
}

function validateCropAction(action: IActionCrop): void {
  const isValid =
    typeof action.crop === 'object' &&
    action.crop !== null &&
    typeof action.crop.originX === 'number' &&
    typeof action.crop.originY === 'number' &&
    typeof action.crop.width === 'number' &&
    typeof action.crop.height === 'number';
  if (!isValid) {
    throw new TypeError(
      'Crop action must be an object of shape { originX: number; originY: number; width: number; height: number }',
    );
  }
}

function validateFlipAction(action: IActionFlip): void {
  if (
    typeof action.flip !== 'string' ||
    ![FlipType.Horizontal, FlipType.Vertical].includes(action.flip)
  ) {
    throw new TypeError(`Unsupported flip type: ${action.flip}`);
  }
}

function validateRotateAction(action: IActionRotate): void {
  if (typeof action.rotate !== 'number') {
    throw new TypeError('Rotation must be a number');
  }
}

function validateResizeAction(action: IActionResize): void {
  const isValid =
    typeof action.resize === 'object' &&
    action.resize !== null &&
    (typeof action.resize.width === 'number' ||
      action.resize.width === undefined) &&
    (typeof action.resize.height === 'number' ||
      action.resize.height === undefined);
  if (!isValid) {
    throw new TypeError(
      'Resize action must be an object of shape { width?: number; height?: number }',
    );
  }
}

export function validateSaveOptions({
  base64,
  compress,
  format,
}: ISaveOptions): void {
  if (base64 !== undefined && typeof base64 !== 'boolean') {
    throw new TypeError('The "base64" argument must be a boolean');
  }
  if (compress !== undefined) {
    if (typeof compress !== 'number') {
      throw new TypeError('The "compress" argument must be a number');
    }
    if (compress < 0 || compress > 1) {
      throw new TypeError(
        'The "compress" argument must be a number between 0 and 1',
      );
    }
  }
  const allowedFormats = [SaveFormat.JPEG, SaveFormat.PNG, SaveFormat.WEBP];
  if (format !== undefined && !allowedFormats.includes(format)) {
    throw new TypeError(
      `The "format" argument must be one of: ${allowedFormats.join(', ')}`,
    );
  }
}
