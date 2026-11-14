// What a person does to a page, as the events a browser sends for it. Each adapter's web test
// drives its own components with these, so the same gesture is proven on all five

const SINGLE_FINGER = 1;

export const settle = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

export function elementByTestId(
  root: HTMLElement,
  testId: string,
): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (element === null) throw new Error(`the page has no element "${testId}"`);
  return element;
}

// The innermost element that holds exactly this text, which is where a title is painted
export function textLeaf(root: HTMLElement, text: string): HTMLElement {
  const leaf = [...root.querySelectorAll<HTMLElement>('*')].find(
    element => element.textContent === text && element.children.length === 0,
  );
  if (leaf === undefined)
    throw new Error(`the page has no element with "${text}"`);
  return leaf;
}

function pointer(type: string): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: SINGLE_FINGER,
    pointerType: 'touch',
    clientX: 1,
    clientY: 1,
  });
}

// A finger down and up on the same element, with a turn of the event loop in between
export async function tapElement(element: Element): Promise<void> {
  element.dispatchEvent(pointer('pointerdown'));
  await settle();
  element.dispatchEvent(pointer('pointerup'));
  await settle();
}

// The click a browser sends after a finger lifts, for the controls that listen to a click alone
export async function clickElement(element: HTMLElement): Promise<void> {
  element.click();
  await settle();
}

export async function typeInto(root: HTMLElement, text: string): Promise<void> {
  const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  );
  if (field === null) throw new Error('the page has no text field');
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

export async function scrollElementTo(
  element: HTMLElement,
  top: number,
): Promise<void> {
  element.scrollTop = top;
  element.dispatchEvent(new Event('scroll'));
  await settle();
}
