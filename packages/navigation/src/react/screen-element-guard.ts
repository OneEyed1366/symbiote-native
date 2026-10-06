// The type guard a navigator hands to `collectRegistry` to pick its own screen markers

import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

export function screenElementGuard<TProps>(
  marker: unknown,
): (child: ReactNode) => child is ReactElement<TProps> {
  return (child): child is ReactElement<TProps> =>
    isValidElement(child) && child.type === marker;
}
