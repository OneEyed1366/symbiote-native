// The guard on the tag alphabet vue-tsc and Volar read.
//
// It resolves the MERGED `GlobalComponents` — Vue's own declaration plus our augmentation —
// because that is what the template checker resolves. Checking our declaration in isolation would
// report health for an augmentation that landed in the wrong module and reached no template.
//
// There is no `examples/*` oracle behind this the way `examples/svelte` backs the Svelte twin: no
// Vue example writes a bare tag yet, so `vue-tsc` has nothing to go from red to green on. This
// test is the only thing holding the declaration.
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { join } from 'node:path';

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

// Reached through the `declare module 'vue'` in our own file: the symbol TypeScript hands back
// for a module AUGMENTATION is the merged module symbol, so `GlobalComponents` here carries Vue's
// members as well as ours.
function globalComponents(
  checker: ts.TypeChecker,
  program: ts.Program,
): ts.Type {
  const source = program.getSourceFile(DECLARATION);
  if (source === undefined)
    throw new Error(`${DECLARATION} was not pulled in by the barrel`);
  for (const statement of source.statements) {
    if (!ts.isModuleDeclaration(statement)) continue;
    const moduleSymbol = checker.getSymbolAtLocation(statement.name);
    const member = moduleSymbol?.exports?.get(
      ts.escapeLeadingUnderscores('GlobalComponents'),
    );
    if (member === undefined) continue;
    return checker.getDeclaredTypeOfSymbol(member);
  }
  throw new Error("no `declare module 'vue'` carrying GlobalComponents");
}

// Vue's template checker reads a component's props off the `$props` TYPE of a constructor, so a
// declaration that omits it type-checks here and does nothing in a template.
function templateProps(
  checker: ts.TypeChecker,
  components: ts.Type,
  tag: string,
): ts.Type {
  const property = checker.getPropertyOfType(components, tag);
  if (property === undefined)
    throw new Error(`GlobalComponents has no "${tag}"`);
  // `getTypeOfSymbol`, not `…AtLocation`: every tag but the handful Vue declares itself comes
  // from our `extends Record<ISymbioteIntrinsic, …>` base and is SYNTHESIZED, so it carries no
  // declaration to resolve against.
  const entry = checker.getTypeOfSymbol(property);
  const [construct] = entry.getConstructSignatures();
  if (construct === undefined)
    throw new Error(`"${tag}" is not the \`new () => …\` shape Vue reads`);
  const props = checker.getPropertyOfType(construct.getReturnType(), '$props');
  if (props === undefined) throw new Error(`"${tag}" exposes no $props`);
  return checker.getTypeOfSymbol(props);
}

describe('the Vue GlobalComponents tag alphabet', () => {
  const program = ts.createProgram([BARREL, INTRINSIC_UNION], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const tags = symbioteTags(checker, program);
  const components = globalComponents(checker, program);

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
      .getPropertiesOfType(components)
      .map(property => property.getName());
    expect(tags.filter(tag => !declared.includes(tag))).toEqual([]);
  });

  // Says the augmentation landed in the interface Vue itself declares rather than in a fresh
  // same-named one of our own, which would resolve here and reach no template.
  it('merged with Vue own GlobalComponents', () => {
    const declared = checker
      .getPropertiesOfType(components)
      .map(property => property.getName());
    expect(
      declared,
      "Vue's own members are absent — this is not Vue's interface",
    ).toContain('Teleport');
  });

  it.each(['view', 'text', 'scroll-view', 'text-input'])(
    'exposes %s props through $props',
    tag => {
      const props = templateProps(checker, components, tag);
      expect(
        checker.getIndexInfoOfType(props, ts.IndexKind.String),
        'the open attribute surface is missing',
      ).toBeDefined();
      const names = checker
        .getPropertiesOfType(props)
        .map(property => property.getName());
      expect(
        names,
        'PublicProps is not folded in, so `key`/`ref` would error',
      ).toContain('key');
    },
  );
});
