import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// `src` cannot just be dropped from `files`: the Angular entry's `default` export condition
// resolves back into `./src/**/*.ts`. So the sources ship, and the tests beside them ride along —
// four of them were 24% of tracking-transparency's unpacked size.
//
// Suffixes follow the co-location convention in CLAUDE.md (`X/X.test.ts`, `X/X.detox.ts`), plus
// `.spec.` for the other common spelling.
const REQUIRED_EXCLUSIONS = ['!src/**/*.test.*', '!src/**/*.spec.*', '!src/**/*.detox.*'];
const TEST_FILE = /\.(test|spec|detox)\.[cm]?[jt]sx?$/;

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

function hasTestFile(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (hasTestFile(join(dir, entry.name))) return true;
    } else if (TEST_FILE.test(entry.name)) {
      return true;
    }
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    languages: ['json/json'],
    docs: {
      description: 'keep co-located tests out of a package that publishes its src/',
      recommended: true,
    },
    messages: {
      missingExclusion:
        '"files" ships "src" and this package has co-located tests, but does not exclude ' +
        '{{missing}}. Every test file under src/ would be published to npm.',
    },
    schema: [],
  },
  create(context) {
    return {
      Document(node) {
        const root = node.body;
        if (root.type !== 'Object') return;

        const filesMember = memberOf(root, 'files');
        const files = stringElements(filesMember);
        if (!files.includes('src')) return;

        const srcDir = join(dirname(context.filename), 'src');
        if (!existsSync(srcDir) || !hasTestFile(srcDir)) return;

        const missing = REQUIRED_EXCLUSIONS.filter(pattern => !files.includes(pattern));
        if (missing.length === 0) return;

        context.report({
          loc: filesMember.loc,
          messageId: 'missingExclusion',
          data: { missing: missing.map(pattern => `"${pattern}"`).join(', ') },
        });
      },
    };
  },
};
