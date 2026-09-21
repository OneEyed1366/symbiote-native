// Runs on the staged set at commit time (via husky pre-commit → lint-staged).
//
//   library .ts/.tsx  → eslint --fix, then prettier --write
//   other source/json → prettier --write
//   any .ts/.tsx       → tsc --build, scoped to the touched top-level packages (a
//                        project-references solution can't be type-checked file-by-file,
//                        so each touched package still gets its whole graph — but an
//                        UNTOUCHED package is never pulled in just because it also lives
//                        under the root tsconfig's references). This matters because a
//                        package can sit on disk mid-refactor and fail to compile without
//                        being staged at all (e.g. a WIP adapter nobody has committed yet)
//                        — building the whole root graph would block every unrelated commit.
//
// examples/* are linted+formatted by their own @react-native toolchain, so the eslint
// rule below scopes to the library packages only; prettier still tidies root configs.
//
// Touching any manifest or the catalog → syncpack guards that no literal version
// slipped past the pnpm catalog (it scans the whole workspace, so args are ignored).
import { relative } from 'node:path';

// Every top-level package with its own (composite) tsconfig.json, i.e. everything the
// root tsconfig.json references. Keep in sync with that references list.
const TS_PACKAGES = [
  'core/test-utils',
  'core/engine',
  'core/components',
  'core/css-parser',
  'adapters/react',
  'adapters/vue',
  'adapters/angular',
  'packages/slider',
  'packages/splash-screen',
  'packages/navigation',
];

function tscBuildForStaged(files) {
  const touched = new Set();
  for (const file of files) {
    const relPath = relative(process.cwd(), file);
    const pkg = TS_PACKAGES.find(
      p => relPath === p || relPath.startsWith(`${p}/`),
    );
    if (pkg !== undefined) touched.add(pkg);
  }
  return touched.size > 0 ? [`tsc --build ${[...touched].join(' ')}`] : [];
}

// packages/cli/templates/** is excluded from eslint.config.js's own `ignores`, but that ignore
// list never gets consulted here: those template files are copies of a *generated app's*
// config (CommonJS eslint.config.js/.prettierrc.js under a package.json that says "type":
// "module"), so the moment eslint/prettier are asked to touch one directly, ESLint's flat-config
// loader treats it as the nearest ancestor config for itself and tries to import it as ESM,
// crashing on its own `require()`. Filtering them out of the file list before the tools ever see
// them — same reasoning lint-staged already applies to examples/*, just needed explicitly here
// because packages/cli/templates lives inside a glob that otherwise matches it. The bare
// `*.{ts,js,json}` rule below is the one that actually needs this: lint-staged's matcher turns
// on `matchBase` for any pattern with no `/`, so `*.js` matches a `.prettierrc.js` at ANY depth,
// not just at the repo root.
function excludingCliTemplates(files) {
  return files.filter(
    file =>
      !relative(process.cwd(), file).startsWith('packages/cli/templates/'),
  );
}

function eslintAndPrettier(files) {
  const targets = excludingCliTemplates(files);
  return targets.length > 0
    ? [
        `eslint --fix ${targets.join(' ')}`,
        `prettier --write ${targets.join(' ')}`,
      ]
    : [];
}

function prettierOnly(files) {
  const targets = excludingCliTemplates(files);
  return targets.length > 0 ? [`prettier --write ${targets.join(' ')}`] : [];
}

export default {
  '{core,adapters,packages}/**/*.{ts,tsx}': eslintAndPrettier,
  '{core,adapters,packages}/**/*.{js,json}': prettierOnly,
  '*.{ts,js,json}': prettierOnly,
  '**/*.{ts,tsx}': tscBuildForStaged,
  '{**/package.json,pnpm-workspace.yaml}': () => 'syncpack lint',
};
