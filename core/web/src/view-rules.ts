// The per-view rules of the web host: which props a view owns, and what they write. A prop a rule
// set owns never reaches the generic style and attribute writers, so it is not reported as skipped

import {
  TEXT_COMPONENT,
  VIRTUAL_TEXT_COMPONENT,
} from '@symbiote-native/engine';
import {
  buttonLabelRules,
  foldButtonAccessibility,
  type IButtonLabelProps,
} from './button-rules';
import {
  checkboxMarkRules,
  checkboxRules,
  type ICheckboxMarkProps,
  type ICheckboxProps,
} from './checkbox-rules';
import { isStyleKey } from './css-style';
import {
  highlightChildRules,
  highlightRules,
  type IHighlightChildProps,
  type IHighlightProps,
} from './highlight-rules';
import { imageRules, type IImageProps } from './image-rules';
import { inputRules, type IInputProps } from './input-rules';
import {
  foldDisabledIntoState,
  isPressableTag,
  pressableRules,
  textPressRules,
  type IPressableProps,
  type ITextPressProps,
} from './pressable-rules';
import { scrollRules, type IScrollProps } from './scroll-rules';
import type { IDomSpec } from './spec-types';
import {
  spinnerHostRules,
  spinnerRules,
  type ISpinnerProps,
} from './spinner-rules';
import { modalRules, type IModalProps } from './modal-rules';
import { switchRules, type ISwitchProps } from './switch-rules';
import { textDeclarations, type ITextRuleProps } from './text-rules';
import {
  BUTTON_LABEL_TAG,
  BUTTON_TAG,
  CHECKBOX_MARK_TAG,
  CHECKBOX_TAG,
  HIGHLIGHT_TAG,
  SPINNER_HOST_TAG,
  SPINNER_TAG,
  SWITCH_TAG,
  isImageView,
  isInputView,
  MODAL_VIEW,
} from './view-tags';

export type IBag = Readonly<Record<string, unknown>>;

// What the rule sets wrote, and the bag without the props they owned
export type IViewRules = IDomSpec & { rest: IBag };

type IView = { viewName: string; tagName: string };

type IRuleSet = {
  applies: (view: IView, bag: IBag) => boolean;
  names: readonly string[];
  // The rule composes the style keys itself, so none of them goes to the generic css writer
  ownsStyle?: boolean;
  // Rewrites the props that stay for the generic writers, given the bag the set read
  fold?: (rest: IBag, bag: IBag) => IBag;
  rules: (bag: IBag, view: IView) => Partial<IDomSpec>;
};

// A record keyed by the whole prop type, so a prop added to the type fails to compile until listed
const namesOf = (props: Record<string, true>): string[] => Object.keys(props);

const TEXT_PROPS: Record<keyof ITextRuleProps, true> = {
  numberOfLines: true,
  ellipsizeMode: true,
  selectable: true,
};

const SCROLL_PROPS: Record<keyof IScrollProps, true> = {
  scrollEnabled: true,
  showsVerticalScrollIndicator: true,
  showsHorizontalScrollIndicator: true,
  pagingEnabled: true,
  bounces: true,
  scrollEventThrottle: true,
  decelerationRate: true,
  alwaysBounceVertical: true,
  alwaysBounceHorizontal: true,
  directionalLockEnabled: true,
  nestedScrollEnabled: true,
  overScrollMode: true,
  persistentScrollbar: true,
  fadingEdgeLength: true,
  endFillColor: true,
  indicatorStyle: true,
  contentOffset: true,
  centerContent: true,
};

const IMAGE_PROPS: Record<keyof IImageProps, true> = {
  source: true,
  src: true,
  srcSet: true,
  resizeMode: true,
  alt: true,
};

const INPUT_PROPS: Record<keyof IInputProps, true> = {
  text: true,
  value: true,
  defaultValue: true,
  placeholder: true,
  placeholderTextColor: true,
  secureTextEntry: true,
  keyboardType: true,
  inputMode: true,
  returnKeyType: true,
  enterKeyHint: true,
  editable: true,
  readOnly: true,
  maxLength: true,
  autoCapitalize: true,
  autoCorrect: true,
  spellCheck: true,
  autoComplete: true,
  autoFocus: true,
  blurOnSubmit: true,
  submitBehavior: true,
  selectTextOnFocus: true,
  clearTextOnFocus: true,
  caretHidden: true,
  selectionColor: true,
  cursorColor: true,
  numberOfLines: true,
  rows: true,
  multiline: true,
};

const PRESSABLE_PROPS: Record<keyof IPressableProps, true> = {
  hasPressListener: true,
  disabled: true,
  focusable: true,
  accessible: true,
  testOnly_pressed: true,
  android_ripple: true,
  cancelable: true,
  delayLongPress: true,
  minPressDuration: true,
  unstable_pressDelay: true,
  pressRetentionOffset: true,
  delayHoverIn: true,
  delayHoverOut: true,
  android_disableSound: true,
  blockNativeResponder: true,
  activeOpacity: true,
  underlayColor: true,
  onShowUnderlay: true,
  onHideUnderlay: true,
  delayPressIn: true,
  delayPressOut: true,
  touchSoundDisabled: true,
  rejectResponderTermination: true,
};

const TEXT_PRESS_PROPS: Record<keyof ITextPressProps, true> = {
  hasPressListener: true,
  disabled: true,
};

const BUTTON_LABEL_PROPS: Record<keyof IButtonLabelProps, true> = {
  buttonOwner: true,
};

const CHECKBOX_PROPS: Record<keyof ICheckboxProps, true> = {
  value: true,
  color: true,
};

const CHECKBOX_MARK_PROPS: Record<keyof ICheckboxMarkProps, true> = {
  checkboxOwner: true,
};

const SPINNER_PROPS: Record<keyof ISpinnerProps, true> = {
  animating: true,
  color: true,
  size: true,
  hidesWhenStopped: true,
};

const MODAL_PROPS: Record<keyof IModalProps, true> = {
  transparent: true,
  animationType: true,
  presentationStyle: true,
  supportedOrientations: true,
  hardwareAccelerated: true,
  statusBarTranslucent: true,
  navigationBarTranslucent: true,
  allowSwipeDismissal: true,
  visible: true,
};

const SWITCH_PROPS: Record<keyof ISwitchProps, true> = {
  value: true,
  disabled: true,
  trackColor: true,
  thumbColor: true,
  ios_backgroundColor: true,
};

const HIGHLIGHT_PROPS: Record<keyof IHighlightProps, true> = {
  underlay: true,
};

const HIGHLIGHT_CHILD_PROPS: Record<keyof IHighlightChildProps, true> = {
  highlightChild: true,
};

// A rule set for the nodes of one intrinsic tag
function ofTag(
  tagName: string,
  props: Record<string, true>,
  rules: (bag: IBag) => Partial<IDomSpec>,
  ownsStyle = false,
): IRuleSet {
  return {
    applies: view => view.tagName === tagName,
    names: namesOf(props),
    ownsStyle,
    rules,
  };
}

const RULE_SETS: readonly IRuleSet[] = [
  {
    // Both text views own the props, only the block text writes them as css
    applies: ({ viewName }) =>
      viewName === TEXT_COMPONENT || viewName === VIRTUAL_TEXT_COMPONENT,
    names: namesOf(TEXT_PROPS),
    rules: (bag, { viewName }) =>
      viewName === TEXT_COMPONENT ? { css: textDeclarations(bag) } : {},
  },
  {
    applies: () => true,
    names: namesOf(SCROLL_PROPS),
    rules: (bag, { tagName }) => scrollRules(tagName, bag),
  },
  {
    applies: ({ viewName }) => isImageView(viewName),
    names: namesOf(IMAGE_PROPS),
    rules: bag => imageRules(bag),
  },
  {
    applies: ({ viewName }) => isInputView(viewName),
    names: namesOf(INPUT_PROPS),
    rules: bag => inputRules(bag),
  },
  {
    applies: ({ tagName }) => isPressableTag(tagName),
    names: namesOf(PRESSABLE_PROPS),
    fold: foldDisabledIntoState,
    rules: (bag, { tagName }) =>
      isPressableTag(tagName)
        ? { attributes: pressableRules(tagName, bag) }
        : {},
  },
  {
    applies: ({ viewName }) =>
      viewName === TEXT_COMPONENT || viewName === VIRTUAL_TEXT_COMPONENT,
    names: namesOf(TEXT_PRESS_PROPS),
    fold: foldDisabledIntoState,
    rules: bag => ({ attributes: textPressRules(bag) }),
  },
  {
    applies: ({ tagName }) => tagName === BUTTON_TAG,
    names: [],
    fold: foldButtonAccessibility,
    rules: () => ({}),
  },
  ofTag(BUTTON_LABEL_TAG, BUTTON_LABEL_PROPS, buttonLabelRules),
  // A checkbox composes the app's style itself, in the order upstream does
  ofTag(CHECKBOX_TAG, CHECKBOX_PROPS, checkboxRules, true),
  ofTag(CHECKBOX_MARK_TAG, CHECKBOX_MARK_PROPS, checkboxMarkRules, true),
  ofTag(HIGHLIGHT_TAG, HIGHLIGHT_PROPS, highlightRules, true),
  ofTag(SPINNER_HOST_TAG, {}, spinnerHostRules),
  ofTag(SPINNER_TAG, SPINNER_PROPS, spinnerRules),
  ofTag(SWITCH_TAG, SWITCH_PROPS, switchRules),
  {
    // The rule composes the app's style itself, under the box that pins it over the page
    applies: ({ viewName }) => viewName === MODAL_VIEW,
    names: namesOf(MODAL_PROPS),
    ownsStyle: true,
    rules: modalRules,
  },
  {
    // Any view can be the child of a pressed highlight, the owner's bit says which
    applies: (_view, bag) => Object.hasOwn(bag, 'highlightChild'),
    names: namesOf(HIGHLIGHT_CHILD_PROPS),
    ownsStyle: true,
    rules: bag => highlightChildRules(bag),
  },
];

export function viewRulesOf(
  viewName: string,
  tagName: string,
  bag: IBag,
): IViewRules {
  const view = { viewName, tagName };
  const out: IViewRules = {
    classNames: [],
    css: {},
    attributes: {},
    rest: bag,
  };
  for (const set of RULE_SETS.filter(candidate =>
    candidate.applies(view, bag),
  )) {
    const part = set.rules(bag, view);
    out.classNames.push(...(part.classNames ?? []));
    Object.assign(out.css, part.css);
    Object.assign(out.attributes, part.attributes);
    const owns = (key: string): boolean =>
      set.names.includes(key) || (set.ownsStyle === true && isStyleKey(key));
    out.rest = Object.fromEntries(
      Object.entries(out.rest).filter(([key]) => !owns(key)),
    );
    if (set.fold !== undefined) out.rest = set.fold(out.rest, bag);
  }
  return out;
}
