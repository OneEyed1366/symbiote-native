// A field's input as the Fabric events the engine already understands. Listeners sit on the
// container and a field is found from the event target, so a swapped element loses nothing

import {
  hasListenerFor,
  isSymbioteNode,
  propOf,
} from '@symbiote-native/engine';
import type { IEventSource } from './dom-events';
import { isElement, isNode, isTextField, type ITextField } from './dom-guards';
import { bumpEventCount, setComposing } from './input-state';

const SUBMIT_KEY = 'Enter';
const SENT_KEYS: ReadonlySet<string> = new Set([
  SUBMIT_KEY,
  'Backspace',
  'Tab',
]);

type IPayload = (field: ITextField) => Record<string, unknown>;

// Sends one event to the field under an event target, when the app listens to `name`
type ISend = (
  target: EventTarget | null,
  name: string,
  top: string,
  payload: IPayload,
) => void;

type ISelection = { start: number; end: number };

const fieldOf = (target: EventTarget | null): ITextField | undefined =>
  isNode(target) && isTextField(target) ? target : undefined;

const textOf: IPayload = field => ({ text: field.value });

function senderOf({ host, handler }: IEventSource): ISend {
  return (target, name, top, payload) => {
    const field = fieldOf(target);
    const handle = host.handleAt(field ?? null);
    if (field === undefined || !isSymbioteNode(handle)) return;
    if (hasListenerFor(handle, name)) handler()?.(handle, top, payload(field));
  };
}

// A multiline field says how big its text is when that moves, as a device does for auto-grow
function sendContentSize(
  field: ITextField,
  send: ISend,
  sizes: WeakMap<ITextField, string>,
): void {
  if (field.localName !== 'textarea') return;
  const { scrollWidth: width, scrollHeight: height } = field;
  const size = `${width}x${height}`;
  if (sizes.get(field) === size) return;
  sizes.set(field, size);
  send(field, 'contentSizeChange', 'topContentSizeChange', () => ({
    contentSize: { width, height },
  }));
}

// The count moves for every change, listened to or not, as a controlled write is judged by it
function listenForChanges(
  { container, host }: IEventSource,
  send: ISend,
  signal: AbortSignal,
): void {
  const sizes = new WeakMap<ITextField, string>();
  container.addEventListener(
    'input',
    event => {
      const field = fieldOf(event.target);
      const handle = host.handleAt(field ?? null);
      if (field === undefined || handle === undefined) return;
      const eventCount = bumpEventCount(handle);
      send(field, 'change', 'topChange', () => ({
        text: field.value,
        eventCount,
      }));
      sendContentSize(field, send, sizes);
    },
    { signal },
  );
  for (const type of ['compositionstart', 'compositionend']) {
    container.addEventListener(
      type,
      event => {
        const { target } = event;
        if (isNode(target) && isElement(target)) {
          setComposing(target, type === 'compositionstart');
        }
      },
      { signal },
    );
  }
}

// What the app asked of a field that just took the focus. A clear is a change the app must hear of
function applyFocusProps(
  target: EventTarget | null,
  host: IEventSource['host'],
): void {
  const field = fieldOf(target);
  const handle = host.handleAt(field ?? null);
  if (field === undefined || !isSymbioteNode(handle)) return;
  if (propOf(handle, 'selectTextOnFocus') === true) field.select();
  if (propOf(handle, 'clearTextOnFocus') !== true) return;
  field.value = '';
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function listenForFocus(
  { container, host }: IEventSource,
  send: ISend,
  signal: AbortSignal,
): void {
  container.addEventListener(
    'focusin',
    event => {
      send(event.target, 'focus', 'topFocus', textOf);
      applyFocusProps(event.target, host);
    },
    { signal },
  );
  container.addEventListener(
    'focusout',
    event => {
      send(event.target, 'endEditing', 'topEndEditing', textOf);
      send(event.target, 'blur', 'topBlur', textOf);
    },
    { signal },
  );
}

// A single line field gives up the focus on submit unless the app asked to keep it
function shouldBlurAfterSubmit(handle: object | undefined): boolean {
  if (!isSymbioteNode(handle)) return true;
  if (propOf(handle, 'submitBehavior') === 'submit') return false;
  return propOf(handle, 'blurOnSubmit') !== false;
}

// A multiline field takes Enter as a new line
function listenForKeys(
  { container, host }: IEventSource,
  send: ISend,
  signal: AbortSignal,
): void {
  container.addEventListener(
    'keydown',
    ({ key, target }) => {
      if (key.length !== 1 && !SENT_KEYS.has(key)) return;
      send(target, 'keyPress', 'topKeyPress', () => ({ key }));
      const field = fieldOf(target);
      if (key !== SUBMIT_KEY || field?.localName !== 'input') return;
      send(target, 'submitEditing', 'topSubmitEditing', textOf);
      if (shouldBlurAfterSubmit(host.handleAt(field))) field.blur();
    },
    { signal },
  );
}

function listenForSelection(
  { container }: IEventSource,
  send: ISend,
  signal: AbortSignal,
): void {
  const reported = new WeakMap<ITextField, ISelection>();
  container.ownerDocument.addEventListener(
    'selectionchange',
    () => {
      const active = container.ownerDocument.activeElement;
      if (!isTextField(active) || !container.contains(active)) return;
      const now = {
        start: active.selectionStart ?? 0,
        end: active.selectionEnd ?? 0,
      };
      const before = reported.get(active);
      if (before?.start === now.start && before.end === now.end) return;
      reported.set(active, now);
      send(active, 'selectionChange', 'topSelectionChange', () => ({
        selection: now,
      }));
    },
    { signal },
  );
}

// Returns the function that stops forwarding
export function forwardInputEvents(source: IEventSource): () => void {
  const controller = new AbortController();
  const send = senderOf(source);
  listenForChanges(source, send, controller.signal);
  listenForFocus(source, send, controller.signal);
  listenForKeys(source, send, controller.signal);
  listenForSelection(source, send, controller.signal);
  return () => controller.abort();
}
