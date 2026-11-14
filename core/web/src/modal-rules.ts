// A Modal host pinned over the page. Upstream sets `position: absolute` on it and the platform
// sizes it to the screen, so here the rule composes the app's style under a fixed full-page box

import { cssFromBag, styleKeysOf } from './css-style';
import { CLASS_NAMES } from './reset-sheet';
import type { IDomSpec } from './spec-types';

type IBag = Readonly<Record<string, unknown>>;

// The props that describe the native window, none of them has a form on a page
export type IModalProps = {
  transparent?: unknown;
  animationType?: unknown;
  presentationStyle?: unknown;
  supportedOrientations?: unknown;
  hardwareAccelerated?: unknown;
  statusBarTranslucent?: unknown;
  navigationBarTranslucent?: unknown;
  allowSwipeDismissal?: unknown;
  visible?: unknown;
};

const Z_INDEX = 1_000;

const COVER: Record<string, unknown> = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  zIndex: Z_INDEX,
};

const ENTRANCES: Readonly<Record<string, string>> = {
  fade: CLASS_NAMES.modalFade,
  slide: CLASS_NAMES.modalSlide,
};

export function modalRules(bag: IBag): Partial<IDomSpec> {
  const entrance =
    typeof bag.animationType === 'string'
      ? ENTRANCES[bag.animationType]
      : undefined;
  return {
    classNames: entrance === undefined ? [] : [entrance],
    css: cssFromBag({ ...styleKeysOf(bag), ...COVER }),
    attributes: { role: 'dialog', 'aria-modal': 'true' },
  };
}
