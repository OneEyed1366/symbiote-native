// Self and inclusive time per function from a Hermes sampling trace (Chrome format), as written by
// `runBenchSuite` under `SYMBIOTE_PROFILE_DIR`.
//
// usage: node scripts/prof-top.mjs <trace.json> [topN=30] [filterRegex]
import { readFileSync } from 'node:fs';

const [, , file, topArg = '30', filter] = process.argv;
if (!file) {
  console.error(
    'usage: node scripts/prof-top.mjs <trace.json> [topN] [filterRegex]',
  );
  process.exit(1);
}
const trace = JSON.parse(readFileSync(file, 'utf8'));
const frames = trace.stackFrames ?? {};
const samples = trace.samples ?? [];

const nameOf = id => {
  const frame = frames[id];
  return frame === undefined
    ? '?'
    : `${frame.name.replace(/\(.*?\)/, '').trim()} [${frame.category ?? ''}]`;
};

const self = new Map();
const inclusive = new Map();
for (const sample of samples) {
  let id = sample.sf;
  if (id === undefined) continue;
  const top = nameOf(id);
  self.set(top, (self.get(top) ?? 0) + 1);
  // A recursive frame counts once per sample, or inclusive time exceeds 100%.
  const seen = new Set();
  while (id !== undefined && frames[id] !== undefined) {
    const name = nameOf(id);
    if (!seen.has(name)) {
      seen.add(name);
      inclusive.set(name, (inclusive.get(name) ?? 0) + 1);
    }
    id = frames[id].parent;
  }
}

const pattern = filter === undefined ? undefined : new RegExp(filter);
const show = (title, counts) => {
  console.log(`== ${title} (samples=${samples.length})`);
  [...counts.entries()]
    .filter(([name]) => pattern === undefined || pattern.test(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(topArg))
    .forEach(([name, count]) =>
      console.log(
        `${((100 * count) / samples.length).toFixed(1).padStart(5)}%  ${name}`,
      ),
    );
};
show('SELF', self);
show('INCLUSIVE', inclusive);
