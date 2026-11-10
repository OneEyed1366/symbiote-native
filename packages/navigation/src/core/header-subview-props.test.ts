// Props of the `RNSScreenStackHeaderSubview` leaf, as the screens 4.30.0 header views set them

import { describe, expect, it, vi } from 'vitest';
import { featureFlags } from './screens-config';
import {
  resolveCustomHeaderSubviewElements,
  resolveCustomHeaderViews,
  resolveCustomHeaderSubviews,
  resolveHeaderBackImage,
  resolveHeaderSubviewHosts,
  resolveHeaderSubviewProps,
  resolveScreenHeaderSubviewProps,
} from './header-subviews';
import type { IHeaderViewOptions } from './header-subviews';
import type { IScreenOptions } from './navigator-props';

const ROW_STYLE = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
};

describe('header subview kind and layout', () => {
  it.each(['left', 'right', 'back', 'searchBar'] as const)(
    'sets the native type %s and the centered row style',
    kind => {
      const props = resolveHeaderSubviewProps(kind);

      expect(props.type).toBe(kind);
      expect(props.style).toEqual(ROW_STYLE);
    },
  );

  it('lets the center subview shrink so a long title does not push the side items out', () => {
    const props = resolveHeaderSubviewProps('center');

    expect(props.type).toBe('center');
    expect(props.style).toEqual({ ...ROW_STYLE, flexShrink: 1 });
  });
});

describe('header subview props from route options', () => {
  it('reads the priority and background flag of each side from its own options', () => {
    const options: IScreenOptions = {
      headerLeftVisibilityPriority: 'high',
      headerRightVisibilityPriority: 'low',
      headerLeftBackgroundVisible: true,
      headerRightBackgroundVisible: false,
    };

    const left = resolveScreenHeaderSubviewProps('left', options);
    const right = resolveScreenHeaderSubviewProps('right', options);

    expect(left.visibilityPriority).toBe('high');
    expect(left.hidesSharedBackground).toBe(false);
    expect(right.visibilityPriority).toBe('low');
    expect(right.hidesSharedBackground).toBe(true);
  });

  it('leaves both native defaults in place when the app sets neither option', () => {
    const props = resolveScreenHeaderSubviewProps('right', {});

    expect(props.visibilityPriority).toBeUndefined();
    expect(props.hidesSharedBackground).toBeUndefined();
  });

  it('gives the center subview no item options', () => {
    const props = resolveScreenHeaderSubviewProps('center', {
      headerLeftVisibilityPriority: 'high',
      headerRightBackgroundVisible: false,
    });

    expect(props.visibilityPriority).toBeUndefined();
    expect(props.hidesSharedBackground).toBeUndefined();
  });
});

describe('header subview synchronous shadow state updates', () => {
  it.each(['left', 'right', 'center', 'back', 'searchBar'] as const)(
    'sends the app-wide flag for the %s subview, on by default',
    kind => {
      expect(
        resolveHeaderSubviewProps(kind).synchronousShadowStateUpdatesEnabled,
      ).toBe(true);
    },
  );

  it('follows the app turning the flag off', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.synchronousHeaderSubviewUpdatesEnabled = false;
    try {
      expect(
        resolveHeaderSubviewProps('left').synchronousShadowStateUpdatesEnabled,
      ).toBe(false);
    } finally {
      featureFlags.experiment.synchronousHeaderSubviewUpdatesEnabled = true;
      vi.restoreAllMocks();
    }
  });
});

describe('header back image', () => {
  it('hosts the image in a back subview, centered and without a fade', () => {
    const source = { uri: 'https://example.test/back.png' };
    const backImage = resolveHeaderBackImage({ headerBackImageSource: source });

    expect(backImage?.hostProps.type).toBe('back');
    expect(backImage?.imageProps).toEqual({
      source,
      resizeMode: 'center',
      fadeDuration: 0,
    });
  });

  it('has no back subview when the app sets no source', () => {
    expect(resolveHeaderBackImage({})).toBeUndefined();
  });
});

describe('custom header subviews', () => {
  const source = { uri: 'https://example.test/back.png' };

  it('lists the kinds the adapter has a view for in a fixed order, then the back image', () => {
    const subviews = resolveCustomHeaderSubviews(
      { center: true, left: true },
      { headerBackImageSource: source },
    );

    expect(subviews.map(subview => subview.kind)).toEqual([
      'left',
      'center',
      'back',
    ]);
  });

  it('puts the image props on the back entry only', () => {
    const subviews = resolveCustomHeaderSubviews(
      { right: true },
      { headerBackImageSource: source },
    );

    expect(subviews[0]?.imageProps).toBeUndefined();
    expect(subviews[1]?.imageProps).toEqual({
      source,
      resizeMode: 'center',
      fadeDuration: 0,
    });
  });

  it('lists nothing when the adapter has no view and the app sets no image', () => {
    expect(resolveCustomHeaderSubviews({}, {})).toEqual([]);
  });

  it('skips a view given for a kind that hosts none', () => {
    expect(resolveCustomHeaderSubviews({ searchBar: true }, {})).toEqual([]);
  });
});

describe('app header views by subview kind', () => {
  it('files headerLeft, headerRight and headerTitle under left, right and center', () => {
    const views = resolveCustomHeaderViews({
      headerLeft: 'menu',
      headerRight: 'more',
      headerTitle: 'title',
    });

    expect(views).toEqual({ left: 'menu', right: 'more', center: 'title' });
  });

  it('leaves out a kind whose option the app did not set', () => {
    const views = resolveCustomHeaderViews({ headerTitle: 'title' });

    expect(Object.keys(views)).toEqual(['center']);
  });
});

describe('rendering the custom header subviews', () => {
  const source = { uri: 'https://example.test/back.png' };

  it('hands each leaf to the adapter with the app view output or the image', () => {
    const options: IScreenOptions & IHeaderViewOptions<unknown> = {
      headerLeft: () => 'menu',
      headerBackImageSource: source,
    };
    const rendered = resolveCustomHeaderSubviewElements(options, {
      subview: (host, content) => ({ kind: host.kind, content }),
      image: props => ({ image: props }),
    });

    expect(rendered).toEqual([
      { kind: 'left', content: 'menu' },
      {
        kind: 'back',
        content: { image: { source, resizeMode: 'center', fadeDuration: 0 } },
      },
    ]);
  });

  it('calls an app view once per render and none it was not given', () => {
    let calls = 0;
    resolveCustomHeaderSubviewElements(
      {
        headerRight: () => {
          calls += 1;
          return 'more';
        },
      },
      { subview: (_host, content) => content, image: props => props },
    );

    expect(calls).toBe(1);
  });
});

describe('header subview hosts', () => {
  it('lists a host for each kind the adapter has content for, in that order', () => {
    const hosts = resolveHeaderSubviewHosts(['right', 'center'], {});

    expect(hosts.map(host => host.kind)).toEqual(['right', 'center']);
  });

  it('lists no host when the adapter has no custom content', () => {
    expect(resolveHeaderSubviewHosts([], {})).toEqual([]);
  });

  it('gives each host the props of its kind and the route options', () => {
    const options: IScreenOptions = { headerLeftVisibilityPriority: 'high' };
    const [host] = resolveHeaderSubviewHosts(['left'], options);

    expect(host?.props).toEqual(
      resolveScreenHeaderSubviewProps('left', options),
    );
  });
});

describe('header subview iOS item options', () => {
  it.each(['left', 'right'] as const)(
    'sends visibilityPriority and hidesSharedBackground of a %s subview to native',
    kind => {
      const props = resolveHeaderSubviewProps(kind, {
        visibilityPriority: 'low',
        hidesSharedBackground: true,
      });

      expect(props.visibilityPriority).toBe('low');
      expect(props.hidesSharedBackground).toBe(true);
    },
  );

  it.each(['center', 'back', 'searchBar'] as const)(
    'drops the item options of a %s subview, native reads them for left and right only',
    kind => {
      const props = resolveHeaderSubviewProps(kind, {
        visibilityPriority: 'high',
        hidesSharedBackground: true,
      });

      expect(props.visibilityPriority).toBeUndefined();
      expect(props.hidesSharedBackground).toBeUndefined();
    },
  );

  it('leaves the native standard priority in place when the app sets none', () => {
    const props = resolveHeaderSubviewProps('left');

    expect(props.visibilityPriority).toBeUndefined();
    expect(props.hidesSharedBackground).toBeUndefined();
  });
});
