import { isJsonObject, type IJsonObject } from './json.js';

// Ported from create-vue's utils/sortDependencies.ts.
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

export function sortDependencies(packageJson: IJsonObject): IJsonObject {
  const sorted: IJsonObject = {};

  for (const field of DEPENDENCY_FIELDS) {
    const deps = packageJson[field];
    if (!isJsonObject(deps)) continue;

    const sortedDeps: IJsonObject = {};
    for (const name of Object.keys(deps).sort()) {
      sortedDeps[name] = deps[name];
    }
    sorted[field] = sortedDeps;
  }

  return { ...packageJson, ...sorted };
}
