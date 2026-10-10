// RN's `Alert` reached through the host, on the iOS path with AlertManager recorded by
// vitest.config.ts. The dialog logic is RN's, so this proves the wiring

import { describe, expect, it } from 'vitest';
import { nativeCallsTo } from '../../../test-utils/src/native-calls';
import { Alert } from '../react-native-host';

describe('Alert', () => {
  it('hands the title, message and button labels to AlertManager', () => {
    Alert.alert('Delete?', 'This cannot be undone', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]);

    const [call] = nativeCallsTo('AlertManager').slice(-1);
    expect(call?.method).toBe('alertWithArgs');
    expect(call?.args[0]).toMatchObject({
      title: 'Delete?',
      message: 'This cannot be undone',
      buttons: [{ 0: 'Cancel' }, { 1: 'Delete' }],
      cancelButtonKey: '0',
      destructiveButtonKey: '1',
    });
  });

  it('sends a prompt type to native verbatim', () => {
    Alert.prompt('PIN', undefined, () => {}, 'secure-text');

    const [call] = nativeCallsTo('AlertManager').slice(-1);
    expect(call?.args[0]).toMatchObject({ type: 'secure-text' });
  });
});
