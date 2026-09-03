import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// @eslint/json's own getKey() lives at a private subpath its package.json `exports` map
// doesn't expose — package.json is strict JSON (never JSON5), so every Member key is a
// String node and this one-liner covers the same case without reaching past encapsulation.
function getKey(member) {
  return member.name.value;
}

// A package's required field set is additive by TIER, and a tier is detected from the
// filesystem next to package.json — never from the JSON content itself, or the rule would
// just be checking its own declared shape instead of what the package actually is.
//
// baseline        — every package.json in core/adapters/packages.
// full-library    — has a src/ directory (i.e. isn't a bare native-proxy skeleton).
// codegen-view    — has codegen-specs/ or a *.podspec (a native Fabric view wrapper).
// native-proxy    — has NO src/ directory (the packages/android bare-skeleton shape).
//
// Verified against every package in the repo at authoring time (2026-07-29): the
// intersection of actual fields within each detected tier matches this list exactly.
const TIERS = [
  {
    reason: 'every package',
    fields: [
      'name',
      'version',
      'description',
      'license',
      'repository',
      'homepage',
      'bugs',
      'author',
      'publishConfig',
    ],
    applies: () => true,
  },
  {
    reason: 'packages with a src/ directory (full-library shape)',
    fields: ['type', 'main', 'module', 'types', 'exports', 'files', 'scripts'],
    applies: dir => existsSync(join(dir, 'src')),
  },
  {
    reason:
      'native-codegen-view packages (codegen-specs/ or *.podspec present)',
    fields: [
      'codegenConfig',
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'peerDependenciesMeta',
    ],
    applies: dir =>
      existsSync(join(dir, 'codegen-specs')) ||
      readdirSync(dir).some(f => f.endsWith('.podspec')),
  },
  {
    reason: 'native-proxy packages with no src/ directory',
    fields: ['files', 'react-native', 'peerDependencies'],
    applies: dir => !existsSync(join(dir, 'src')),
  },
];

function requiredFieldsFor(dir) {
  const reasonByField = new Map();
  for (const tier of TIERS) {
    if (!tier.applies(dir)) continue;
    for (const field of tier.fields) {
      if (!reasonByField.has(field)) reasonByField.set(field, tier.reason);
    }
  }
  return reasonByField;
}

export default {
  meta: {
    type: 'problem',
    languages: ['json/json'],
    docs: {
      description: "require the field set matching a package's detected tier",
      recommended: true,
    },
    messages: {
      missingField:
        'Missing required field "{{field}}" — required for {{reason}}.',
    },
    schema: [],
  },
  create(context) {
    return {
      Document(node) {
        if (node.body.type !== 'Object') return;
        const dir = dirname(context.filename);
        const present = new Set(
          node.body.members.map(member => getKey(member)),
        );
        for (const [field, reason] of requiredFieldsFor(dir)) {
          if (present.has(field)) continue;
          context.report({
            loc: node.body.loc,
            messageId: 'missingField',
            data: { field, reason },
          });
        }
      },
    };
  },
};
