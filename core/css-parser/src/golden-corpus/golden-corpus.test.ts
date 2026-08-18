// Golden snapshot of the ENTIRE CSS build pipeline over the real repo corpus.
//
// WHY THIS EXISTS, and why the other css-parser tests do not replace it: every test beside this
// one asserts a hand-written expectation on a hand-written input, so it can only catch a bug
// somebody already thought of. Three real, silent, shipped bugs got through that net in one
// session. This file asserts nothing of its own — it compiles every CSS-bearing source the
// pipeline actually consumes and pins the emitted bytes. A refactor that swaps out the compiler
// underneath is safe exactly to the degree this snapshot is unchanged.
//
// The snapshot pins TODAY'S behaviour, bugs included (multi-value shorthand drops every value
// past the first; `.card.big` and `.btn-primary` collapse to colliding camelCase keys). A diff
// here is not automatically a regression — it is a CHANGE, and the reviewer decides. Do not
// "fix" a snapshot to make a build green; read what moved.
//
// Keys are NOT sorted before serializing, deliberately. Emission order is part of the byte
// stream the pipeline produces, and sorting would hide a reordering — which is precisely the
// kind of silent change a library swap causes. Determinism is instead PROVEN, by compiling the
// whole corpus twice and comparing (see the last describe), and the one genuine machine-
// dependent input — the file path a scope hash is derived from — is made repo-relative.
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { compileCssFile } from '../metro-css-module/index.ts';
// The transformers are driven through their own real entry points, reached by relative path
// because neither adapter is a dependency of this package (and must not become one — the
// dependency runs the other way).
import vueTransformer from '../../../../adapters/vue/metro-vue-transformer.cjs';
import { scopedStyles } from '../../../../adapters/svelte/src/preprocessor/scoped-styles.ts';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const FIXTURES_REL = 'core/css-parser/src/golden-corpus/fixtures';

const STYLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.stylus',
]);
const SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'Pods',
  '.git',
]);

interface IVueTransformer {
  compileSfc(src: string, filename: string): Promise<string>;
}

function isVueTransformer(value: unknown): value is IVueTransformer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'compileSfc') === 'function'
  );
}

if (!isVueTransformer(vueTransformer)) {
  throw new Error(
    'adapters/vue/metro-vue-transformer.cjs exposes no compileSfc',
  );
}
const { compileSfc } = vueTransformer;

// ---------------------------------------------------------------------------------------------
// Corpus discovery. Relative-to-repo-root paths throughout: hashFilePath() hashes the string it
// is handed, so an absolute path would move every scope id per checkout.

function walk(relativeDir: string): string[] {
  const found: string[] = [];
  let entries;
  try {
    entries = readdirSync(path.join(REPO_ROOT, relativeDir), {
      withFileTypes: true,
    });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const relative = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      found.push(...walk(relative));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}

const ALL_FILES = [...walk('examples'), ...walk(FIXTURES_REL)].sort();

const STANDALONE_STYLE_FILES = ALL_FILES.filter(file =>
  STYLE_EXTENSIONS.has(path.extname(file)),
);

function hasStyleBlock(relativePath: string): boolean {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8').includes(
    '<style',
  );
}

const VUE_STYLE_FILES = ALL_FILES.filter(
  file => file.endsWith('.vue') && hasStyleBlock(file),
);
const SVELTE_STYLE_FILES = ALL_FILES.filter(
  file => file.endsWith('.svelte') && hasStyleBlock(file),
);

// apps/** is discovered but NOT compiled. The only CSS there belongs to apps/docs-site, an Astro
// WEB site built by Vite — it never reaches Metro, so putting it in the golden snapshot would
// pin bytes for a pipeline that does not process it and would fail on PROPERTY_TABLE changes
// that can never affect it. Listed here so a future RN app landing under apps/ moves this
// snapshot and gets noticed instead of silently escaping the corpus.
const APPS_STYLE_FILES = walk('apps')
  .filter(file => STYLE_EXTENSIONS.has(path.extname(file)))
  .sort();

function read(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

// The compiler warns once per unsupported property per call. The corpus trips that by design (see
// values-and-units.css) and the warnings are not part of the emitted payload.
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
  warnSpy.mockRestore();
});

describe('corpus discovery', () => {
  it('finds the CSS-bearing sources the pipeline compiles', () => {
    expect({
      standaloneStyleFiles: STANDALONE_STYLE_FILES,
      vueFilesWithStyleBlocks: VUE_STYLE_FILES,
      svelteFilesWithStyleBlocks: SVELTE_STYLE_FILES,
      excludedWebOnlyAppStyleFiles: APPS_STYLE_FILES,
    }).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------------------------
// Standalone .css / .module.css / preprocessor files -> compileCssFile.
// The whole emitted module source is snapshotted: the registerRules([...]) payload AND, for a
// .module.* file, the `export default` name->scopedName map.

describe('standalone style files -> compileCssFile', () => {
  for (const file of STANDALONE_STYLE_FILES) {
    it(file, async () => {
      const { code } = await compileCssFile(read(file), file);
      expect(code).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Vue SFC <style> blocks -> metro-vue-transformer's compileSfc.
//
// compileSfc returns the WHOLE compiled component (script setup + inlined render fn), which is
// @vue/compiler-sfc's output, not this pipeline's — snapshotting it would churn on every Vue
// bump for reasons unrelated to CSS. So two CSS-owned slices are pinned instead: the preamble
// compileSfc prepends (engine import, registerRules payload, the scoped-name set, the scope id,
// each <style module> binding's class map), and every line of the compiled body that the class
// nodeTransform touched.

const PREAMBLE_LINE_SHAPES: readonly RegExp[] = [
  /^import \{.*\} from '@symbiote-native\/engine';$/,
  /^registerRules\(\[.*\]\);$/,
  // One object-const shape covers both preamble consts: the scoped rename map
  // (`__scopedClassNames`) and each `<style module>` binding's own class map.
  /^const [$A-Za-z_][\w$]* = \{.*\};$/,
];

function stylePreambleOf(compiled: string): string[] {
  const preamble: string[] = [];
  for (const line of compiled.split('\n')) {
    if (!PREAMBLE_LINE_SHAPES.some(shape => shape.test(line))) break;
    preamble.push(line);
  }
  return preamble;
}

// The scope rewrite is the other half of the emitted payload: a static class= is resolved to a
// suffixed literal at build time, a dynamic :class= is wrapped in a renameClassTokens call.
function scopeRewritesOf(compiled: string, preambleLength: number): string[] {
  return compiled
    .split('\n')
    .slice(preambleLength)
    .filter(
      line => line.includes('__scopeClass(') || line.includes('__data-v-'),
    )
    .map(line => line.trim());
}

describe('vue SFC <style> blocks -> compileSfc', () => {
  for (const file of VUE_STYLE_FILES) {
    it(file, async () => {
      const compiled = await compileSfc(read(file), file);
      const preamble = stylePreambleOf(compiled);
      expect({
        preamble,
        scopeRewrites: scopeRewritesOf(compiled, preamble.length),
      }).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Svelte <style> blocks -> the adapter's own markup preprocessor.
//
// Unlike Vue's, this one emits SOURCE (the component with its style block blanked out, class
// attributes rewritten, and a <script module> carrying registerRules appended) and never runs
// svelte's compiler, so the full output is this pipeline's own bytes and is snapshotted whole.

const svelteMarkup = scopedStyles().markup;

describe('svelte <style> blocks -> scopedStyles preprocessor', () => {
  for (const file of SVELTE_STYLE_FILES) {
    it(file, async () => {
      const { code } = await svelteMarkup({
        content: read(file),
        filename: file,
      });
      expect(code).toMatchSnapshot();
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Determinism, asserted rather than assumed. This is what replaces sorting keys before
// serializing: if any stage ever emits in a run-dependent order, this fails instead of the
// snapshot silently becoming a coin flip.

describe('determinism', () => {
  it('emits identical bytes on a second pass over the whole corpus', async () => {
    for (const file of STANDALONE_STYLE_FILES) {
      const source = read(file);
      const first = await compileCssFile(source, file);
      const second = await compileCssFile(source, file);
      expect(second.code, file).toBe(first.code);
    }
    for (const file of VUE_STYLE_FILES) {
      const source = read(file);
      expect(await compileSfc(source, file), file).toBe(
        await compileSfc(source, file),
      );
    }
    for (const file of SVELTE_STYLE_FILES) {
      const source = read(file);
      const first = await svelteMarkup({ content: source, filename: file });
      const second = await svelteMarkup({ content: source, filename: file });
      expect(second.code, file).toBe(first.code);
    }
  });
});
