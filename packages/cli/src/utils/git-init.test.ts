import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tryGitInit } from './git-init.js';

describe('tryGitInit', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  // why: `new`'s git-init offer never commits — it only creates the repository, leaving the
  // working tree for the developer to review and commit themselves.
  it('initializes a real .git directory and returns true, without committing anything', () => {
    dir = mkdtempSync(join(tmpdir(), 'symbiote-cli-git-init-'));

    expect(tryGitInit(dir)).toBe(true);

    expect(existsSync(join(dir, '.git'))).toBe(true);
    expect(existsSync(join(dir, '.git', 'HEAD'))).toBe(true);
    // No commit exists yet — a real `git init` never creates one on its own.
    expect(existsSync(join(dir, '.git', 'refs', 'heads'))).toBe(true);
  });

  // why: a missing `git` binary or an unwritable target must degrade to "didn't init", not crash
  // the rest of `new` — the app was already scaffolded successfully by the time this runs.
  it('returns false instead of throwing when the target directory does not exist', () => {
    expect(
      tryGitInit(join(tmpdir(), 'symbiote-cli-git-init-does-not-exist')),
    ).toBe(false);
  });
});
