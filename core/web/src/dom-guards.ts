// Narrowing without `instanceof`. The page globals `Node`, `Element` and `HTMLElement` may be other
// classes by now (an adapter can swap them), and `window` is the same object as `globalThis`

const ELEMENT_NODE = 1;
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const INPUT = 'input';
const TEXTAREA = 'textarea';
const IMAGE = 'img';

export function isNode(target: EventTarget | null): target is Node {
  return (
    target !== null &&
    'nodeType' in target &&
    typeof target.nodeType === 'number'
  );
}

export function isElement(node: Node | null | undefined): node is Element {
  return node?.nodeType === ELEMENT_NODE;
}

export function isHtmlElement(
  node: Node | null | undefined,
): node is HTMLElement {
  return isElement(node) && node.namespaceURI === HTML_NAMESPACE;
}

export type ITextField = HTMLInputElement | HTMLTextAreaElement;

export function isTextField(node: Node | null | undefined): node is ITextField {
  return (
    isHtmlElement(node) &&
    (node.localName === INPUT || node.localName === TEXTAREA)
  );
}

export function isImageElement(
  node: Node | null | undefined,
): node is HTMLImageElement {
  return isHtmlElement(node) && node.localName === IMAGE;
}
