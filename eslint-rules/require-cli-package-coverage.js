import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// packages/cli scaffolds every sibling @symbiote-native/* package as either an addable layer
// (templates/layers/<name>) or a hand-named layer referenced from src/ (e.g. expo-modules-link,
// whose template dir is named "expo-modules"). The CLI has no npm dependency on its siblings, so
// nothing else catches a package added to packages/ that the CLI was never taught to scaffold —
// it silently can't reach `new` or `add` for it.
const EXCLUDED = new Set([
  'cli', // the CLI package itself
  'android', // native host-shim, always bundled, never an addable layer
]);

function isCoveredByCli(cliDir, name) {
  if (existsSync(join(cliDir, 'templates/layers', name))) return true;
  const srcDir = join(cliDir, 'src');
  return readdirSync(srcDir, { recursive: true })
    .filter(file => file.endsWith('.ts') && !file.includes('.test.'))
    .some(file =>
      readFileSync(join(srcDir, file), 'utf8').includes(
        `@symbiote-native/${name}`,
      ),
    );
}

export default {
  meta: {
    type: 'problem',
    languages: ['json/json'],
    docs: {
      description:
        'every packages/* package must be scaffoldable by @symbiote-native/cli',
      recommended: true,
    },
    messages: {
      uncoveredPackage:
        '"{{name}}" has no CLI layer (templates/layers/{{name}}) and is never referenced as ' +
        '"@symbiote-native/{{name}}" in cli/src — the CLI can neither scaffold it into a new ' +
        'app nor "add" it to an existing one.',
    },
    schema: [],
  },
  create(context) {
    return {
      Document(node) {
        if (node.body.type !== 'Object') return;
        const cliDir = dirname(context.filename);
        // The rule is registered on the shared package.json hygiene block (every
        // {core,adapters,packages}/*/package.json), so it must no-op everywhere but cli's own.
        if (basename(cliDir) !== 'cli') return;
        const packagesDir = dirname(cliDir);

        for (const entry of readdirSync(packagesDir, {
          withFileTypes: true,
        })) {
          if (!entry.isDirectory() || EXCLUDED.has(entry.name)) continue;
          const dir = join(packagesDir, entry.name);
          if (!existsSync(join(dir, 'package.json'))) continue;
          if (isCoveredByCli(cliDir, entry.name)) continue;
          context.report({
            loc: node.body.loc,
            messageId: 'uncoveredPackage',
            data: { name: entry.name },
          });
        }
      },
    };
  },
};
