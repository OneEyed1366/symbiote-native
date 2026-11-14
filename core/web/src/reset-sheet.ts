// The rules every element of a view family starts from. Yoga's defaults differ from CSS's, and
// per-element inline CSS for them would repeat on every node, so one sheet carries them

export const CLASS_NAMES = {
  view: 'sn-view',
  text: 'sn-text',
  image: 'sn-image',
  input: 'sn-input',
  pointerNone: 'sn-pe-none',
  pointerBoxNone: 'sn-pe-box-none',
  pointerBoxOnly: 'sn-pe-box-only',
  scrollY: 'sn-scroll-y',
  scrollX: 'sn-scroll-x',
  scrollContentX: 'sn-scroll-content-x',
  noScrollbar: 'sn-no-scrollbar',
  snapY: 'sn-snap-y',
  snapX: 'sn-snap-x',
  centerContent: 'sn-center-content',
  modalFade: 'sn-modal-fade',
  modalSlide: 'sn-modal-slide',
  spinner: 'sn-spinner',
  switch: 'sn-switch',
} as const;

const SHEET_ID = 'symbiote-reset';

const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Yoga: column, content packed at the start, nothing shrinks, boxes can be narrower than content
const VIEW_RULES = [
  'align-content:flex-start',
  'align-items:stretch',
  'border:0 solid black',
  'box-sizing:border-box',
  'display:flex',
  'flex-direction:column',
  'flex-shrink:0',
  'margin:0',
  'min-height:0',
  'min-width:0',
  'padding:0',
  'position:relative',
].join(';');

const TEXT_RULES = [
  'border:0 solid black',
  'box-sizing:border-box',
  'color:black',
  'display:inline',
  `font-family:${FONT_STACK}`,
  'font-size:14px',
  'margin:0',
  'overflow-wrap:break-word',
  'padding:0',
  'text-decoration:none',
  'white-space:pre-wrap',
].join(';');

const IMAGE_RULES = [
  'border:0 solid black',
  'box-sizing:border-box',
  'display:block',
  'margin:0',
  'padding:0',
  'position:relative',
].join(';');

const INPUT_RULES = [
  'appearance:none',
  'background-color:transparent',
  'border:0 solid black',
  'border-radius:0',
  'box-sizing:border-box',
  `font-family:${FONT_STACK}`,
  'font-size:14px',
  'margin:0',
  'padding:0',
  'resize:none',
].join(';');

// `none` is forced because a box-none ancestor hands `auto` to every child, its own included
const POINTER_RULES = [
  `.${CLASS_NAMES.pointerNone}{pointer-events:none!important}`,
  `.${CLASS_NAMES.pointerBoxNone}{pointer-events:none}`,
  `.${CLASS_NAMES.pointerBoxNone}>*{pointer-events:auto}`,
  `.${CLASS_NAMES.pointerBoxOnly}{pointer-events:auto}`,
  `.${CLASS_NAMES.pointerBoxOnly}>*{pointer-events:none}`,
].join('');

// A scroller grows and shrinks to its parent and scrolls along one axis, the other stays clipped
const SCROLL_RULES = [
  `.${CLASS_NAMES.scrollY}{flex-grow:1;flex-shrink:1;overflow-x:hidden;overflow-y:auto}`,
  `.${CLASS_NAMES.scrollX}{flex-direction:row;flex-grow:1;flex-shrink:1;overflow-x:auto;overflow-y:hidden}`,
  `.${CLASS_NAMES.scrollContentX}{flex-direction:row}`,
  `.${CLASS_NAMES.noScrollbar}{scrollbar-width:none}`,
  `.${CLASS_NAMES.noScrollbar}::-webkit-scrollbar{display:none}`,
  `.${CLASS_NAMES.snapY}{scroll-snap-type:y mandatory}`,
  `.${CLASS_NAMES.snapX}{scroll-snap-type:x mandatory}`,
  // The pages of a pager are the children of the content view
  `.${CLASS_NAMES.snapY}>*>*{scroll-snap-align:start}`,
  `.${CLASS_NAMES.snapX}>*>*{scroll-snap-align:start}`,
  // An auto margin centers small content and falls back to the start when it overflows
  `.${CLASS_NAMES.centerContent}>*{margin:auto}`,
].join('');

// A ring with one clear quarter, turned once a second
const SPINNER_RULES = [
  `.${CLASS_NAMES.spinner}{animation:sn-spin 1s linear infinite;border-radius:50%;border-style:solid;border-width:2px}`,
  '@keyframes sn-spin{to{transform:rotate(360deg)}}',
].join('');

// A modal enters by fading in or sliding up from the bottom edge
const MODAL_RULES = [
  `.${CLASS_NAMES.modalFade}{animation:sn-modal-fade .3s}`,
  `.${CLASS_NAMES.modalSlide}{animation:sn-modal-slide .3s}`,
  '@keyframes sn-modal-fade{from{opacity:0}}',
  '@keyframes sn-modal-slide{from{transform:translateY(100%)}}',
].join('');

// The pill is 51 by 31 and the thumb slides 20 along it when on
const SWITCH_RULES = [
  `.${CLASS_NAMES.switch}{border-radius:15.5px;cursor:pointer;flex-shrink:0;height:31px;transition:background-color .2s;width:51px}`,
  `.${CLASS_NAMES.switch}::after{background-color:var(--sn-switch-thumb,#fff);border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.3);content:"";height:27px;left:2px;position:absolute;top:2px;transition:transform .2s;width:27px}`,
  `.${CLASS_NAMES.switch}[aria-checked=true]::after{transform:translateX(20px)}`,
].join('');

export const RESET_CSS = [
  `.${CLASS_NAMES.view}{${VIEW_RULES}}`,
  `.${CLASS_NAMES.text}{${TEXT_RULES}}`,
  `.${CLASS_NAMES.image}{${IMAGE_RULES}}`,
  `.${CLASS_NAMES.input}{${INPUT_RULES}}`,
  `.${CLASS_NAMES.input}::placeholder{color:var(--sn-placeholder-color,darkgray)}`,
  SCROLL_RULES,
  SPINNER_RULES,
  SWITCH_RULES,
  MODAL_RULES,
  POINTER_RULES,
].join('');

// Once per document, however many hosts or surfaces there are
export function ensureResetSheet(document: Document): void {
  if (document.getElementById(SHEET_ID) !== null) return;
  const sheet = document.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = RESET_CSS;
  document.head.appendChild(sheet);
}
