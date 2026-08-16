// Exercises the plugin's actual host-override wiring against a fake tsserver host — real
// integration (does VS Code load it) can't be driven headlessly, but this proves getScriptSnapshot
// synthesizes the right literal-key .d.ts, the mtime-based cache invalidates on edit, and camelCasing
// matches the runtime key parseCSS/generate-dts.ts produce.
// The plugin itself is hand-written CommonJS at the package root (../typescript-plugin.cjs, not
// under src/ — matches each adapter's metro-css-parser.cjs shim convention), so it's required here
// rather than imported as a typed module.
//
// No Negative group: every host-override branch here degrades to delegating to the ORIGINAL host
// method rather than throwing (a missing file, a non-module import, a host with no
// resolveModuleNameLiterals support all fall through gracefully) — a language-service plugin that
// threw on an unexpected shape would take down the whole editor session, so "never throw, always
// have a fallback" is the actual contract. Every scenario below is Positive.
import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import initPlugin from '../typescript-plugin.cjs';

type IFakeSnapshot = {
  getText(start: number, end: number): string;
  getLength(): number;
};

type IResolvedLiteral = { resolvedModule?: { resolvedFileName: string; extension: string } };
type IResolveModuleNameLiterals = (
  literals: ReadonlyArray<{ text: string }>,
  containingFile: string,
) => IResolvedLiteral[];

function makeFakeTypescript() {
  return {
    ScriptKind: { TS: 3, Unknown: 0 },
    Extension: { Dts: '.d.ts' },
    ScriptSnapshot: {
      fromString: (text: string): IFakeSnapshot => ({
        getText: (start: number, end: number) => text.slice(start, end),
        getLength: () => text.length,
      }),
    },
  };
}

function makeFakeInfo() {
  return {
    languageServiceHost: {
      readFile: (fileName: string) =>
        fs.existsSync(fileName) ? fs.readFileSync(fileName, 'utf8') : undefined,
      fileExists: (fileName: string) => fs.existsSync(fileName),
      getScriptSnapshot: (_fileName: string): IFakeSnapshot | undefined => undefined,
      getScriptKind: (_fileName: string) => 0,
      resolveModuleNameLiterals: undefined as IResolveModuleNameLiterals | undefined,
    },
    languageService: {},
  };
}

describe('typescript-plugin — script kind / snapshot passthrough (Positive)', () => {
  // why: tsserver must treat a .module.css path as TypeScript so the synthesized .d.ts actually
  // gets language-service diagnostics/completion — the wrong ScriptKind silently disables both.
  it('reports ScriptKind.TS for a .module.css file', () => {
    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    expect(info.languageServiceHost.getScriptKind('Card.module.css')).toBe(3);
  });

  // why: a non-module file must reach the ORIGINAL host's getScriptSnapshot unmodified — proving
  // the plugin only intercepts what it owns, not every file tsserver ever opens.
  it('delegates getScriptSnapshot to the original host for a non-.module.css file', () => {
    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    expect(info.languageServiceHost.getScriptSnapshot('App.tsx')).toBeUndefined();
  });
});

describe('typescript-plugin', () => {
  it('synthesizes a literal-key .d.ts (no index signature) for a .module.css file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }\n.section-tight { margin: 0; }');

    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const snapshot = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!snapshot) throw new Error('expected a snapshot for a .module.css file');
    const dts = snapshot.getText(0, snapshot.getLength());

    expect(dts).toContain('readonly card: string;');
    expect(dts).toContain('readonly sectionTight: string;');
    expect(dts).not.toContain('[key: string]');
  });

  it('invalidates its cache when the file changes on disk (mtime-keyed)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }');

    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const first = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!first) throw new Error('expected a snapshot for a .module.css file');
    expect(first.getText(0, first.getLength())).toContain('readonly card: string;');

    await new Promise(resolve => setTimeout(resolve, 10));
    fs.writeFileSync(cssPath, '.card { padding: 10px; }\n.title { color: red; }');

    const second = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!second) throw new Error('expected a snapshot for a .module.css file');
    expect(second.getText(0, second.getLength())).toContain('readonly title: string;');
  });

  // why: a class selector referenced only inside a CSS comment must not leak into the suggested
  // keys — an author commenting out a rule shouldn't get autocomplete for a class that no longer
  // exists at runtime.
  it('ignores a class selector that only appears inside a comment', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '/* .disabled { display: none; } */\n.card { padding: 10px; }');

    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const snapshot = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!snapshot) throw new Error('expected a snapshot for a .module.css file');
    const dts = snapshot.getText(0, snapshot.getLength());

    expect(dts).toContain('readonly card: string;');
    expect(dts).not.toContain('disabled');
  });

  // why: an EMPTY class list is a deliberate, DIFFERENT fallback shape from the general case —
  // generateDts falls back to `Record<string, string>` (an index signature) rather than an empty
  // literal type, since "found nothing" should read as "unknown shape", not "definitely no
  // classes exist". This is a documented divergence from src/generate-dts.ts's
  // classNamesToDtsSource, which emits a literal empty `{}` with no index signature even for zero
  // classes — the plugin's regex-based extractor can't distinguish "genuinely empty file" from
  // "failed to recognize anything", so it deliberately stays permissive here.
  it('falls back to a loose Record type (with an index signature) when no class is found', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Empty.module.css');
    fs.writeFileSync(cssPath, '/* nothing here */\n');

    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const snapshot = info.languageServiceHost.getScriptSnapshot(cssPath);
    if (!snapshot) throw new Error('expected a snapshot for a .module.css file');
    const dts = snapshot.getText(0, snapshot.getLength());

    expect(dts).toContain('Record<string, string>');
  });

  it('resolves a relative .module.css import to itself as a .d.ts-kind module', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const cssPath = path.join(dir, 'Card.module.css');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }');
    const containingFile = path.join(dir, 'index.ts').replace(/\\/g, '/');
    const cssPathPosix = cssPath.replace(/\\/g, '/');

    const info = makeFakeInfo();
    info.languageServiceHost.resolveModuleNameLiterals = vi.fn(() => [
      { resolvedModule: undefined },
    ]);

    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const literals = [{ text: './Card.module.css' }];
    const { resolveModuleNameLiterals } = info.languageServiceHost;
    if (!resolveModuleNameLiterals) throw new Error('expected the plugin to install a resolver');
    const result = resolveModuleNameLiterals(literals, containingFile);

    expect(result[0]?.resolvedModule?.resolvedFileName).toBe(cssPathPosix);
    expect(result[0]?.resolvedModule?.extension).toBe('.d.ts');
  });

  // why: `../` must actually walk UP a directory level when resolving a relative import, not just
  // strip the leading `../` characters — a sibling-directory `.module.css` import is a normal
  // project layout, not an edge case.
  it('resolves a parent-directory-relative .module.css import', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const stylesDir = path.join(root, 'styles');
    const srcDir = path.join(root, 'src');
    fs.mkdirSync(stylesDir);
    fs.mkdirSync(srcDir);
    const cssPath = path.join(stylesDir, 'Card.module.css').replace(/\\/g, '/');
    fs.writeFileSync(cssPath, '.card { padding: 10px; }');
    const containingFile = path.join(srcDir, 'index.ts').replace(/\\/g, '/');

    const info = makeFakeInfo();
    info.languageServiceHost.resolveModuleNameLiterals = vi.fn(() => [
      { resolvedModule: undefined },
    ]);

    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const literals = [{ text: '../styles/Card.module.css' }];
    const { resolveModuleNameLiterals } = info.languageServiceHost;
    if (!resolveModuleNameLiterals) throw new Error('expected the plugin to install a resolver');
    const result = resolveModuleNameLiterals(literals, containingFile);

    expect(result[0]?.resolvedModule?.resolvedFileName).toBe(cssPath);
  });

  // why: a `.module.css` specifier pointing at a file that genuinely doesn't exist on disk must
  // fall back to TypeScript's OWN resolution result, not synthesize a fake resolvedFileName for a
  // path nothing backs — that would produce a phantom "resolved" import with no real file to read.
  it('falls back to the original resolution when the referenced .module.css file does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const containingFile = path.join(dir, 'index.ts').replace(/\\/g, '/');
    const originalResult = [{ resolvedModule: undefined }];

    const info = makeFakeInfo();
    info.languageServiceHost.resolveModuleNameLiterals = vi.fn(() => originalResult);

    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const literals = [{ text: './Missing.module.css' }];
    const { resolveModuleNameLiterals } = info.languageServiceHost;
    if (!resolveModuleNameLiterals) throw new Error('expected the plugin to install a resolver');
    const result = resolveModuleNameLiterals(literals, containingFile);

    expect(result[0]).toBe(originalResult[0]);
  });

  // why: an ordinary (non-CSS-Modules) import — most literals a project resolves — must reach the
  // original resolver completely untouched, proving the plugin's override is scoped to exactly
  // the `.module.css` case, not every import in the file.
  it('leaves a non-.module.css import literal to the original resolver', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'symbiote-ts-plugin-'));
    const containingFile = path.join(dir, 'index.ts').replace(/\\/g, '/');
    const originalResult = [{ resolvedModule: { resolvedFileName: '/x/Helper.ts', extension: '.ts' } }];

    const info = makeFakeInfo();
    info.languageServiceHost.resolveModuleNameLiterals = vi.fn(() => originalResult);

    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    const literals = [{ text: './Helper' }];
    const { resolveModuleNameLiterals } = info.languageServiceHost;
    if (!resolveModuleNameLiterals) throw new Error('expected the plugin to install a resolver');
    const result = resolveModuleNameLiterals(literals, containingFile);

    expect(result[0]).toBe(originalResult[0]);
  });

  it('does not touch a non-.module.css file', () => {
    const info = makeFakeInfo();
    const plugin = initPlugin({ typescript: makeFakeTypescript() });
    plugin.create(info);

    expect(info.languageServiceHost.getScriptKind('theme.css')).toBe(0);
  });
});
