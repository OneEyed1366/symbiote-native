import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

// Serves every docs page a second time as its own source, at `<path>.md`.
//
// Raw MDX on purpose. 46 of our 76 pages are framework-tabbed, and a cleaner that
// treats `<TabItem label="Vue">` as layout chrome deletes the one fact a reader's
// agent needs. An agent parses MDX fine; five unlabelled snippets in a row it cannot.
//
// Anchoring the import pattern to a line start is what keeps it off an
// `import { X } from 'y'` written inside a code span.
const STARLIGHT_COMPONENT_IMPORT =
  /^import\s+\{[^}]*\}\s+from\s+'@astrojs\/starlight\/components';[^\S\r\n]*\r?\n/gm;

export const getStaticPaths = (async () => {
  const docs = await getCollection('docs');
  return docs.map(entry => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const { data, body } = props.entry;
  const source = (body ?? '').replace(STARLIGHT_COMPONENT_IMPORT, '').trim();
  const heading = data.description
    ? `# ${data.title}\n\n> ${data.description}`
    : `# ${data.title}`;

  return new Response(`${heading}\n\n${source}\n`, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
