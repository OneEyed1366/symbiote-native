import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Svelte prepack emits its declarations without rewriting sibling packages', () => {
  // Keep the fixture beneath the workspace so real svelte2tsx dependencies resolve.
  const fixture = mkdtempSync(join(root, '.svelte-prepack-'));
  try {
    const write = (relative, content) => {
      const target = join(fixture, relative);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, content);
    };
    write('package.json', JSON.stringify({ type: 'module' }));
    for (const name of ['adapters/svelte', 'packages/sibling']) {
      write(
        `${name}/package.json`,
        JSON.stringify({ name: `@symbiote-native/${name.split('/')[1]}` }),
      );
      write(
        `${name}/tsconfig.json`,
        JSON.stringify({
          compilerOptions: {
            target: 'ESNext',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            skipLibCheck: true,
          },
          include: ['src'],
        }),
      );
      write(
        `${name}/src/Example.svelte`,
        '<script lang="ts">let { title }: { title: string } = $props();</script><div>{title}</div>',
      );
    }
    write(
      'packages/sibling/build/Example.svelte',
      'previously packed sibling source',
    );
    write(
      'packages/sibling/build/Example.svelte.d.ts',
      'previously packed sibling declaration',
    );
    for (const file of [
      'adapters/svelte/prepack.mjs',
      'scripts/copy-svelte-sources.mjs',
      'scripts/emit-svelte-declarations.mjs',
      'scripts/lib/publishable-packages.mjs',
    ]) {
      mkdirSync(join(fixture, file, '..'), { recursive: true });
      copyFileSync(join(root, file), join(fixture, file));
    }
    execFileSync(process.execPath, ['prepack.mjs'], {
      cwd: join(fixture, 'adapters/svelte'),
      timeout: 30000,
    });
    assert.match(
      readFileSync(
        join(fixture, 'adapters/svelte/build/Example.svelte.d.ts'),
        'utf8',
      ),
      /title: string/,
    );
    assert.equal(
      readFileSync(
        join(fixture, 'packages/sibling/build/Example.svelte'),
        'utf8',
      ),
      'previously packed sibling source',
    );
    assert.equal(
      readFileSync(
        join(fixture, 'packages/sibling/build/Example.svelte.d.ts'),
        'utf8',
      ),
      'previously packed sibling declaration',
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
