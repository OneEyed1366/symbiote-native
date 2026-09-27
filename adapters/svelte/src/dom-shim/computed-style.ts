// The bare global `getComputedStyle`, which svelte/transition's fade/fly/scale/slide/blur call
// directly, not `document.getComputedStyle`. A Proxy, since a caller reads an arbitrary key built
// at runtime (slide derives `paddingTop`/`marginBottom` from its `axis` option).

import type { ShimElement } from './element';

export type IComputedStyle = Readonly<Record<string, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const DEFAULTS: Readonly<Record<string, string>> = {
  opacity: '1',
  transform: 'none',
  filter: 'none',
  display: 'flex',
  strokeLinecap: 'butt',
  strokeWidth: '0',
};

function styleValueOf(element: ShimElement, key: string): string {
  const style = element.p.style;
  const raw = isRecord(style) ? style[key] : undefined;
  if (raw !== undefined)
    return typeof raw === 'number' ? `${raw}px` : String(raw);
  // Two tokens, not `DEFAULTS`' single `'0px'` - `flip()` destructures this into [ox, oy] and
  // divides by clientWidth/Height, so a lone token leaves oy as NaN (real default is `50% 50%`).
  if (key === 'transformOrigin') {
    const { width, height } = element.getBoundingClientRect();
    return `${width / 2}px ${height / 2}px`;
  }
  return DEFAULTS[key] ?? '0px';
}

export function computedStyleOf(element: ShimElement): IComputedStyle {
  return new Proxy(
    {},
    {
      get(_target, key) {
        return typeof key === 'string' ? styleValueOf(element, key) : undefined;
      },
    },
  );
}
