import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffValues } from './audit-expo-mod-drift.mjs';

test('diffValues finds no diffs for identical structures', () => {
  const value = { manifest: { 'uses-permission': [{ $: { 'android:name': 'X' } }] } };
  assert.deepEqual(diffValues(value, structuredClone(value)), []);
});

test('diffValues reports an appended array entry by its trailing index', () => {
  const before = { 'uses-permission': [{ $: { 'android:name': 'INTERNET' } }] };
  const after = {
    'uses-permission': [
      { $: { 'android:name': 'INTERNET' } },
      { $: { 'android:name': 'RECORD_AUDIO' } },
    ],
  };
  const diffs = diffValues(before, after);
  assert.equal(diffs.length, 1);
  assert.equal(diffs[0].path, 'uses-permission.1');
  assert.equal(diffs[0].before, undefined);
  assert.deepEqual(diffs[0].after, { $: { 'android:name': 'RECORD_AUDIO' } });
});

test('diffValues reports a changed scalar attribute by its full path', () => {
  const before = { activity: [{ $: { 'android:configChanges': 'uiMode' } }] };
  const after = { activity: [{ $: { 'android:configChanges': 'uiMode|locale' } }] };
  const diffs = diffValues(before, after);
  assert.deepEqual(diffs, [
    { path: 'activity.0.$.android:configChanges', before: 'uiMode', after: 'uiMode|locale' },
  ]);
});
