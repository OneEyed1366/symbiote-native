// Порт `Image-itest` (Fantom гоняет его на Android), пропсы читаем со смонтированного дерева
// Не портируем: `require('./img1.png')` (нет asset registry, он в `image-source-resolver.test.ts`),
// `ref` с `ReactNativeElement` (DOM API) и статики (`image-loader.test.ts`, fake ImageLoader)

import { createElement, Fragment } from 'react';

import {
  accessibilityPropsSuite,
  testIDPropSuite,
} from './accessibility-props-suite';
import { createRoot, render } from './culling-fixture';
import {
  beforeEach,
  describe,
  dispatchEvent,
  expect,
  it,
  mounted,
  report,
} from './harness';

const LOGO = { uri: 'https://reactnative.dev/img/tiny_logo.png' };
const HEADER_LOGO = 'https://reactnative.dev/img/header_logo.svg';
const LARGE_LOGO = 'https://reactnative.dev/img/large_logo.svg';

type IProps = Record<string, unknown>;

// Порядок ключей в mounted props не контракт, а `toEqual` сравнивает сериализацию
function sortKeys(props: IProps): IProps {
  const entries = Object.entries(props);
  entries.sort(([left], [right]) => (left < right ? -1 : 1));
  return Object.fromEntries(entries);
}

function mountedImages(...elements: ReturnType<typeof createElement>[]) {
  render(createElement(Fragment, null, ...elements));
  return mounted().children;
}

// Как `getRenderedOutput({props})`: имя целиком или с префиксом `name-`
function picked(props: IProps, names: readonly string[]): IProps {
  const image = mountedImages(createElement('image', props))[0];
  expect(image?.viewName).toBe('Image');
  return Object.fromEntries(
    Object.entries({ ...image?.props }).filter(([key]) =>
      names.some(name => key === name || key.startsWith(`${name}-`)),
    ),
  );
}

function expectPicked(
  props: IProps,
  names: readonly string[],
  expected: IProps,
): void {
  expect(sortKeys(picked(props, names))).toEqual(sortKeys(expected));
}

const REMOTE = { 'source-scale': '1', 'source-type': 'remote' };
const LOGO_REMOTE = { ...REMOTE, 'source-uri': LOGO.uri };

describe('<Image> props', () => {
  beforeEach(() => createRoot(200, 200));

  // TODO T233552213 в RN: пустой source пока шлётся, поэтому и у нас
  it('renders an empty element when there are no props', () => {
    const everything = ['overflow', 'resizeMode', 'source'];
    const expected = { overflow: 'hidden', resizeMode: 'cover', ...REMOTE };

    expectPicked({}, everything, expected);
    expectPicked({ src: '' }, everything, expected);
  });

  it('provides blur radius for image', () => {
    expectPicked({ blurRadius: 10 }, ['blurRadius'], { blurRadius: '10' });
  });

  it('does not set any headers in anonymous mode', () => {
    expectPicked({ source: LOGO }, ['source'], LOGO_REMOTE);
    expectPicked(
      { crossOrigin: 'anonymous', source: LOGO },
      ['source'],
      LOGO_REMOTE,
    );
  });

  it('sets the "Access-Control-Allow-Credentials" header in "use-credentials" mode', () => {
    expectPicked(
      { crossOrigin: 'use-credentials', source: LOGO },
      ['source-header'],
      { 'source-header-Access-Control-Allow-Credentials': 'true' },
    );
  });

  it('provides height for image', () => {
    expectPicked({ height: 100, source: LOGO }, ['height'], { height: '100' });
  });

  it('provides width for image', () => {
    expectPicked({ width: 100, source: LOGO }, ['width'], { width: '100' });
  });

  const POLICIES = [
    'no-referrer',
    'no-referrer-when-downgrade',
    'origin',
    'origin-when-cross-origin',
    'same-origin',
    'strict-origin',
    'strict-origin-when-cross-origin',
    'unsafe-url',
  ];
  for (const referrerPolicy of POLICIES) {
    it(`${referrerPolicy} sets correct "Referrer-Policy" header`, () => {
      const images = mountedImages(
        createElement('image', { referrerPolicy, src: LOGO.uri }),
        createElement('image', { referrerPolicy, source: LOGO }),
      );

      expect(images.length).toBe(2);
      for (const image of images) {
        const headers = Object.keys({ ...image.props }).filter(key =>
          key.startsWith('source-header'),
        );
        expect(headers).toEqual(['source-header-Referrer-Policy']);
        expect(image.props['source-header-Referrer-Policy']).toBe(
          referrerPolicy,
        );
      }
    });
  }
});

describe('<Image> resizeMode', () => {
  beforeEach(() => createRoot(200, 200));

  it('is set to "cover" by default', () => {
    expectPicked({ source: LOGO }, ['resizeMode'], { resizeMode: 'cover' });
  });

  it('can be set to "cover" explicitly', () => {
    expectPicked({ resizeMode: 'cover', source: LOGO }, ['resizeMode'], {
      resizeMode: 'cover',
    });
  });

  // stretch это нативный умолчательный режим, проп не отправляется вовсе
  it('can be set to "stretch", which is the same as not setting it', () => {
    expectPicked({ resizeMode: 'stretch', source: LOGO }, ['resizeMode'], {});
  });

  for (const resizeMode of ['contain', 'repeat', 'center']) {
    it(`can be set to "${resizeMode}"`, () => {
      expectPicked({ resizeMode, source: LOGO }, ['resizeMode'], {
        resizeMode,
      });
    });
  }
});

describe('<Image> source', () => {
  beforeEach(() => createRoot(200, 200));

  // RN оставляет `source-header-Authorization` и в одиночном source, мы снимаем при записи
  // (`dropsSingleSourceHeaders`), иначе C++ поднял бы их в `headers`. Native их не читает
  it('can be set to a remote image', () => {
    const source = {
      uri: LOGO.uri,
      width: 100,
      height: 100,
      scale: 2,
      cache: 'only-if-cached',
      method: 'POST',
      body: 'name=React+Native',
      headers: { Authorization: 'Basic RandomString' },
    };

    expectPicked({ source }, ['source'], {
      'source-body': 'name=React+Native',
      'source-cache': 'only-if-cached',
      'source-method': 'POST',
      'source-scale': '2',
      'source-size': '{100, 100}',
      'source-type': 'remote',
      'source-uri': LOGO.uri,
    });
  });

  it('can be set to a list of remote images', () => {
    const source = [
      {
        uri: LOGO.uri,
        scale: 1,
        headers: { Authorization: 'Basic RandomString' },
      },
      {
        uri: 'https://reactnative.dev/img/medium_logo.png',
        scale: 2,
        cache: 'only-if-cached',
      },
      {
        uri: 'https://reactnative.dev/img/large_logo.png',
        scale: 3,
        method: 'POST',
      },
    ];

    expectPicked({ source }, ['source'], {
      'source-1x-header-Authorization': 'Basic RandomString',
      'source-1x-scale': '1',
      'source-1x-type': 'remote',
      'source-1x-uri': LOGO.uri,
      'source-2x-cache': 'only-if-cached',
      'source-2x-scale': '2',
      'source-2x-type': 'remote',
      'source-2x-uri': 'https://reactnative.dev/img/medium_logo.png',
      'source-3x-method': 'POST',
      'source-3x-type': 'remote',
      'source-3x-uri': 'https://reactnative.dev/img/large_logo.png',
    });
  });
});

describe('<Image> src and srcSet', () => {
  beforeEach(() => createRoot(200, 200));

  it('src can be set to a remote image', () => {
    expectPicked({ src: LOGO.uri }, ['source'], LOGO_REMOTE);
  });

  it('src takes precedence over `source` prop', () => {
    const source = { uri: 'https://reactnative.dev/img/medium_logo.png' };

    expectPicked({ src: LOGO.uri, source }, ['source'], LOGO_REMOTE);
  });

  it('src merges dimension information into source', () => {
    expectPicked(
      { src: LOGO.uri, width: 40, height: 40 },
      ['source', 'width', 'height'],
      { ...LOGO_REMOTE, 'source-size': '{40, 40}', width: '40', height: '40' },
    );
  });

  const SCALES = {
    'source-1x-scale': '1',
    'source-1x-type': 'remote',
    'source-1x-uri': LOGO.uri,
    'source-2x-scale': '2',
    'source-2x-type': 'remote',
    'source-2x-uri': HEADER_LOGO,
  };

  it('srcSet can be set to a list of remote images', () => {
    const srcSet = `${LOGO.uri} 1x, ${HEADER_LOGO} 2x`;

    expectPicked({ srcSet }, ['source'], SCALES);
  });

  it('srcSet defaults to `1x` descriptor', () => {
    const srcSet = `${LOGO.uri}, ${HEADER_LOGO} 2x`;

    expectPicked({ srcSet }, ['source'], SCALES);
  });

  it('srcSet uses `src` for `1x` descriptor when provided', () => {
    const srcSet = `${HEADER_LOGO} 2x, ${LARGE_LOGO} 3x`;

    expectPicked({ srcSet, src: LOGO.uri }, ['source'], {
      ...SCALES,
      'source-3x-type': 'remote',
      'source-3x-uri': LARGE_LOGO,
    });
  });
});

describe('<Image> style, tint, accessibility', () => {
  beforeEach(() => createRoot(200, 200));

  it('style can be set', () => {
    const style = { width: 100, height: 100, resizeMode: 'contain' };

    expectPicked({ style, source: LOGO }, ['width', 'height', 'resizeMode'], {
      height: '100',
      resizeMode: 'contain',
      width: '100',
    });
  });

  it('tintColor can be set', () => {
    expectPicked({ tintColor: 'red', source: LOGO }, ['tintColor'], {
      tintColor: 'rgba(255, 0, 0, 1)',
    });
  });

  it('aria-hidden is passed as importantForAccessibility', () => {
    expectPicked({ 'aria-hidden': true }, ['importantForAccessibility'], {
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

describe('<Image> defaultSource', () => {
  beforeEach(() => createRoot(200, 200));

  // Fantom резолвит `require` в file uri, здесь тот же вид задан напрямую
  it('can provide a default image to display', () => {
    const uri = 'file://drawable-mdpi/img1.png';

    expectPicked({ defaultSource: { uri }, source: LOGO }, ['defaultSource'], {
      'defaultSource-type': 'remote',
      'defaultSource-uri': uri,
    });
  });
});

describe('<Image> loading progress', () => {
  beforeEach(() => createRoot(200, 200));

  const EVENTS = [
    ['onError', 'fails to load'],
    ['onLoadStart', 'start loading'],
    ['onProgress', 'is loading'],
    ['onLoad', 'loads successfully'],
    ['onLoadEnd', 'ends loading'],
  ];
  for (const [onProp, event] of EVENTS) {
    it(`${onProp} is called when image ${event}`, () => {
      let called = 0;
      const handlers = Object.fromEntries(
        EVENTS.map(([name]) => [
          name,
          () => {
            called += name === onProp ? 1 : 0;
          },
        ]),
      );
      const [image] = mountedImages(
        createElement('image', { source: LOGO, ...handlers }),
      );
      expect(called).toBe(0);

      dispatchEvent(image?.tag ?? 0, onProp, {});

      expect(called).toBe(1);
    });
  }
});

function readImage(props: IProps): IProps {
  const [image] = mountedImages(
    createElement('image', { ...props, source: LOGO }),
  );
  return { ...image?.props };
}

accessibilityPropsSuite(readImage, false);
testIDPropSuite(readImage);

report();
