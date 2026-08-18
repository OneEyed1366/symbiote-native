// Co-located unit test (ADR 0025) for the pure linking-config resolver: URL->route and
// route->URL, over a flat route and a ':param' route, plus the nested-config flattening and the
// prefix-vs-bare-path forms called out in the task ('myapp://user/42' and '/user/42').
//
// No Negative group: neither resolver throws - an unresolvable URL/route is `null`, a legitimate
// outcome asserted directly (`returns null for ...`), not a caught error. The private helpers
// (normalizeSegment, joinPath, flattenScreens, dynamicSegmentCount/segmentCount, bySpecificity,
// matchPattern, stripQueryAndHash, extractPathname, fillPattern) have no test of their own -
// N/A, exercised only through the two public resolvers, which is how every call site reaches
// them too.

import { describe, expect, it } from 'vitest';
import { resolveRouteFromUrl, resolveUrlFromRoute } from './index';
import type { ILinkingConfig } from './index';
import type { IRoute } from '../navigator-state';

const CONFIG: ILinkingConfig = {
  prefixes: ['myapp://', 'https://example.com'],
  config: {
    screens: {
      Home: '',
      User: 'user/:id',
      Settings: {
        path: 'settings',
        screens: {
          Profile: 'profile',
        },
      },
    },
  },
};

describe('resolveRouteFromUrl', () => {
  it('resolves a flat route with no params, scheme prefix', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://')).toEqual({
      key: 'Home',
      name: 'Home',
      params: undefined,
    });
  });

  it('resolves a :param route through a scheme prefix', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://user/42')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '42' },
    });
  });

  it('resolves the same :param route through a bare path (no configured prefix match)', () => {
    expect(resolveRouteFromUrl(CONFIG, '/user/42')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '42' },
    });
  });

  it('resolves a :param route through an https prefix', () => {
    expect(resolveRouteFromUrl(CONFIG, 'https://example.com/user/7')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '7' },
    });
  });

  it('resolves a nested screen to its leaf name, path accumulated from the group', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://settings/profile')).toEqual({
      key: 'Profile',
      name: 'Profile',
      params: undefined,
    });
  });

  it('decodes a percent-encoded param segment', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://user/john%20doe')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: 'john doe' },
    });
  });

  it('returns null for a url matching no configured screen', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://nowhere')).toBeNull();
  });

  it('returns null for a url matching no configured prefix and no leading slash', () => {
    expect(resolveRouteFromUrl(CONFIG, 'otherapp://user/42')).toBeNull();
  });

  // why: strips query/hash before matching (stripQueryAndHash) - otherwise '?x=1'/'#y' would
  // become part of the last path segment and silently break every param/literal match.
  it('ignores a trailing query string when matching', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://user/42?ref=email')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '42' },
    });
  });

  it('ignores a trailing hash fragment when matching', () => {
    expect(resolveRouteFromUrl(CONFIG, 'myapp://user/42#section')).toEqual({
      key: 'User',
      name: 'User',
      params: { id: '42' },
    });
  });

  // why: a screen entry with neither `path` nor `screens` is a dead leaf (flattenScreens'
  // `dlog(...); skip` branch) - it must never resolve, matching react-navigation's requirement
  // that every reachable screen declare a path. `{}` is a legal IScreenLinkingConfig (both
  // fields optional), so this is a real, type-honest input, not a forced edge case.
  it('never resolves a screen entry with neither a path nor nested screens', () => {
    const config: ILinkingConfig = {
      prefixes: ['myapp://'],
      config: { screens: { Home: '', Ghost: {} } },
    };
    expect(resolveRouteFromUrl(config, 'myapp://ghost')).toBeNull();
  });

  it('bySpecificity: a literal pattern wins over a param pattern that would also match', () => {
    // why: mirrors react-navigation's "prefer exact matches" rule (source comment on
    // bySpecificity) - '/user/me' must resolve to the literal Me screen, not fall through to
    // User's ':id' pattern just because both would technically match the same URL.
    const config: ILinkingConfig = {
      prefixes: ['myapp://'],
      config: {
        screens: {
          User: 'user/:id',
          Me: 'user/me',
        },
      },
    };
    expect(resolveRouteFromUrl(config, 'myapp://user/me')).toEqual({
      key: 'Me',
      name: 'Me',
      params: undefined,
    });
  });

  it('the longer of two overlapping prefixes wins the match', () => {
    // why: extractPathname sorts prefixes longest-first specifically so a more specific prefix
    // ('myapp://sub/') is stripped before the shorter one ('myapp://') gets a chance to also
    // match and leave a longer, wrong leftover pathname. Stripping the long prefix leaves
    // 'user/42' (2 segments), which only Root's pattern matches; stripping the short prefix
    // instead would leave 'sub/user/42' (3 segments), which would resolve to ViaShortPrefix -
    // a different, wrong screen. Resolving to Root proves the long prefix was tried first.
    const config: ILinkingConfig = {
      prefixes: ['myapp://', 'myapp://sub/'],
      config: {
        screens: {
          Root: 'user/:id',
          ViaShortPrefix: 'sub/user/:id',
        },
      },
    };
    expect(resolveRouteFromUrl(config, 'myapp://sub/user/42')).toEqual({
      key: 'Root',
      name: 'Root',
      params: { id: '42' },
    });
  });
});

describe('resolveUrlFromRoute', () => {
  it('builds a url for a flat route with no params', () => {
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'Home',
      params: undefined,
    };
    expect(resolveUrlFromRoute(CONFIG, route)).toBe('myapp://');
  });

  it('builds a url for a :param route', () => {
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'User',
      params: { id: '42' },
    };
    expect(resolveUrlFromRoute(CONFIG, route)).toBe('myapp://user/42');
  });

  it('builds a url for a nested screen using its accumulated path', () => {
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'Profile',
      params: undefined,
    };
    expect(resolveUrlFromRoute(CONFIG, route)).toBe('myapp://settings/profile');
  });

  it('returns null when a required param is missing', () => {
    const route: IRoute<unknown> = { key: 'k', name: 'User', params: {} };
    expect(resolveUrlFromRoute(CONFIG, route)).toBeNull();
  });

  it('returns null for an unconfigured route name', () => {
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'Nowhere',
      params: undefined,
    };
    expect(resolveUrlFromRoute(CONFIG, route)).toBeNull();
  });

  // why: 'https://example.com' (CONFIG's second prefix) has no trailing '/' - the builder must
  // insert one itself rather than concatenate straight into 'https://example.compath', which the
  // source comment calls out explicitly ("only add a '/' when the prefix doesn't have one").
  it('inserts a separator when the configured prefix has no trailing slash', () => {
    const config: ILinkingConfig = {
      ...CONFIG,
      prefixes: ['https://example.com'],
    };
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'User',
      params: { id: '42' },
    };
    expect(resolveUrlFromRoute(config, route)).toBe(
      'https://example.com/user/42',
    );
  });

  // why: an app with no configured prefixes still needs a usable in-app path (e.g. for a
  // programmatic deep-link test harness) - falls back to a bare leading-slash path instead of
  // returning null just because there's nothing to prepend.
  it('falls back to a bare leading-slash path when no prefix is configured', () => {
    const config: ILinkingConfig = { ...CONFIG, prefixes: [] };
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'User',
      params: { id: '42' },
    };
    expect(resolveUrlFromRoute(config, route)).toBe('/user/42');
  });

  it('falls back to "/" for the root route when no prefix is configured', () => {
    const config: ILinkingConfig = { ...CONFIG, prefixes: [] };
    const route: IRoute<unknown> = {
      key: 'k',
      name: 'Home',
      params: undefined,
    };
    expect(resolveUrlFromRoute(config, route)).toBe('/');
  });
});
