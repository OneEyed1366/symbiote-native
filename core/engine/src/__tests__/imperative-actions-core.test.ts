// Alert, Linking and Vibration reach their native modules through the host

import { describe, expect, it } from 'vitest';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { Alert, Linking, Vibration } from '../react-native-host';

describe('imperative engine modules reach the native bridge', () => {
  it('Alert.alert -> AlertManager.alertWithArgs', () => {
    Alert.alert('Title here', 'Body here', [{ text: 'OK' }]);

    const [call] = nativeCallsTo('AlertManager').slice(-1);
    expect(call?.method).toBe('alertWithArgs');
    expect(call?.args[0]).toMatchObject({
      title: 'Title here',
      message: 'Body here',
    });
  });

  it('Linking.openURL -> LinkingManager.openURL', async () => {
    await Linking.openURL('https://example.com/deep');

    const [call] = nativeCallsTo('LinkingManager').slice(-1);
    expect(call?.method).toBe('openURL');
    expect(call?.args[0]).toBe('https://example.com/deep');
  });

  it('Linking.canOpenURL / Linking.getInitialURL reach LinkingManager', async () => {
    await expect(Linking.canOpenURL('https://example.com')).resolves.toBe(true);
    await expect(Linking.getInitialURL()).resolves.toBeNull();
  });

  it('Vibration.vibrate -> Vibration.vibrate', () => {
    Vibration.vibrate(250);

    const [call] = nativeCallsTo('Vibration').slice(-1);
    expect(call?.method).toBe('vibrate');
    expect(call?.args[0]).toBe(250);
  });
});
