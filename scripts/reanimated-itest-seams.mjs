// What a bundle needs to run Reanimated's JS inside the tester: the worklets mock in place of the
// worklets runtime, and a bridge for the layout animation configs that lands them in the real proxy
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const WORKLETS = /^react-native-worklets$/;
const LAYOUT_CONFIGS = /^react-native-reanimated\/src\/UpdateLayoutAnimations$/;
const RN_BARREL = /^react-native$/;
const REACT = /^react$/;
const EXAMPLE_IMPORTER = /[/\\]examples[/\\]/;
const PACKAGE_REACT = /^@symbiote-native\/reanimated\/react$/;
const REANIMATED_IMPORTER = /[/\\](react-native-reanimated|packages[/\\]reanimated)[/\\]/;
const RN_STUB = 'packages/reanimated/test-support/react-native.ts';
const BRIDGE ='core/engine/cpp/tests/js/reanimated-layout-config-bridge.ts';

function adapterReact(root) {
  const manifest = path.join(root, 'adapters/react/package.json');
  try {
    return { path: createRequire(manifest).resolve('react') };
  } catch {
    return undefined;
  }
}

function workletsMock(packageRoot) {
  const manifest = path.join(packageRoot, 'package.json');
  if (!existsSync(manifest)) return undefined;
  try {
    const found = createRequire(manifest).resolve(
      'react-native-worklets/package.json',
    );
    const mock = path.join(path.dirname(found), 'src', 'mock.ts');
    return existsSync(mock) ? { path: mock } : undefined;
  } catch {
    return undefined;
  }
}

export function reanimatedItestSeams(root) {
  return {
    name: 'reanimated-itest-seams',
    setup(build) {
      build.onResolve({ filter: WORKLETS }, () =>
        workletsMock(path.join(root, 'packages/reanimated')),
      );
      // The `react-native` barrel pulls every native module, so Reanimated reads the stub it has
      // under vitest, while deep `react-native/...` imports stay the real ones
      build.onResolve({ filter: RN_BARREL }, ({ importer }) =>
        REANIMATED_IMPORTER.test(importer)
          ? { path: path.join(root, RN_STUB) }
          : undefined,
      );
      // An example app has an install of React of its own, and a second copy splits the hooks
      build.onResolve({ filter: REACT }, ({ importer }) =>
        EXAMPLE_IMPORTER.test(importer) ? adapterReact(root) : undefined,
      );
      build.onResolve({ filter: PACKAGE_REACT }, () => ({
        path: path.join(root, 'packages/reanimated/src/react/index.ts'),
      }));
      build.onResolve({ filter: LAYOUT_CONFIGS }, () => {
        const bridge = path.join(root, BRIDGE);
        return existsSync(bridge) ? { path: bridge } : undefined;
      });
    },
  };
}

// The install of the package, which holds the upstream sources the bundle imports by name
export function reanimatedNodePaths(root) {
  const modules = path.join(root, 'packages/reanimated/node_modules');
  return existsSync(modules) ? [modules] : [];
}
