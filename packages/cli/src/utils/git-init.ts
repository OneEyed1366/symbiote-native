import { execFileSync } from 'node:child_process';

// The one place this CLI shells out (see get-command.ts's own comment on why install/dev stay
// printed instructions instead) — `git init` is local-only, has no network/build side effects,
// and is trivially reversible (`rm -rf .git`), unlike the destructive or long-running commands
// this project otherwise refuses to run on the developer's behalf. Never commits: that decision
// (what goes in, the message) belongs to the developer, not the scaffold.
export function tryGitInit(root: string): boolean {
  try {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
