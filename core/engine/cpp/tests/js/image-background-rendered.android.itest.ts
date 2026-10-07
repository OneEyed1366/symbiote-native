// Порт `ImageBackground-itest` (Fantom гоняет его на Android)
// Не портируем: `require('./img1.png')` (asset registry) и `imageRef` (DOM API)

import { createElement } from 'react';

import { createRoot, render } from './culling-fixture';
import { beforeEach, describe, expect, it, mounted, report } from './harness';

type IProps = Record<string, unknown>;

// Порядок ключей в mounted props не контракт, а `toEqual` сравнивает сериализацию
function sortKeys(props: IProps): IProps {
  const entries = Object.entries(props);
  entries.sort(([left], [right]) => (left < right ? -1 : 1));
  return Object.fromEntries(entries);
}

// Обёртка без своих пропсов схлопывается, как и у Fantom остаётся один `rn-image`
function innerImageProps(props: IProps, names: readonly string[]): IProps {
  render(createElement('image-background', props));
  const [image, ...rest] = mounted().children;
  expect(rest.length).toBe(0);
  expect(image?.viewName).toBe('Image');
  const kept = Object.entries({ ...image?.props }).filter(([key]) =>
    names.some(name => key === name || key.startsWith(`${name}-`)),
  );
  return sortKeys(Object.fromEntries(kept));
}

describe('<ImageBackground> props', () => {
  beforeEach(() => createRoot(200, 200));

  // Fantom ждёт `source-header-Authorization`: у одиночного source мы снимаем заголовки при записи
  // (см. `image-rendered.android.itest.ts`)
  it('can have remote source', () => {
    const source = {
      uri: 'https://reactnative.dev/img/tiny_logo.png',
      width: 100,
      height: 100,
      scale: 2,
      cache: 'only-if-cached',
      method: 'POST',
      body: 'name=React+Native',
      headers: { Authorization: 'Basic RandomString' },
    };

    expect(innerImageProps({ source }, ['source'])).toEqual(
      sortKeys({
        'source-body': 'name=React+Native',
        'source-cache': 'only-if-cached',
        'source-method': 'POST',
        'source-scale': '2',
        'source-size': '{100, 100}',
        'source-type': 'remote',
        'source-uri': 'https://reactnative.dev/img/tiny_logo.png',
      }),
    );
  });

  it('can have srcSet', () => {
    const srcSet =
      'https://reactnative.dev/img/tiny_logo.png 1x, https://reactnative.dev/img/header_logo.svg 2x';

    expect(innerImageProps({ srcSet }, ['source'])).toEqual(
      sortKeys({
        'source-1x-scale': '1',
        'source-1x-type': 'remote',
        'source-1x-uri': 'https://reactnative.dev/img/tiny_logo.png',
        'source-2x-scale': '2',
        'source-2x-type': 'remote',
        'source-2x-uri': 'https://reactnative.dev/img/header_logo.svg',
      }),
    );
  });

  it('style can be set', () => {
    const style = { width: 100, height: 100 };

    expect(innerImageProps({ style }, ['width', 'height'])).toEqual({
      height: '100',
      width: '100',
    });
  });
});

report();
