// The guard on the tag alphabet svelte-check reads
// It resolves the merged `svelteHTML.IntrinsicElements`, our augmentation plus svelte2tsx typings
// In a merged interface an own member beats an inherited one, so our file alone proves nothing
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const BARREL = join(__dirname, 'index.ts');
const DECLARATION = join(__dirname, 'intrinsic-elements.ts');
// The union is the single source of the tag list, as a literal list could not report a missing name
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
// The svelte2tsx typings are what an app is checked against, so a resolution failure must be loud
const SVELTE_JSX = require.resolve('svelte2tsx/svelte-jsx-v4.d.ts');

// The tags svelte2tsx declares itself, which outrank our `extends Record<...>` base
// Derived from where the property is declared, as their element list is not ours to predict
function typingsOwnedTags(
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

// The merged namespace symbol, found on the typings declaration so it carries our members too
function intrinsicElements(
  checker: ts.TypeChecker,
  program: ts.Program,
): ts.Type {
  const typings = program.getSourceFile(SVELTE_JSX);
  if (typings === undefined) throw new Error(`could not load ${SVELTE_JSX}`);
  for (const statement of typings.statements) {
    if (!ts.isModuleDeclaration(statement)) continue;
    if (statement.name.text !== 'svelteHTML') continue;
    const namespaceSymbol = checker.getSymbolAtLocation(statement.name);
    const member = namespaceSymbol?.exports?.get(
      ts.escapeLeadingUnderscores('IntrinsicElements'),
    );
    if (member === undefined) continue;
    return checker.getDeclaredTypeOfSymbol(member);
  }
  throw new Error('svelteHTML.IntrinsicElements not found in the typings');
}

function attributesOf(
  checker: ts.TypeChecker,
  elements: ts.Type,
  tag: string,
): ts.Type {
  const property = checker.getPropertyOfType(elements, tag);
  if (property === undefined)
    throw new Error(`svelteHTML.IntrinsicElements has no "${tag}"`);
  // `getTypeOfSymbol`, not `...AtLocation`, as tags svelte2tsx does not name are synthesized
  // They come from our `extends Record<ISymbioteIntrinsic, ...>` base and carry no declaration
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

  // The premise of every row below, as a checker that resolved nothing passes them vacuously
  it('resolves a real tag union', () => {
    expect(tags.length).toBeGreaterThan(15);
    expect(tags, 'a name only ISymbioteIntrinsic could supply').toContain(
      'sticky-header',
    );
  });

  // A declaration an app never loads applies inside this package only
  // The program is rooted at the barrel, so the file appearing here means the barrel pulled it in
  it('is reachable from the public barrel', () => {
    const loaded = program.getSourceFiles().map(file => file.fileName);
    expect(loaded).toContain(DECLARATION.split('\\').join('/'));
  });

  const elements = intrinsicElements(checker, program);

  it('declares every intrinsic', () => {
    const declared = checker
      .getPropertiesOfType(elements)
      .map(property => property.getName());
    expect(tags.filter(tag => !declared.includes(tag))).toEqual([]);
  });

  // A tag svelte2tsx also owns must end up with our shape: `p` present and a string index signature
  // The index signature shows once the `Omit<...>` has erased the DOM surface
  it.each(typingsOwnedTags(checker, elements, tags))(
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

  // Without this the row above could pass on typings that never declared those tags
  // `view` goes through `SVGAttributes` and `button` through `HTMLAttributes`
  it('is checked against typings that really own those tags, on both seams', () => {
    const typings = program.getSourceFile(SVELTE_JSX);
    expect(typings?.text).toContain("view: HTMLProps<'view', SVGAttributes>");
    expect(typings?.text).toContain(
      "button: HTMLProps<'button', HTMLAttributes>",
    );
    const owned = typingsOwnedTags(checker, elements, tags);
    expect(owned).toContain('button');
    expect(owned).toContain('view');
  });
});
