// TextInput props that have a W3C spelling. The C++ alias rules map these onto native names, so
// the web host reads the authored names and writes the attributes a browser knows

import type { ICssDeclarations } from './css-values';
import type { IAttributes } from './dom-attributes';

export type IInputRules = { attributes: IAttributes; css: ICssDeclarations };

export type IInputProps = {
  text?: unknown;
  value?: unknown;
  defaultValue?: unknown;
  placeholder?: unknown;
  placeholderTextColor?: unknown;
  secureTextEntry?: unknown;
  keyboardType?: unknown;
  inputMode?: unknown;
  returnKeyType?: unknown;
  enterKeyHint?: unknown;
  editable?: unknown;
  readOnly?: unknown;
  maxLength?: unknown;
  autoCapitalize?: unknown;
  autoCorrect?: unknown;
  spellCheck?: unknown;
  autoComplete?: unknown;
  autoFocus?: unknown;
  // Read when Enter is pressed or the field takes the focus, they write no attribute
  blurOnSubmit?: unknown;
  submitBehavior?: unknown;
  selectTextOnFocus?: unknown;
  clearTextOnFocus?: unknown;
  caretHidden?: unknown;
  selectionColor?: unknown;
  cursorColor?: unknown;
  numberOfLines?: unknown;
  rows?: unknown;
  // Picks between the two views, so the tag already decided it
  multiline?: unknown;
};

// A native keyboard with no browser twin (`default`, `ascii-capable`) is left to the browser
const INPUT_MODES: Readonly<Record<string, string>> = {
  numeric: 'numeric',
  'number-pad': 'numeric',
  'decimal-pad': 'decimal',
  'phone-pad': 'tel',
  'email-address': 'email',
  url: 'url',
  'web-search': 'search',
};

const ENTER_KEY_HINTS = [
  'done',
  'go',
  'next',
  'previous',
  'search',
  'send',
  'enter',
] as const;

type IEnterKeyHint = (typeof ENTER_KEY_HINTS)[number];

const stringProp = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const isEnterKeyHint = (value: string): value is IEnterKeyHint =>
  ENTER_KEY_HINTS.some(hint => hint === value);

// The web spelling wins over the native one, as it does in RN's own fold
function keyboardAttributes(props: IInputProps): IAttributes {
  const out: IAttributes = {};
  const mode =
    stringProp(props.inputMode) ?? INPUT_MODES[String(props.keyboardType)];
  if (mode !== undefined) out.inputmode = mode;
  const hint =
    stringProp(props.enterKeyHint) ?? stringProp(props.returnKeyType);
  if (hint !== undefined && isEnterKeyHint(hint)) out.enterkeyhint = hint;
  return out;
}

function flagAttributes(props: IInputProps): IAttributes {
  const out: IAttributes = {};
  if (props.secureTextEntry === true) out.type = 'password';
  if (props.editable === false || props.readOnly === true) out.readonly = '';
  if (props.autoFocus === true) out.autofocus = '';
  if (typeof props.autoCorrect === 'boolean') {
    out.autocorrect = props.autoCorrect ? 'on' : 'off';
  }
  if (typeof props.spellCheck === 'boolean') {
    out.spellcheck = String(props.spellCheck);
  }
  return out;
}

function textAttributes(props: IInputProps): IAttributes {
  const out: IAttributes = {};
  const named: readonly [string, unknown][] = [
    ['placeholder', props.placeholder],
    ['autocapitalize', props.autoCapitalize],
    ['autocomplete', props.autoComplete],
  ];
  for (const [name, value] of named) {
    if (typeof value === 'string') out[name] = value;
  }
  if (typeof props.maxLength === 'number') {
    out.maxlength = String(props.maxLength);
  }
  const rows = props.rows ?? props.numberOfLines;
  if (typeof rows === 'number') out.rows = String(rows);
  return out;
}

function inputCss(props: IInputProps): ICssDeclarations {
  const out: ICssDeclarations = {};
  const placeholder = stringProp(props.placeholderTextColor);
  if (placeholder !== undefined) out['--sn-placeholder-color'] = placeholder;
  const caret =
    stringProp(props.cursorColor) ?? stringProp(props.selectionColor);
  if (props.caretHidden === true) out['caret-color'] = 'transparent';
  else if (caret !== undefined) out['caret-color'] = caret;
  return out;
}

export function inputRules(props: IInputProps): IInputRules {
  return {
    attributes: {
      ...textAttributes(props),
      ...flagAttributes(props),
      ...keyboardAttributes(props),
    },
    css: inputCss(props),
  };
}

// What the field starts with. Later writes arrive as `setTextAndSelection`, not as props
export function initialValueOf(props: IInputProps): string | undefined {
  return (
    stringProp(props.text) ??
    stringProp(props.value) ??
    stringProp(props.defaultValue)
  );
}
