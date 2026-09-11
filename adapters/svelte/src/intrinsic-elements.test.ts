// The guard on the tag alphabet svelte-check reads.
//
// It resolves the MERGED `svelteHTML.IntrinsicElements` — our augmentation compiled together with
// svelte2tsx's own shim — rather than reading our declaration alone, because presence is not the
// property that matters here. The first version of `intrinsic-elements.ts` declared all 21 tags,
// was loaded (svelte-check's file count moved 635 -> 636) and changed NOTHING: an own member of a
// merged interface beats an inherited one, so svelte2tsx's `view: HTMLProps<'view', SVGAttributes>`
// outranked our `extends Record<…>` base on exactly the four names that needed it. A test that
// only checked our own declaration would have certified that.
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const BARREL = join(__dirname, 'index.ts');
const DECLARATION = join(__dirname, 'intrinsic-elements.ts');
// The union is the single source of truth for the tag list — never a literal list here, which
// could not report a name missing from itself.
const INTRINSIC_UNION = join(
  __dirname,
  '..',
  '..',
  '..',
  'core',
  'components',
  'src',
  'component-names',
  'shared.ts',
);
// svelte2tsx's shim is what an app is really checked against; svelte-check runs it, we do not
// depend on it, so a resolution failure must be loud rather than a silently skipped arm.
const SVELTE_JSX = require.resolve('svelte2tsx/svelte-jsx-v4.d.ts');

// The tag names svelte2tsx declares ITSELF, and therefore the ones our `extends Record<…>` base is
// outranked on. Derived from where the property is DECLARED, never stated — the shim's element list
// is not ours to predict, and it was written out as four SVG names until `button` joined the
// alphabet and made the list wrong by one.
function shimOwnedTags(
  checker: ts.TypeChecker,
  elements: ts.Type,
  tags: readonly string[],
): string[] {
  return tags.filter(tag => {
    const property = checker.getPropertyOfType(elements, tag);
    return (property?.declarations ?? []).some(declaration =>
      declaration.getSourceFile().fileName.endsWith('svelte-jsx-v4.d.ts'),
    );
  });
}

function symbioteTags(checker: ts.TypeChecker, program: ts.Program): string[] {
  const source = program.getSourceFile(INTRINSIC_UNION);
  if (source === undefined)
    throw new Error(`could not load ${INTRINSIC_UNION}`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined)
    throw new Error(`${INTRINSIC_UNION} resolved to no module symbol`);
  const alias = checker
    .getExportsOfModule(moduleSymbol)
    .find(symbol => symbol.getName() === 'ISymbioteIntrinsic');
  if (alias === undefined)
    throw new Error('ISymbioteIntrinsic is no longer exported');
  const declared = checker.getDeclaredTypeOfSymbol(alias);
  const members = declared.isUnion() ? declared.types : [declared];
  return members
    .map(member =>
      member.isStringLiteral() ? member.value : String(member.flags),
    )
    .sort();
}

// The merged namespace symbol: found on the SHIM's declaration, so what comes back carries both
// its members and our `declare global` ones.
function intrinsicElements(
  checker: ts.TypeChecker,
  program: ts.Program,
): ts.Type {
  const shim = program.getSourceFile(SVELTE_JSX);
  if (shim === undefined) throw new Error(`could not load ${SVELTE_JSX}`);
  for (const statement of shim.statements) {
    if (!ts.isModuleDeclaration(statement)) continue;
    if (statement.name.text !== 'svelteHTML') continue;
    const namespaceSymbol = checker.getSymbolAtLocation(statement.name);
    const member = namespaceSymbol?.exports?.get(
      ts.escapeLeadingUnderscores('IntrinsicElements'),
    );
    if (member === undefined) continue;
    return checker.getDeclaredTypeOfSymbol(member);
  }
  throw new Error('svelteHTML.IntrinsicElements not found in the shim');
}

function attributesOf(
  checker: ts.TypeChecker,
  elements: ts.Type,
  tag: string,
): ts.Type {
  const property = checker.getPropertyOfType(elements, tag);
  if (property === undefined)
    throw new Error(`svelteHTML.IntrinsicElements has no "${tag}"`);
  // `getTypeOfSymbol`, not `…AtLocation`: the 17 tags svelte2tsx does not name come from our
  // `extends Record<ISymbioteIntrinsic, …>` base and are SYNTHESIZED, carrying no declaration.
  return checker.getTypeOfSymbol(property);
}

describe('the svelteHTML tag alphabet', () => {
  const program = ts.createProgram([BARREL, SVELTE_JSX, INTRINSIC_UNION], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const tags = symbioteTags(checker, program);
  const elements = intrinsicElements(checker, program);

  // The premise every row below rests on: a checker that resolved nothing would agree with an
  // empty list and every comparison would pass vacuously.
  it('resolves a real tag union', () => {
    expect(tags.length).toBeGreaterThan(15);
    expect(tags, 'a name only ISymbioteIntrinsic could supply').toContain(
      'sticky-header',
    );
  });

  // The reachability half. A declaration an app never loads applies inside this package only —
  // the failure React's `src/jsx.d.ts` shipped with for months. The program is rooted at the
  // BARREL, so the file appearing here is the barrel having pulled it in.
  it('is reachable from the public barrel', () => {
    const loaded = program.getSourceFiles().map(file => file.fileName);
    expect(loaded).toContain(DECLARATION.split('\\').join('/'));
  });

  it('declares every intrinsic', () => {
    const declared = checker
      .getPropertiesOfType(elements)
      .map(property => property.getName());
    expect(tags.filter(tag => !declared.includes(tag))).toEqual([]);
  });

  // The EFFECT half, and the one the first attempt failed. A tag whose name svelte2tsx also owns
  // must end up carrying OUR shape: `p` present, and a string index signature, which only appears
  // once the `Omit<…, keyof SVGAttributes>` — or `keyof HTMLAttributes` — in its entry has erased
  // the DOM surface.
  it.each(shimOwnedTags(checker, elements, tags))(
    "gives %s our attributes rather than the DOM's",
    tag => {
      const attributes = attributesOf(checker, elements, tag);
      const names = checker
        .getPropertiesOfType(attributes)
        .map(property => property.getName());
      expect(names, `${tag} must accept the prop bag`).toContain('p');
      expect(
        checker.getIndexInfoOfType(attributes, ts.IndexKind.String),
        `${tag} still carries the DOM's closed attribute set`,
      ).toBeDefined();
    },
  );

  // Without this the row above could pass on a shim that never declared those tags, which is the
  // world in which the two escape interfaces are dead code rather than the load-bearing seam. BOTH
  // halves are named: the four SVG-element names went through `SVGAttributes` from the start, and
  // `button` — the first tag here that is a real HTML element — needed `HTMLAttributes`, the second
  // empty interface the shim offers one line above it.
  it('is checked against a shim that really owns those tags, on both seams', () => {
    const shim = program.getSourceFile(SVELTE_JSX);
    expect(shim?.text).toContain("view: HTMLProps<'view', SVGAttributes>");
    expect(shim?.text).toContain("button: HTMLProps<'button', HTMLAttributes>");
    // A tag alphabet with nothing on one of the two seams leaves that half unproven, and a
    // reader would take the row above as covering it.
    expect(shimOwnedTags(checker, elements, tags)).toContain('button');
    expect(shimOwnedTags(checker, elements, tags)).toContain('view');
  });
});
