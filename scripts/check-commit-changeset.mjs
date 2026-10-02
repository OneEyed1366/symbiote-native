// Runs from commit-msg because only that hook sees the message, and a leading WIP skips the check
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const DEFAULT_COMMENT_CHAR = '#';
const WIP_MESSAGE = /^wip\b/i;
const SQUASHED_MESSAGE = /^(fixup! |squash! )/;
const NOT_SHIPPED = /(\.test\.|\.itest\.|\.detox\.|\/tests?\/|\/__tests__\/|CHANGELOG\.md$)/;
const CHANGESET_FILE = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;
const CHANGESET_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const CHANGESET_NAME = /^['"](@[^'"]+)['"]\s*:/gm;
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

// git appends its own template (branch, staged paths, verbose diff) as comments to the message file
export const stripMessageComments = (raw, commentChar = DEFAULT_COMMENT_CHAR) => {
  const scissors = `${commentChar} ${'-'.repeat(24)} >8 ${'-'.repeat(24)}`;
  const kept = [];
  for (const line of raw.split('\n')) {
    if (line === scissors) break;
    if (!line.startsWith(commentChar)) kept.push(line);
  }
  return kept.join('\n').trim();
};

export const isExempt = (message, { merging, commentChar }) => {
  const text = stripMessageComments(message, commentChar);
  return merging || WIP_MESSAGE.test(text) || SQUASHED_MESSAGE.test(text);
};

export const parseNulList = (raw) => raw.split('\0').filter(Boolean);

export const touchedPackages = (files, entries) => {
  const touched = new Set();
  for (const file of files) {
    if (NOT_SHIPPED.test(file)) continue;
    const owner = entries.find((entry) => file.startsWith(`${entry.dir}/`));
    if (owner) touched.add(owner.name);
  }
  return [...touched].sort();
};

export const coveredPackages = (changesetTexts) => {
  const covered = new Set();
  for (const text of changesetTexts) {
    const frontmatter = CHANGESET_FRONTMATTER.exec(text)?.[1] ?? '';
    for (const match of frontmatter.matchAll(CHANGESET_NAME)) covered.add(match[1]);
  }
  return covered;
};

export const missingPackages = (files, changesetTexts, entries) => {
  const covered = coveredPackages(changesetTexts);
  return touchedPackages(files, entries).filter((name) => !covered.has(name));
};

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: MAX_GIT_OUTPUT });

// --no-renames lists both sides of a move, -z keeps non-ASCII paths unquoted
const stagedNames = (filter) =>
  parseNulList(git('diff', '--cached', '--name-only', '--no-renames', '-z', `--diff-filter=${filter}`));

const stagedChangesetTexts = () =>
  stagedNames('AM')
    .filter((file) => CHANGESET_FILE.test(file))
    .map((file) => git('show', `:${file}`));

const isMerging = () => existsSync(git('rev-parse', '--git-path', 'MERGE_HEAD').trim());

const configuredCommentChar = () => {
  try {
    const value = git('config', 'core.commentChar').trim();
    return value.length === 1 ? value : DEFAULT_COMMENT_CHAR;
  } catch {
    return DEFAULT_COMMENT_CHAR;
  }
};

const main = () => {
  const message = readFileSync(process.argv[2], 'utf8');
  if (isExempt(message, { merging: isMerging(), commentChar: configuredCommentChar() })) return 0;

  const missing = missingPackages(
    stagedNames('ACMRD'),
    stagedChangesetTexts(),
    publishablePackageEntries(),
  );
  if (missing.length === 0) return 0;

  console.error(
    [
      'This commit changes published packages that have no changeset in the same commit:',
      ...missing.map((name) => `  - ${name}`),
      '',
      'Run `pnpm exec changeset`, stage the new .changeset/*.md file and commit again',
      'Not a finished change? Start the commit message with WIP instead of feat, docs, chore, ...',
    ].join('\n'),
  );
  return 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());
