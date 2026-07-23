// Auto-detects which publishable @symbiote-native/* package(s) changed in this PR
// (`git diff --name-only <base>...<head>`, base/head SHAs wired in by the workflow
// step from the pull_request event) and resolves them to package DIRECTORIES —
// replaces the old workflow_dispatch checkbox selection now that publish-canary
// triggers on every PR instead of a human ticking boxes.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const baseSha = (process.env.CANARY_BASE_SHA ?? '').trim();
const headSha = (process.env.CANARY_HEAD_SHA ?? '').trim();
if (!baseSha || !headSha) {
  console.error('CANARY_BASE_SHA and CANARY_HEAD_SHA must both be set (the workflow step wires these from the pull_request event).');
  process.exit(1);
}

const changedFiles = execFileSync('git', ['diff', '--name-only', `${baseSha}...${headSha}`], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const entries = publishablePackageEntries().filter((entry) =>
  changedFiles.some((file) => file === entry.dir || file.startsWith(`${entry.dir}/`)),
);

if (entries.length === 0) {
  console.error('No publishable @symbiote-native/* package changed in this PR — nothing to canary-publish.');
  process.exit(1);
}

const dirs = entries.map((e) => e.dir).join(' ');
const names = entries.map((e) => e.name).join(',');
console.log(`Selected: ${entries.map((e) => e.name).join(', ')}`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `dirs=${dirs}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `packages=${names}\n`);
}
