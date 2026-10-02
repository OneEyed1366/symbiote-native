import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coveredPackages,
  isExempt,
  missingPackages,
  parseNulList,
  stripMessageComments,
  touchedPackages,
} from './check-commit-changeset.mjs';

const entries = [
  { name: '@symbiote-native/battery', dir: 'packages/battery' },
  { name: '@symbiote-native/engine', dir: 'core/engine' },
];

const editorTemplate = (branch, path) =>
  [
    'feat(battery): add hook',
    '',
    '# Please enter the commit message for your changes. Lines starting',
    "# with '#' will be ignored, and an empty message aborts the commit.",
    '#',
    `# On branch ${branch}`,
    '# Changes to be committed:',
    `#\tnew file:   ${path}`,
    '#',
  ].join('\n');

test('a message that starts with WIP exempts the commit, any case, with or without a scope', () => {
  for (const message of ['WIP: audio', 'wip audio', 'WIP(audio): x', 'wip\n\nbody']) {
    assert.equal(isExempt(message, { merging: false }), true, message);
  }
});

test('WIP anywhere but the start of the message does not exempt', () => {
  for (const message of ['feat: add WIP badge', 'feat: x\n\nWIP', 'wipe cache', 'swipe gesture']) {
    assert.equal(isExempt(message, { merging: false }), false, message);
  }
  assert.equal(isExempt('feat(battery): add hook', { merging: false }), false);
});

test('git template comments cannot exempt a commit through a branch or path named wip', () => {
  assert.equal(isExempt(editorTemplate('wip/audio', 'packages/battery/a.ts'), { merging: false }), false);
  assert.equal(isExempt(editorTemplate('main', 'packages/wip-tools/a.ts'), { merging: false }), false);
});

test('everything under the verbose scissors line is ignored', () => {
  const message = [
    'feat: x',
    '# ------------------------ >8 ------------------------',
    'diff --git a/packages/battery/wip.ts b/packages/battery/wip.ts',
    '+// WIP',
  ].join('\n');
  assert.equal(stripMessageComments(message), 'feat: x');
  assert.equal(isExempt(message, { merging: false }), false);
});

test('a configured comment character replaces the default hash', () => {
  const message = 'feat: x\n; On branch wip/x\n# kept as text';
  assert.equal(stripMessageComments(message, ';'), 'feat: x\n# kept as text');
});

test('a hand-typed Merge message does not exempt, a real merge in progress does', () => {
  assert.equal(isExempt('Merge fix for battery', { merging: false }), false);
  assert.equal(isExempt('Merge branch develop', { merging: true }), true);
});

test('fixup and squash commits are exempt because autosquash folds them away', () => {
  assert.equal(isExempt('fixup! feat: a', { merging: false }), true);
  assert.equal(isExempt('squash! feat: a', { merging: false }), true);
});

test('a NUL-separated path list keeps non-ASCII names intact', () => {
  assert.deepEqual(parseNulList('packages/battery/файл.ts\0core/engine/a b.ts\0'), [
    'packages/battery/файл.ts',
    'core/engine/a b.ts',
  ]);
  assert.deepEqual(parseNulList(''), []);
});

test('only shipped files of a published package count', () => {
  const files = [
    'packages/battery/src/index.ts',
    'packages/battery/src/battery.test.ts',
    'core/engine/cpp/tests/a.cpp',
    'examples/react/App.tsx',
  ];
  assert.deepEqual(touchedPackages(files, entries), ['@symbiote-native/battery']);
});

test('quoted names in the changeset frontmatter are covered, the body is ignored', () => {
  const text = "---\n'@symbiote-native/battery': patch\n---\n\n'@symbiote-native/engine': mentioned in prose\n";
  assert.deepEqual([...coveredPackages([text])], ['@symbiote-native/battery']);
});

test('a name after a horizontal rule in the body does not cover when the frontmatter is empty', () => {
  const text = "---\n---\n\nText\n\n---\n'@symbiote-native/engine': patch\n---\n";
  assert.deepEqual([...coveredPackages([text])], []);
});

test('a file without a leading frontmatter fence covers nothing', () => {
  const text = "Notes\n---\n'@symbiote-native/engine': patch\n---\nbody\n";
  assert.deepEqual([...coveredPackages([text])], []);
});

test('CRLF line endings and double quotes in the frontmatter still cover', () => {
  const text = '---\r\n"@symbiote-native/battery": minor\r\n---\r\n\r\nbody\r\n';
  assert.deepEqual([...coveredPackages([text])], ['@symbiote-native/battery']);
});

test('missing lists the touched packages no changeset names', () => {
  const files = ['packages/battery/README.md', 'core/engine/src/index.ts'];
  const text = "---\n'@symbiote-native/battery': patch\n---\nx\n";
  assert.deepEqual(missingPackages(files, [text], entries), ['@symbiote-native/engine']);
  assert.deepEqual(missingPackages(files, [], entries), [
    '@symbiote-native/battery',
    '@symbiote-native/engine',
  ]);
});
