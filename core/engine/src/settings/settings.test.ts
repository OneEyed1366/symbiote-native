// RN's iOS `Settings` reached through the host, over the SettingsManager vitest.config.ts stubs
// (it ships `{ foo: 1 }`). The watcher registry is RN's, so this proves the wiring and the throw

import { describe, expect, it, vi } from 'vitest';
import { emitRnDeviceEvent } from '../../../test-utils/src/rn-device-event';
import { Settings } from '../react-native-host';

describe('Settings', () => {
  describe('Positive (a read, a write or a native edit succeeds)', () => {
    it('seeds the snapshot from the defaults native shipped', () => {
      expect(Settings.get('foo')).toBe(1);
    });

    it('keeps a value the app set and never fires its own watcher for it', () => {
      const watcher = vi.fn();
      Settings.watchKeys('written', watcher);

      Settings.set({ written: 2 });

      expect(Settings.get('written')).toBe(2);
      expect(watcher).not.toHaveBeenCalled();
    });

    it('fires a watcher when native edits its key, and only then', () => {
      const watcher = vi.fn();
      Settings.watchKeys('edited', watcher);

      emitRnDeviceEvent('settingsUpdated', { unrelated: 'x' });
      emitRnDeviceEvent('settingsUpdated', { edited: 3 });

      expect(watcher).toHaveBeenCalledOnce();
      expect(Settings.get('edited')).toBe(3);
    });

    it('stops firing a watcher once it is cleared', () => {
      const watcher = vi.fn();
      const watchId = Settings.watchKeys('cleared', watcher);

      Settings.clearWatch(watchId);
      emitRnDeviceEvent('settingsUpdated', { cleared: 4 });

      expect(watcher).not.toHaveBeenCalled();
    });
  });

  describe('Negative (RN throws, and that throw is the contract)', () => {
    it('rejects keys that are neither a string nor an array', () => {
      expect(() =>
        Reflect.apply(Settings.watchKeys, undefined, [5, () => {}]),
      ).toThrow('keys should be a string or array of strings');
    });
  });
});
