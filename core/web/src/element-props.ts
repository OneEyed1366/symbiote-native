// Brings an element to a node's spec by the difference from the spec it was last brought to, so a
// prop that did not change costs no DOM write

import type { IDomSpec } from './dom-spec';

type IRecord = Readonly<Record<string, string>>;

function syncRecord(
  previous: IRecord,
  next: IRecord,
  write: (name: string, value: string) => void,
  erase: (name: string) => void,
): void {
  for (const name of Object.keys(previous)) {
    if (!Object.hasOwn(next, name)) erase(name);
  }
  for (const [name, value] of Object.entries(next)) {
    if (previous[name] !== value) write(name, value);
  }
}

export function applySpec(
  element: HTMLElement,
  previous: IDomSpec | undefined,
  next: IDomSpec,
): void {
  const before = previous ?? { classNames: [], css: {}, attributes: {} };
  const classes = next.classNames.join(' ');
  if (before.classNames.join(' ') !== classes) element.className = classes;
  syncRecord(
    before.css,
    next.css,
    (name, value) => element.style.setProperty(name, value),
    name => element.style.removeProperty(name),
  );
  syncRecord(
    before.attributes,
    next.attributes,
    (name, value) => element.setAttribute(name, value),
    name => element.removeAttribute(name),
  );
}
