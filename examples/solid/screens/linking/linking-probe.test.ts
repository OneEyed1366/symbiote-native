import { describe, expect, it } from 'vitest';
import { DEMO_LINKING_CONFIG } from './demo-linking-config';
import { inspectLink, simulatorCommands } from './linking-probe';
import type { ILinkResolvers } from './linking-probe';

const PROFILE = { key: 'Profile', name: 'Profile', params: { id: '42' } };

// The matching rules have their tests in the package, here only what the probe adds to them
const links: ILinkResolvers = {
  resolve: (_config, url) => (url === 'demo://user/42' ? PROFILE : null),
  reverse: (_config, route) =>
    route.name === 'Profile' ? 'demo://user/42' : null,
};

describe('linking probe', () => {
  describe('Positive', () => {
    it('carries the screen, the params and the link back from the route found', () => {
      expect(inspectLink(links, DEMO_LINKING_CONFIG, 'demo://user/42')).toEqual(
        {
          kind: 'matched',
          name: 'Profile',
          params: { id: '42' },
          backUrl: 'demo://user/42',
        },
      );
    });

    it('quotes the url for the simulator and the emulator shells', () => {
      expect(simulatorCommands("demo://user/o'neil")).toEqual({
        ios: "xcrun simctl openurl booted 'demo://user/o'\\''neil'",
        android:
          "adb shell am start -W -a android.intent.action.VIEW -d 'demo://user/o'\\''neil'",
      });
    });
  });

  describe('Negative', () => {
    it('says the prefix is unknown for a url from another scheme', () => {
      expect(inspectLink(links, DEMO_LINKING_CONFIG, 'other://user/1')).toEqual(
        {
          kind: 'unmatched',
          reason: 'prefix',
        },
      );
    });

    it('says no screen matches for a known prefix or a bare path', () => {
      const expected = { kind: 'unmatched', reason: 'screen' };
      expect(inspectLink(links, DEMO_LINKING_CONFIG, 'demo://nothing')).toEqual(
        expected,
      );
      expect(inspectLink(links, DEMO_LINKING_CONFIG, '/nothing')).toEqual(
        expected,
      );
    });
  });
});
