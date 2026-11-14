// Which element a Fabric view name becomes, and which reset class it starts from. Every view not
// listed here is a plain `div` of the view family

import {
  TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
} from '@symbiote-native/engine';
import { CLASS_NAMES } from './reset-sheet';

// The intrinsic tags of a Button and of the label it builds
export const BUTTON_TAG = 'button';
export const BUTTON_LABEL_TAG = 'button-label-text';
// The intrinsic tag of a touchable that shows an underlay while pressed
export const HIGHLIGHT_TAG = 'touchable-highlight';
// The intrinsic tags of a checkbox and of its check mark
export const CHECKBOX_TAG = 'checkbox';
export const CHECKBOX_MARK_TAG = 'checkbox-mark';

// The intrinsic tags of an activity indicator and of the spinner it builds
export const SPINNER_HOST_TAG = 'activity-indicator';
export const SPINNER_TAG = 'activity-indicator-spinner';

// The view name of a modal on the web, which follows the iOS table
export const MODAL_VIEW = 'ModalHostView';

// The intrinsic tag of a switch
export const SWITCH_TAG = 'switch';

export type IViewFamily = { tag: string; className: string };

const VIEW_FAMILY: IViewFamily = { tag: 'div', className: CLASS_NAMES.view };

const VIEW_FAMILIES: ReadonlyMap<string, IViewFamily> = new Map([
  [TEXT_COMPONENT, { tag: 'div', className: CLASS_NAMES.text }],
  [VIRTUAL_TEXT_COMPONENT, { tag: 'span', className: CLASS_NAMES.text }],
  ['RCTImageView', { tag: 'img', className: CLASS_NAMES.image }],
  [
    'RCTSinglelineTextInputView',
    { tag: 'input', className: CLASS_NAMES.input },
  ],
  [
    'RCTMultilineTextInputView',
    { tag: 'textarea', className: CLASS_NAMES.input },
  ],
]);

export function viewFamilyOf(viewName: string): IViewFamily {
  return VIEW_FAMILIES.get(viewName) ?? VIEW_FAMILY;
}

const familyClass = (viewName: string): string =>
  viewFamilyOf(viewName).className;

export const isImageView = (viewName: string): boolean =>
  familyClass(viewName) === CLASS_NAMES.image;

export const isInputView = (viewName: string): boolean =>
  familyClass(viewName) === CLASS_NAMES.input;
