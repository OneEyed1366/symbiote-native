// Upstream `src` is TypeScript source for a consumer, checked under their options, so the emitted
// declarations point at the `lib/typescript` ones instead
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_SPECIFIER = /(['"])react-native-reanimated\/src\//g;

export function rewriteUpstreamSpecifiers(code) {
  let rewritten = 0;
  const next = code.replace(SOURCE_SPECIFIER, (_match, quote) => {
    rewritten += 1;
    return `${quote}react-native-reanimated/lib/typescript/`;
  });
  return { code: next, rewritten };
}

function listDeclarations(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listDeclarations(full));
    else if (entry.name.endsWith('.d.ts')) found.push(full);
  }
  return found;
}

// Returns how many specifiers it pointed at the declarations
export function rewriteDeclarations(dir) {
  let total = 0;
  for (const file of listDeclarations(dir)) {
    const { code, rewritten } = rewriteUpstreamSpecifiers(
      fs.readFileSync(file, 'utf8'),
    );
    if (rewritten > 0) fs.writeFileSync(file, code);
    total += rewritten;
  }
  return total;
}

if (process.argv[1] === import.meta.filename) {
  const dir = path.resolve(process.argv[2] ?? 'build');
  const total = rewriteDeclarations(dir);
  console.log(`rewrite-upstream-declarations: ${total} specifiers in ${dir}`);
}
