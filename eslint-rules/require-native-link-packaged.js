import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MANIFEST = 'native-link.json';
const EXPO_RUNTIME = 'expo-modules-core';
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
];

function memberOf(objectNode, name) {
  if (!objectNode || objectNode.type !== 'Object') return undefined;
  return objectNode.members.find(member => member.name.value === name);
}

function stringElements(arrayMember) {
  if (!arrayMember || arrayMember.value.type !== 'Array') return [];
  return arrayMember.value.elements
    .filter(element => element.value.type === 'String')
    .map(element => element.value.value);
}

function dependencyNames(root) {
  const names = new Map();
  for (const section of DEPENDENCY_SECTIONS) {
    const member = memberOf(root, section);
    if (!member || member.value.type !== 'Object') continue;
    for (const dep of member.value.members) {
      if (!names.has(dep.name.value))
        names.set(dep.name.value, { section, node: dep });
    }
  }
  return names;
}

export default {
  meta: {
    type: 'problem',
    languages: ['json/json'],
    docs: {
      description:
        'keep an expo wrapper package linkable once installed from npm',
      recommended: true,
    },
    messages: {
      manifestNotPackaged:
        '"files" does not list "native-link.json", so npm strips it from the tarball — ' +
        'expo-modules-link scans installed packages for that file and silently skips any package ' +
        'without one, leaving the native module unregistered.',
      metaPackageDependency:
        'Depends on the "expo" meta-package ({{section}}). It pulls in a second Metro/Babel ' +
        'pipeline that fights this repo\'s own — depend on "expo-modules-core" directly.',
      missingRuntime:
        'Depends on "{{dependency}}" but not on "{{runtime}}", which owns requireNativeModule() ' +
        'and the permission types every wrapper resolves its native module through.',
    },
    schema: [],
  },
  create(context) {
    return {
      Document(node) {
        const root = node.body;
        if (root.type !== 'Object') return;
        const dir = dirname(context.filename);

        // Having the manifest in the repo proves nothing: `files` gates what npm packs, and five
        // published tarballs reached the registry without it, silently unregistered.
        const filesMember = memberOf(root, 'files');
        if (
          existsSync(join(dir, MANIFEST)) &&
          !stringElements(filesMember).includes(MANIFEST)
        ) {
          context.report({
            loc: (filesMember ?? root).loc,
            messageId: 'manifestNotPackaged',
          });
        }

        const dependencies = dependencyNames(root);

        const meta = dependencies.get('expo');
        if (meta) {
          context.report({
            loc: meta.node.loc,
            messageId: 'metaPackageDependency',
            data: { section: meta.section },
          });
        }

        if (dependencies.has(EXPO_RUNTIME)) return;
        for (const [name, { node: depNode }] of dependencies) {
          if (!name.startsWith('expo-')) continue;
          context.report({
            loc: depNode.loc,
            messageId: 'missingRuntime',
            data: { dependency: name, runtime: EXPO_RUNTIME },
          });
          return;
        }
      },
    };
  },
};
