#!/usr/bin/env node
// Cross-platform replacement for the old per-app dev-with-watch.sh: Angular needs a pre-Metro
// AOT compile (ngc), kept in sync via `ngc --watch` while developing. Metro itself must stay
// the FOREGROUND process — it reads raw keypresses
// (r/j/d/...) straight off stdin, and any wrapper that pipes stdin through itself
// (concurrently, npm-run-all, ...) breaks that raw-mode read. So ngc runs as a plain background
// child process, never a stdin-owning process manager. `shell: true` resolves `ngc`/
// `react-native` off PATH exactly like the bash script did — npm/pnpm/yarn already prepend
// every `node_modules/.bin` up the tree to PATH for any script invocation, this one included.
const { spawn, spawnSync } = require('node:child_process');

const TSCONFIG = 'tsconfig.angular.json';
const metroArgs = process.argv.slice(2);

// Without watchman, Metro falls back to chokidar's native fs.watch, which opens one OS file
// handle per watched directory. This project's watchFolders spans the whole monorepo, so that
// reliably blows past macOS's per-process fd limit (EMFILE) — doubly likely here since ngc
// --watch adds a second watcher on top of Metro's own. Warn instead of letting everyone
// individually debug a native stack trace down to this one missing binary.
const watchmanCheck = spawnSync('watchman', ['--version'], { stdio: 'ignore', shell: true });
if (watchmanCheck.status !== 0) {
  console.warn(
    '[symbiote-angular-dev] watchman not found on PATH. Metro will fall back to watching files ' +
      'itself, which commonly crashes with "EMFILE: too many open files" on a repo this size. ' +
      'Install it: https://facebook.github.io/watchman/docs/install (macOS: brew install watchman).',
  );
}

const initialBuild = spawnSync('ngc', ['-p', TSCONFIG], { stdio: 'inherit', shell: true });
if (initialBuild.status !== 0) {
  process.exit(initialBuild.status ?? 1);
}

const ngcWatch = spawn('ngc', ['-p', TSCONFIG, '--watch'], { stdio: 'inherit', shell: true });
const metro = spawn('react-native', ['start', ...metroArgs], { stdio: 'inherit', shell: true });

function stopNgcWatch() {
  ngcWatch.kill();
}

metro.on('exit', (code) => {
  stopNgcWatch();
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopNgcWatch();
    metro.kill(signal);
  });
}
