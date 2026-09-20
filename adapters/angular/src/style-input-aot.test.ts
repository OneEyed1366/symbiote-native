// Does a declared `style` @Input actually take the `[style]` binding away from Angular's styling
// engine — in a REAL build, not just in the JIT compiler vitest happens to run?
//
// `element-props.ts` refused to declare the input for four months on the grounds that this "is
// provable solely by executing a linked AOT artifact". Correct, and the reason is sharper than it
// sounds: the emitted TEXT says nothing here. `ɵɵstyleMap` is what the linker emits for EVERY
// `[style]`, claimed or not — measured, both arms below contain it — and the choice is made inside
// it at runtime, by `checkStylingMap` consulting `hasStylingInputShadow(tNode)` and redirecting to
// the directive's input before `toStylingKeyValueArray` is ever reached. Reading the instruction
// name is reading half the machine (`test-harness-false-greens.md` §21a).
//
// So this compiles through ngtsc partial mode + `@angular/compiler-cli/linker/babel`, writes the
// linked output as a plain `.mjs` — pure `ɵɵdefineComponent`, no decorators, the shape Metro hands
// Hermes — imports it, and MOUNTS it on the real engine.
//
// The unmatched arm is the positive control and it is what makes the matched one mean anything: the
// same binding with no directive in scope must reach the styling engine and DIE there, with
// Angular's own "Unsupported styling type: function". Without it, a clean matched arm is equally
// produced by a harness that compiled nothing.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { Type } from '@angular/core';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

import './register';
import { mount, unmount } from './render';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const ng: {
  performCompilation: (config: unknown) => { diagnostics: readonly unknown[] };
} = require_('@angular/compiler-cli');
const ts: {
  ScriptTarget: Record<string, number>;
  ModuleKind: Record<string, number>;
  ModuleResolutionKind: Record<string, number>;
} = require_('typescript');
const babel: {
  transformSync: (
    code: string,
    options: unknown,
  ) => { code?: string | null } | null;
} = require_('@babel/core');
const linker: unknown = require_('../babel-linker.cjs');

const ROOT_TAG = 9483;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// NOT under `build/`, though the `../src` specifier would resolve from there too:
// `tests/build-output-has-no-orphans.test.ts` audits that tree for a compiled module with no source
// twin, and these fixtures are exactly that shape. Both files run in one vitest process, so
// anything written there is an intermittent red in a suite that has nothing to do with this one.
// And NOT under `node_modules` either — vite-node externalises that tree, so the linked artifact
// would be resolved by plain Node ESM, which reads neither a directory nor a `.ts`.
//
// Gitignored to cover a crashed run, the same shape and for the same reason as `.svelte-dts/`; the
// happy path removes it in `afterAll`.
const FIXTURE_DIR = join(here, '../.aot-fixtures');
const OUT_DIR = join(FIXTURE_DIR, 'out');

const STYLE_EXPR = `({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.6 : 1 })`;

const SOURCES: Record<string, string> = {
  matched: `
import { Component } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '../src';
@Component({
  selector: 'style-matched',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: \`<pressable testID="probe" [style]="buttonStyle"></pressable>\`,
})
export class StyleMatched { buttonStyle = ${STYLE_EXPR}; }
`,
  unmatched: `
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
@Component({
  selector: 'style-unmatched',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: \`<pressable-x testID="probe" [style]="buttonStyle"></pressable-x>\`,
})
export class StyleUnmatched { buttonStyle = ${STYLE_EXPR}; }
`,
};

const diagnosticText: string[] = [];
const linkedModulePath = new Map<string, string>();

function messageTextOf(diagnostic: unknown): string {
  if (typeof diagnostic !== 'object' || diagnostic === null) {
    return String(diagnostic);
  }
  const message: unknown = Reflect.get(diagnostic, 'messageText');
  if (typeof message === 'string') return message;
  if (typeof message === 'object' && message !== null) {
    return String(Reflect.get(message, 'messageText'));
  }
  return '(no messageText)';
}

/** Finds `<name>.js` anywhere under OUT_DIR — ngtsc mirrors its own common source root into it. */
function emittedPathFor(name: string): string {
  const walk = (dir: string): string | undefined => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const hit = walk(full);
        if (hit !== undefined) return hit;
      } else if (entry.name === `${name}.js`) {
        return full;
      }
    }
    return undefined;
  };
  const found = existsSync(OUT_DIR) ? walk(OUT_DIR) : undefined;
  if (found === undefined) {
    throw new Error(
      `ngtsc emitted no ${name}.js. Diagnostics:\n${diagnosticText.join('\n')}`,
    );
  }
  return found;
}

function committed(testID: string): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined)
    throw new Error(`no committed node carrying testID="${testID}"`);
  return hit;
}

/** The linked module's single exported class — `mount` takes it as the root component. */
async function loadLinked(name: string): Promise<Type<unknown>> {
  const module: Record<string, unknown> = await import(
    /* @vite-ignore */ pathToFileURL(linkedModulePath.get(name) ?? '').href
  );
  for (const value of Object.values(module)) {
    if (isComponentClass(value)) return value;
  }
  throw new Error(`linked ${name} exports no component class`);
}

function isComponentClass(value: unknown): value is Type<unknown> {
  return typeof value === 'function' && 'ɵcmp' in value;
}

beforeAll(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const rootNames = Object.entries(SOURCES).map(([name, source]) => {
    const file = join(FIXTURE_DIR, `${name}.ts`);
    writeFileSync(file, source);
    return file;
  });

  const compiled = ng.performCompilation({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      compilationMode: 'partial',
      strictTemplates: true,
      // The adapter reads `process.env`, and `performCompilation` stops at the first unhappy STAGE:
      // one stray TS error means the template checker never runs and nothing is emitted, which
      // reads as "the compiler had nothing to say" (`test-harness-false-greens.md` §30). typeRoots
      // is explicit because the fixtures sit under `build/`, where the default upward walk finds
      // the package's own `node_modules/@types` only by luck of depth.
      types: ['node'],
      typeRoots: [join(here, '../node_modules/@types')],
      outDir: OUT_DIR,
      // No `rootDir`: the matched fixture imports the adapter's own source, so ngtsc's common
      // source root is the package and a narrower one makes it refuse to emit at all.
    },
  });
  for (const diagnostic of compiled.diagnostics) {
    diagnosticText.push(messageTextOf(diagnostic));
  }

  for (const name of Object.keys(SOURCES)) {
    const out = babel.transformSync(
      readFileSync(emittedPathFor(name), 'utf8'),
      {
        filename: join(OUT_DIR, `${name}.js`),
        babelrc: false,
        configFile: false,
        plugins: [linker],
      },
    );
    // Beside the fixture source rather than in OUT_DIR: ngtsc mirrors its own source root into
    // OUT_DIR, so the emitted path is a detail, and the linked artifact is what gets imported.
    const file = join(FIXTURE_DIR, `${name}.linked.mjs`);
    writeFileSync(file, out?.code ?? '');
    linkedModulePath.set(name, file);
  }
});

afterAll(() => {
  unmount(ROOT_TAG);
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

describe('a declared style input claims [style] in a linked AOT artifact', () => {
  it('control: with no directive in scope the styling engine rejects a functional style', async () => {
    const Unmatched = await loadLinked('unmatched');
    expect(() => mount(ROOT_TAG, Unmatched)).toThrow(
      /Unsupported styling type/,
    );
    unmount(ROOT_TAG);
  });

  it('resolves the press-state callback onto the committed node', async () => {
    fabric.reset();
    const Matched = await loadLinked('matched');
    mount(ROOT_TAG, Matched);
    await tick();

    expect(committed('probe').payload.opacity).toBe(1);
  });
});
