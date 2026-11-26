// Tallies a Hermes/Chrome `.heapsnapshot` or `.heaptimeline` by constructor: live objects and bytes
// Both formats share one node/edge/strings table, so an allocation-timeline recording works too

// "Is adapter X leaking" recurs, and the DevTools summary cannot be diffed or pasted into a review
//   node scripts/analyze-heap-snapshot.mjs ~/Desktop/Heap-*.heaptimeline Symbiote Animated

// Trailing arguments are substring filters, shown above the global top-25
// That is where adapter-specific classes such as `SymbioteNode` show up

// A second file makes it a diff, which answers "is it leaking" where one snapshot cannot
//   node scripts/analyze-heap-snapshot.mjs early.heapsnapshot later.heapsnapshot Symbiote

// Take both on the same screen with GC forced (the DevTools trash icon), minutes apart
// A constructor whose count climbs is the leak, one that sits at a big number is the working set

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const files = args.filter(arg => /\.heap(snapshot|timeline)$/.test(arg));
const filters = args.filter(arg => !files.includes(arg));

if (files.length === 0) {
  console.error(
    'usage: node scripts/analyze-heap-snapshot.mjs <early.heapsnapshot> [later.heapsnapshot] [nameFilter...]',
  );
  process.exit(1);
}

const BYTES_PER_MB = 1_048_576;
const megabytes = bytes => (bytes / BYTES_PER_MB).toFixed(2);

function tallyOf(file) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`cannot read ${file} as a heap snapshot: ${error.message}`);
    process.exit(1);
  }
  const meta = raw.snapshot.meta;
  const nodeFields = meta.node_fields;
  const stride = nodeFields.length;
  const typeIdx = nodeFields.indexOf('type');
  const nameIdx = nodeFields.indexOf('name');
  const sizeIdx = nodeFields.indexOf('self_size');
  const nodeTypes = meta.node_types[typeIdx];
  const { nodes, strings } = raw;

  const tally = new Map();
  let totalSize = 0;

  for (let i = 0; i < nodes.length; i += stride) {
    const kind = nodeTypes[nodes[i + typeIdx]] ?? '?';
    const name = strings[nodes[i + nameIdx]] ?? '';
    const size = nodes[i + sizeIdx];
    totalSize += size;
    const key = `${kind} ${name}`;
    const entry = tally.get(key);
    if (entry === undefined) tally.set(key, { kind, name, count: 1, size });
    else {
      entry.count += 1;
      entry.size += size;
    }
  }

  console.log(`file        ${file}`);
  console.log(`node_count  ${raw.snapshot.node_count}`);
  console.log(`total       ${megabytes(totalSize)} MB of self_size\n`);
  return tally;
}

function show(title, list, render) {
  if (list.length === 0) {
    console.log(`--- ${title}: nothing matched\n`);
    return;
  }
  console.log(`--- ${title}`);
  for (const row of list) console.log(render(row));
  console.log();
}

const oneLine = row =>
  `${String(row.count).padStart(12)} ${megabytes(row.size).padStart(8)} MB  ${row.kind.padEnd(13)} ${row.name}`;
const bySize = (a, b) => b.size - a.size;
const matchesFilter = row => filters.some(f => row.name.includes(f));

const first = tallyOf(files[0]);

if (files.length === 1) {
  const rows = [...first.values()];
  show('top 25 by bytes held', [...rows].sort(bySize).slice(0, 25), oneLine);
  show(
    'top 15 by object count',
    [...rows].sort((a, b) => b.count - a.count).slice(0, 15),
    oneLine,
  );
  if (filters.length > 0) {
    show(`matching ${filters.join(' / ')}`, rows.filter(matchesFilter).sort(bySize), oneLine);
  }
} else {
  const second = tallyOf(files[1]);
  const deltas = [];
  for (const [key, later] of second) {
    const earlier = first.get(key);
    deltas.push({
      kind: later.kind,
      name: later.name,
      before: earlier?.count ?? 0,
      after: later.count,
      growth: later.count - (earlier?.count ?? 0),
      size: later.size - (earlier?.size ?? 0),
    });
  }

  const growthLine = row =>
    `${String(row.before).padStart(10)} → ${String(row.after).padEnd(10)} ${(row.growth > 0 ? '+' : '') + String(row.growth)}`.padEnd(
      38,
    ) + `${megabytes(row.size).padStart(8)} MB  ${row.kind.padEnd(13)} ${row.name}`;

  console.log('            before → after      growth       bytes  kind          name');
  show(
    'top 25 GROWING between the two snapshots — the leak candidates',
    deltas.filter(row => row.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 25),
    growthLine,
  );
  if (filters.length > 0) {
    show(
      `matching ${filters.join(' / ')}`,
      deltas.filter(matchesFilter).sort((a, b) => b.growth - a.growth),
      growthLine,
    );
  }
}
