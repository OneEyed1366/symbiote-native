import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Every publishable package (core/*, adapters/*, packages/*) ships a README.md
// next to its package.json — existence only, content is not our business here.
export default {
  meta: {
    type: 'problem',
    languages: ['json/json'],
    docs: {
      description: 'require a README.md next to every package.json',
      recommended: true,
    },
    messages: {
      missingReadme: 'Missing README.md next to this package.json ({{dir}}).',
    },
    schema: [],
  },
  create(context) {
    return {
      Document(node) {
        const dir = dirname(context.filename);
        if (existsSync(join(dir, 'README.md'))) return;
        context.report({
          loc: node.loc,
          messageId: 'missingReadme',
          data: { dir },
        });
      },
    };
  },
};
