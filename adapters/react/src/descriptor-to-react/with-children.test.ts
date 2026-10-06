import { createElement } from 'react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { el } from '@symbiote-native/components';
import { descriptorToReactWithChildren } from './with-children';

// React 19 types `props` as `unknown`
function propsOf(element: ReactElement): Record<string, unknown> {
  const { props } = element;
  if (typeof props !== 'object' || props === null) throw new Error('no props');
  return Object.fromEntries(Object.entries(props));
}

describe('descriptorToReactWithChildren', () => {
  it('puts the app children after the children of the descriptor', () => {
    const appChild = createElement('text', { key: 'app' }, 'app');
    const element = descriptorToReactWithChildren(
      el('view', { testID: 'root' }, [
        el('view', { testID: 'own' }),
        'own text',
      ]),
      appChild,
    );

    const props = propsOf(element);
    expect(element.type).toBe('view');
    expect(props.testID).toBe('root');
    expect(props.children).toHaveLength(3);
    expect(props.children).toMatchObject([{}, 'own text', appChild]);
  });

  it('renders the descriptor alone when there are no app children', () => {
    const element = descriptorToReactWithChildren(
      el('view', {}, ['x']),
      undefined,
    );

    expect(propsOf(element).children).toEqual(['x', undefined]);
  });
});
