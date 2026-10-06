// RN's Modal.js `confirmProps`: prop combinations the platform cannot honour, warned in dev

import { isDevBuild, Platform } from '@symbiote-native/engine';
import type { IModalPresentationStyle } from '../view/render-modal';

export type IModalWarningInput = {
  presentationStyle?: IModalPresentationStyle;
  transparent?: boolean;
  navigationBarTranslucent?: boolean;
  statusBarTranslucent?: boolean;
  allowSwipeDismissal?: boolean;
  onRequestClose?: unknown;
};

const OVER_FULL_SCREEN: IModalPresentationStyle = 'overFullScreen';
const IOS = 'ios';

export function modalWarningsOf(
  props: IModalWarningInput,
  os: string = Platform.OS,
): string[] {
  const warnings: string[] = [];
  const style = props.presentationStyle;
  if (style && style !== OVER_FULL_SCREEN && props.transparent === true) {
    warnings.push(
      `Modal with '${style}' presentation style and 'transparent' value is not supported.`,
    );
  }
  if (
    props.navigationBarTranslucent === true &&
    props.statusBarTranslucent !== true
  ) {
    warnings.push(
      'Modal with translucent navigation bar and without translucent status bar is not supported.',
    );
  }
  if (
    os === IOS &&
    props.allowSwipeDismissal === true &&
    !props.onRequestClose
  ) {
    warnings.push(
      'Modal requires the onRequestClose prop when used with `allowSwipeDismissal`. This is necessary to prevent state corruption.',
    );
  }
  return warnings;
}

// RN checks in the constructor and on every update, a dev build only
export function warnAboutModalProps(props: IModalWarningInput): void {
  if (!isDevBuild()) return;
  for (const warning of modalWarningsOf(props)) console.warn(warning);
}
