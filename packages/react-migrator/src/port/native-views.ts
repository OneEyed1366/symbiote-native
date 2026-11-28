// Follows an import to the `codegenNativeComponent('Name')` behind it: the tag a port renders
import type { Expression, ImportDeclaration, Node, Statement } from '@babel/types';
import { DEFAULT_EXPORT, babelTypes as t, importedNameOf, resolveModule } from '../source-graph.ts';
import type { IReadFile } from '../source-graph.ts';
import { unwrapCasts } from './react-shapes.ts';

const CODEGEN_CALL = 'codegenNativeComponent';
const MAX_HOPS = 4;

function codegenViewName(node: Node): string | null {
  const call = unwrapCasts(node);
  if (!t.isCallExpression(call) || !t.isIdentifier(call.callee, { name: CODEGEN_CALL })) return null;
  const [name] = call.arguments;
  return t.isStringLiteral(name) ? name.value : null;
}

function importOf(body: Statement[], local: string): ImportDeclaration | undefined {
  return body.find(
    (statement): statement is ImportDeclaration =>
      t.isImportDeclaration(statement) &&
      statement.specifiers.some((specifier) => specifier.local.name === local),
  );
}

type IExportTarget = { local: string } | { expression: Expression } | null;

function exportTarget(body: Statement[], name: string): IExportTarget {
  for (const statement of body) {
    if (name === DEFAULT_EXPORT && t.isExportDefaultDeclaration(statement)) {
      const { declaration } = statement;
      if (t.isIdentifier(declaration)) return { local: declaration.name };
      return t.isExpression(declaration) ? { expression: declaration } : null;
    }
    if (!t.isExportNamedDeclaration(statement) || statement.source) continue;
    const specifier = statement.specifiers.find(
      (each) => t.isExportSpecifier(each) && t.isIdentifier(each.exported, { name }),
    );
    if (t.isExportSpecifier(specifier)) return { local: specifier.local.name };
  }
  return null;
}

// `import X from './spec'` or `import { X } from './reexport'`: the view name, or null
export function nativeViewOf(
  file: string,
  local: string,
  readFile: IReadFile,
  hops = 0,
): string | null {
  if (hops > MAX_HOPS) return null;
  const body = readFile(file).program.body;
  const declaration = importOf(body, local);
  const target = declaration ? resolveModule(file, declaration.source.value) : null;
  if (!declaration || !target) return null;
  const name = importedNameOf(declaration.specifiers.find((each) => each.local.name === local));
  const exported = exportTarget(readFile(target).program.body, name);
  if (exported === null) return null;
  if ('expression' in exported) return codegenViewName(exported.expression);
  return nativeViewOf(target, exported.local, readFile, hops + 1);
}
