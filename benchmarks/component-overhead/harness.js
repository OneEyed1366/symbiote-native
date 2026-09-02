// Shared measurement harness for the component-overhead pages.
//
// THE QUESTION. Our device numbers say a framework component instance costs ~15 us (a thin
// View/Text wrapper, Vue on Hermes) and ~50 us (Pressable, Solid). Nothing tells us whether those
// are normal for the framework or inflated by our own wrapper bodies. A browser page can answer it,
// because a component boundary costs what it costs regardless of what the host is.
//
// WHY TWO ARMS IN ONE PAGE, rather than one page per framework. Comparing five separate
// implementations is what js-framework-benchmark does, and it is exactly the flaw we are trying to
// avoid: half the spread is authorship. Here both arms build the SAME DOM from the SAME data in the
// SAME page, and the only difference is whether each element is written directly or wrapped in a
// pass-through component. The reported number is the DELTA, and a delta is comparable across pages
// in a way a total never is.
//
// THE CONTROL, and it is not optional. Two arms that build different DOM are not an A/B. Every run
// counts the elements and text nodes both arms produced and REFUSES to report a per-instance figure
// unless they match — the browser twin of this project's rule that a Fabric-counter comparison is
// void unless createNode/appendChild/prop-keys are byte-identical. A green run with mismatched node
// counts would be measuring two different trees and reading the difference as component cost.
//
// THE WRAPPER IS DELIBERATELY EMPTY. It forwards props and returns the element, nothing else. So
// the number is the FLOOR — what a component boundary costs before any prop folding, state or
// memoisation. Our own wrappers did more, so the gap between this floor and our ~15 us is the part
// that belongs to us rather than to the framework.

export const ROWS = 1000;

// The row mirrors examples/*'s benchmark row exactly: 7 elements + 3 text nodes = 10 DOM nodes,
// the same 10 native views each adapter commits per row. Keeping the shape identical is what makes
// a us-per-instance figure from this page comparable to one taken on device.
export const ELEMENTS_PER_ROW = 7;

export function buildData(rows) {
  const data = new Array(rows);
  for (let i = 0; i < rows; i += 1)
    data[i] = { id: i + 1, label: `row ${i + 1}` };
  return data;
}

// Median, not mean: one GC pause in a run of ten would move a mean and cannot move a median.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

const spread = values => Math.max(...values) - Math.min(...values);

function countNodes(container) {
  let text = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() !== null) text += 1;
  return { elements: container.querySelectorAll('*').length, text };
}

function timeOnce(arm) {
  arm.clear();
  const started = performance.now();
  arm.mount();
  // The layout read is deliberate. Without it the framework's own work is timed while style and
  // layout for 10 000 nodes lands after the clock stops — which flatters whichever arm defers more.
  // eslint-disable-next-line no-unused-expressions
  arm.container.offsetHeight;
  return performance.now() - started;
}

/**
 * Run both arms ALTERNATELY, one sample each per round.
 *
 * Running all of A and then all of B lets anything that drifts during the page's life — JIT tiers
 * warming, heap growth, the machine's own thermal state — land entirely on the second arm and read
 * as its cost. Alternating charges both arms the same drift. Cheap, and it removes a whole class of
 * wrong answer that no amount of extra rounds would.
 */
export function measurePair({ raw, wrapped, rounds, warmups }) {
  const rawSamples = [];
  const wrappedSamples = [];
  for (let run = 0; run < warmups + rounds; run += 1) {
    const a = timeOnce(raw);
    const b = timeOnce(wrapped);
    if (run >= warmups) {
      rawSamples.push(a);
      wrappedSamples.push(b);
    }
  }
  raw.mount();
  const rawCensus = countNodes(raw.container);
  raw.clear();
  wrapped.mount();
  const wrappedCensus = countNodes(wrapped.container);
  wrapped.clear();
  return {
    raw: { median: median(rawSamples), samples: rawSamples, census: rawCensus },
    wrapped: {
      median: median(wrappedSamples),
      samples: wrappedSamples,
      census: wrappedCensus,
    },
  };
}

/**
 * Two controls, and the second is the one a node census cannot supply.
 *
 * 1. Both arms built the SAME DOM. Two arms over different trees are not an A/B.
 * 2. Arm B actually INSTANTIATED components. Measured 2026-09-01: React's delta came out at
 *    exactly 0.0 ms, which is equally what a bug that ran the raw builder in both arms would
 *    produce — with control 1 passing, because the DOM would be identical. The page therefore
 *    counts wrapper invocations and this refuses to report unless the count is what the row shape
 *    predicts.
 */
export function report({ raw, wrapped }, rows, wrapperCalls) {
  const expected = rows * ELEMENTS_PER_ROW;
  const sameDom =
    raw.census.elements === wrapped.census.elements &&
    raw.census.text === wrapped.census.text;
  const armsDiffer = wrapperCalls === expected;
  const deltaMs = wrapped.median - raw.median;
  // The floor is the worse of the two arms' own run-to-run spread. A delta smaller than that is not
  // a measurement, whatever its sign.
  const floorMs = Math.max(spread(raw.samples), spread(wrapped.samples));

  const lines = [
    `rows                 ${rows}`,
    `elements / row       ${ELEMENTS_PER_ROW}   (expected component instances: ${expected})`,
    '',
    `arm A  raw elements  ${raw.median.toFixed(1)} ms   spread ${spread(raw.samples).toFixed(1)}   nodes ${raw.census.elements} el + ${raw.census.text} text`,
    `arm B  one component ${wrapped.median.toFixed(1)} ms   spread ${spread(wrapped.samples).toFixed(1)}   nodes ${wrapped.census.elements} el + ${wrapped.census.text} text`,
    `       per element`,
    '',
  ];

  if (!sameDom) {
    lines.push(
      'CONTROL 1 FAILED — the arms built different DOM, so a delta would compare two trees.',
      `  elements  ${raw.census.elements} vs ${wrapped.census.elements}`,
      `  text      ${raw.census.text} vs ${wrapped.census.text}`,
    );
    return lines.join('\n');
  }
  if (!armsDiffer) {
    lines.push(
      'CONTROL 2 FAILED — arm B did not instantiate the expected number of components, so this',
      'run cannot tell a cheap boundary from an arm that never used one.',
      `  wrapper invocations ${wrapperCalls}, expected ${expected}`,
    );
    return lines.join('\n');
  }

  // SEPARATION, not spread, is the test — and the first version of this got it wrong.
  //
  // Comparing the delta against the worse arm's own spread rejected a Vue run whose sample RANGES
  // did not overlap at all (A 21.7-24.7, B 28.5-41.3): every B sample above every A sample, and the
  // rule called it noise because B's own spread was wide. A distribution that is wide but SHIFTED
  // is signal. So: separated ranges are a measurement whatever the spread; only OVERLAPPING ranges
  // fall back to an upper bound.
  const separated = Math.min(...wrapped.samples) > Math.max(...raw.samples);

  lines.push(
    'CONTROLS PASSED — identical DOM, and arm B really instantiated ' +
      expected +
      ' components.',
    '',
    `delta                ${deltaMs.toFixed(1)} ms`,
    `arm A range          ${Math.min(...raw.samples).toFixed(1)} .. ${Math.max(...raw.samples).toFixed(1)} ms`,
    `arm B range          ${Math.min(...wrapped.samples).toFixed(1)} .. ${Math.max(...wrapped.samples).toFixed(1)} ms`,
  );

  if (separated) {
    lines.push(
      '',
      `PER INSTANCE         ${((deltaMs * 1000) / expected).toFixed(2)} us`,
      'The ranges do not overlap, so the delta is a measurement rather than drift.',
    );
  } else {
    lines.push(
      '',
      `PER INSTANCE         NOT SEPARATED — under ${((floorMs * 1000) / expected).toFixed(2)} us`,
      'The arms overlap, so the boundary is too cheap for this many instances to surface it. That',
      'is a result, not a failed run: report it as an upper bound, never as zero.',
    );
  }

  lines.push(
    '',
    'Compare against the device figures this page exists to calibrate:',
    '  ~15 us   a thin View/Text wrapper, Vue on Hermes',
    '  ~50 us   Pressable, Solid on Hermes',
    'A floor far below 15 means our wrapper BODIES cost the difference, not the boundary itself.',
    '',
    `samples (ms)  A ${raw.samples.map(s => s.toFixed(1)).join(' ')}`,
    `              B ${wrapped.samples.map(s => s.toFixed(1)).join(' ')}`,
  );
  return lines.join('\n');
}
