// What an INSERT costs as the sibling list grows, and whether that is where Append went.
//
// WHY THIS EXISTS. `examples/svelte` regressed against its 2026-09-01 baseline by Create +40 ms,
// Append +147 and Replace +54, with `WRITES` and the tree byte-identical — so the same work is
// being priced higher. Append's share is the readable one: baseline Append was Create + 18 ms and
// it is now Create + 125, and the only thing that distinguishes the two rows is that Append inserts
// into a list ALREADY holding a thousand children. That is the signature of a per-insert cost
// proportional to the number of siblings standing.
//
// There is exactly one such scan on the path, `SymbioteTree.cpp`'s
//
//   auto position = std::find(siblings.begin(), siblings.end(), before);
//
// and Svelte reaches it on every single row: `{#each}` appends with `anchor.before(node)`, which the
// shim spells as `insertBefore(node, anchor)`, and the anchor sits AFTER the items — so the find
// walks the whole list, every time, by construction rather than by bad luck.
//
// SO WHY MEASURE SOMETHING THAT OBVIOUS. Because the arithmetic says it should not matter: a
// thousand inserts against an average of 1 500 siblings is ~1.5M pointer comparisons over a 24 KB
// vector that sits in L2, which ought to cost single-digit milliseconds and not 107. Either the
// arithmetic is wrong or the mechanism is elsewhere, and guessing between those two has already
// cost one wrong attribution this session (teardown was blamed for Replace and explained 14 ms of
// 68). The curve settles it: flat per-insert cost exonerates the scan outright.
//
// WHAT THIS IS NOT. It prices the CONTAINER OPERATIONS, not the engine — no JSI, no Fabric, no
// folly, no props. That is deliberate and it is the same scope `dynamic-copy.cpp` takes: the
// question is about `std::find` over a `vector<shared_ptr<Node>>` and nothing else. A node here
// therefore carries only what the scan actually touches. If the arms come back flat, the answer is
// "not the container" and the next instrument has to be a real one.
//
// THE CONTROL IS ARM A. `appendChild` does no find at all, so it is the floor every other arm is
// read against. Without it a large number in arm C is unreadable — it could just be what inserting
// a thousand nodes costs.

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <memory>
#include <vector>

namespace {

struct Node;
using NodePtr = std::shared_ptr<Node>;

// Only the two fields the insert path touches. `props`/`committedProps`/`attachedHandle` exist on
// the real node and are never read by a scan, so leaving them out changes the cache footprint of
// the NODES and not of the vector being walked — and it is the vector that is walked.
struct Node {
  Node *parent = nullptr;
  std::vector<NodePtr> children;
};

double millisOf(const char *label, int inserts, void (*arm)(int), int argument) {
  // Two warm passes then the timed one: the first pass pays page faults for the pool, which would
  // otherwise land entirely on whichever arm ran first.
  arm(argument);
  arm(argument);
  const auto start = std::chrono::steady_clock::now();
  arm(argument);
  const auto end = std::chrono::steady_clock::now();
  const double ms =
      std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(end - start).count();
  std::printf("  %-46s %8.3f ms   %7.3f us per insert\n", label, ms,
              ms * 1000.0 / static_cast<double>(inserts));
  return ms;
}

constexpr int kInserts = 1000;

// Arm A — appendChild: push_back, no scan. The floor.
void armAppend(int) {
  auto parent = std::make_shared<Node>();
  for (int at = 0; at < kInserts; at += 1) {
    auto child = std::make_shared<Node>();
    child->parent = parent.get();
    parent->children.push_back(std::move(child));
  }
}

// Arms B..D — insertBefore against a TRAILING anchor, which is the Svelte `{#each}` shape: the find
// walks every standing sibling before reaching it. `standing` is what the list already holds, so
// B is the Create row (empty list) and C/D are the Append row at two widths.
void armInsertBeforeAnchor(int standing) {
  auto parent = std::make_shared<Node>();
  for (int at = 0; at < standing; at += 1) {
    parent->children.push_back(std::make_shared<Node>());
  }
  auto anchor = std::make_shared<Node>();
  anchor->parent = parent.get();
  parent->children.push_back(anchor);

  for (int at = 0; at < kInserts; at += 1) {
    auto child = std::make_shared<Node>();
    child->parent = parent.get();
    auto &siblings = parent->children;
    auto position = std::find(siblings.begin(), siblings.end(), anchor);
    siblings.insert(position, std::move(child));
  }
}

// Arm E — removal, for reference. Already fixed on the JS side (the sweep no longer walks per node),
// and Clear came back to baseline, so this arm should read SMALL. If it does not, the container is
// implicated after all and the JS fix was masking it.
void armRemoveAll(int) {
  auto parent = std::make_shared<Node>();
  std::vector<NodePtr> held;
  held.reserve(kInserts);
  for (int at = 0; at < kInserts; at += 1) {
    auto child = std::make_shared<Node>();
    child->parent = parent.get();
    held.push_back(child);
    parent->children.push_back(std::move(child));
  }
  // Front-to-back, the worst order: every erase shifts the whole remaining tail.
  for (const auto &child : held) {
    auto &siblings = parent->children;
    siblings.erase(std::remove(siblings.begin(), siblings.end(), child), siblings.end());
  }
}

// ── ARM F — THE POST-COMMIT ADOPT PASS, AT ITS WORST ─────────────────────────────────────────────
//
// `adoptCommitted` re-points the retained tree at what Fabric actually committed. It claims
// O(changed) on the grounds that an identical pointer means an identical subtree and stops the
// descent — but that early-out only fires while Fabric leaves nodes alone, and the pass exists
// precisely BECAUSE Fabric substitutes clones inside the commit. When it substitutes throughout,
// the pass degenerates to O(tree), and its per-node body is not free: a `vector<Node *>` for the
// owners, and a ChildSet COPY into `committedChildren`, which is an atomic increment per edge.
//
// Whether Fabric really substitutes the whole tree is Fabric's business and no headless stand-in can
// answer it honestly. What CAN be answered here is the ceiling: if the worst case — every node
// visited, both allocations paid — cannot reach the 107 ms being explained, the mechanism is not
// this one and no device build is needed to say so.
struct Landed {
  std::vector<std::shared_ptr<Landed>> children;
};

void adoptShaped(Node &node, const std::shared_ptr<Landed> &landed,
                 std::vector<std::shared_ptr<Landed>> &committedChildren) {
  std::vector<Node *> owners;
  owners.reserve(node.children.size());
  for (const auto &child : node.children) owners.push_back(child.get());

  const size_t count = std::min(owners.size(), landed->children.size());
  for (size_t index = 0; index < count; index++) {
    std::vector<std::shared_ptr<Landed>> theirs;
    adoptShaped(*owners[index], landed->children[index], theirs);
  }
  // The ChildSet copy: one heap allocation plus an atomic increment per child.
  committedChildren = landed->children;
}

// Ten nodes per row, the shape `examples/svelte`'s benchmark row actually builds.
void buildRow(Node &parent, std::shared_ptr<Landed> &landedParent) {
  for (int at = 0; at < 10; at += 1) {
    auto child = std::make_shared<Node>();
    child->parent = &parent;
    parent.children.push_back(std::move(child));
    landedParent->children.push_back(std::make_shared<Landed>());
  }
}

void armAdoptWholeTree(int rows) {
  auto root = std::make_shared<Node>();
  auto landedRoot = std::make_shared<Landed>();
  for (int row = 0; row < rows; row += 1) {
    auto rowNode = std::make_shared<Node>();
    rowNode->parent = root.get();
    auto landedRow = std::make_shared<Landed>();
    buildRow(*rowNode, landedRow);
    root->children.push_back(std::move(rowNode));
    landedRoot->children.push_back(std::move(landedRow));
  }
  std::vector<std::shared_ptr<Landed>> committed;
  adoptShaped(*root, landedRoot, committed);
}

// ── ARM H — THE FLOOR FOR A ONE-CHILD CHANGE ─────────────────────────────────────────────────────
//
// A persistent tree cannot mutate a parent in place: one child changing means the parent gets a NEW
// child vector, and that vector is O(siblings) whatever the implementation does. So "a one-node
// write costs O(siblings)" is not by itself a defect — it is the price of clone-on-write, and React
// pays it on the identical tree.
//
// What is NOT inherent is how that vector gets built. The floor is a memcpy-shaped copy of the
// standing vector with one slot replaced. `materialize` instead re-derives it: a function call per
// child through `appendRenderable`, each re-deciding reuse against the dirty pair, the family and
// the text context, pushing into a fresh vector AND into a second `owners` vector alongside.
//
// This arm prices the floor so the gap between it and the real thing is a number rather than an
// opinion. Same widths as the insert arms, so the two tables can be read together.
void armReplaceOneChild(int standing) {
  auto parent = std::make_shared<Node>();
  parent->children.reserve(static_cast<size_t>(standing));
  for (int at = 0; at < standing; at += 1) {
    parent->children.push_back(std::make_shared<Node>());
  }
  const size_t middle = static_cast<size_t>(standing) / 2;

  // kInserts commits, each replacing one child — the `select` row, repeated so the timer can see it.
  for (int at = 0; at < kInserts; at += 1) {
    std::vector<NodePtr> next = parent->children;  // the unavoidable copy
    next[middle] = std::make_shared<Node>();       // the one slot that actually changed
    parent->children = std::move(next);
  }
}

// ── ARM I — HOW `materialize` ACTUALLY BUILDS THAT SAME VECTOR ───────────────────────────────────
//
// Arm H is the floor and arm I is the shape of the real thing, in the SAME language so the two are
// comparable — a TypeScript number against a C++ one would say nothing about either.
//
// Per child, `materialize` → `appendRenderable` does: a call, the anchor test, the empty-raw-text
// test, then `materialize` on the child, which re-decides the fast path against `selfDirty`,
// `pathDirty`, a committed pointer, the family (view name plus committed parent) and the text
// context — then pushes into the new child set AND into the `owners` vector beside it.
//
// Modelled here with the same branch and allocation shape. Nothing is measured about WHICH answers
// those checks give; the point is that they are asked N times to rediscover what the standing
// vector already recorded.
struct Modelled {
  bool selfDirty = false;
  bool pathDirty = false;
  bool isAnchor = false;
  bool isEmptyRawText = false;
  const void *committed = nullptr;
  const void *committedParent = nullptr;
  bool committedTextAncestor = false;
  int committedSurfaceId = 0;
};

void armRederiveChildren(int standing) {
  auto parent = std::make_shared<Node>();
  std::vector<Modelled> state(static_cast<size_t>(standing));
  parent->children.reserve(static_cast<size_t>(standing));
  for (int at = 0; at < standing; at += 1) {
    parent->children.push_back(std::make_shared<Node>());
    state[static_cast<size_t>(at)].committed = parent->children.back().get();
    state[static_cast<size_t>(at)].committedParent = parent.get();
  }
  const size_t middle = static_cast<size_t>(standing) / 2;

  for (int at = 0; at < kInserts; at += 1) {
    std::vector<NodePtr> next;
    std::vector<Node *> owners;
    for (size_t index = 0; index < parent->children.size(); index += 1) {
      const Modelled &each = state[index];
      if (each.isAnchor) continue;
      if (each.isEmptyRawText) continue;
      const bool needsFreshFamily =
          each.committed != nullptr && each.committedParent != parent.get();
      const bool contextHeld = each.committedTextAncestor == false && each.committedSurfaceId == 0;
      const bool reuse = !each.selfDirty && !each.pathDirty && each.committed != nullptr &&
          !needsFreshFamily && contextHeld && index != middle;
      next.push_back(reuse ? parent->children[index] : std::make_shared<Node>());
      owners.push_back(next.back().get());
    }
    parent->children = std::move(next);
  }
}

}  // namespace

int main() {
  std::printf("\n%d inserts per arm, trailing anchor, sibling count varied\n\n", kInserts);

  const double floor = millisOf("A  appendChild, no scan (the floor)", kInserts, armAppend, 0);
  const double empty =
      millisOf("B  insertBefore anchor, list starts EMPTY", kInserts, armInsertBeforeAnchor, 0);
  const double thousand =
      millisOf("C  insertBefore anchor, 1 000 standing", kInserts, armInsertBeforeAnchor, 1000);
  const double fourThousand =
      millisOf("D  insertBefore anchor, 4 000 standing", kInserts, armInsertBeforeAnchor, 4000);
  millisOf("E  remove all, front to back", kInserts, armRemoveAll, 0);

  std::printf(
      "\nthe FLOOR for one child changing: copy the sibling vector, replace one slot\n"
      "(%d commits per arm, so the per-commit figure is directly comparable to a `select`)\n\n",
      kInserts);
  millisOf("H   500 siblings", kInserts, armReplaceOneChild, 500);
  millisOf("H  1000 siblings", kInserts, armReplaceOneChild, 1000);
  millisOf("H  2000 siblings", kInserts, armReplaceOneChild, 2000);
  const double floor4000 = millisOf("H  4000 siblings", kInserts, armReplaceOneChild, 4000);

  std::printf("\nthe same vector, built the way `materialize` builds it\n\n");
  millisOf("I   500 siblings", kInserts, armRederiveChildren, 500);
  millisOf("I  1000 siblings", kInserts, armRederiveChildren, 1000);
  millisOf("I  2000 siblings", kInserts, armRederiveChildren, 2000);
  const double rederive4000 = millisOf("I  4000 siblings", kInserts, armRederiveChildren, 4000);
  std::printf("\nheadroom at 4 000 siblings, re-derive over floor: %.1fx\n",
              floor4000 > 0.0 ? rederive4000 / floor4000 : 0.0);

  std::printf("\nthe post-commit adopt pass, every node visited (its worst case)\n\n");
  // Per NODE, not per insert: what is being priced is the walk, and the Create tree holds 10 001 of
  // them against Append's 20 001.
  const double adoptCreate =
      millisOf("F  adopt 1 000 rows  (10 001 nodes, Create)", 10001, armAdoptWholeTree, 1000);
  const double adoptAppend =
      millisOf("G  adopt 2 000 rows  (20 001 nodes, Append)", 20001, armAdoptWholeTree, 2000);
  std::printf("\nG - F, which is what an Append walks and a Create does not: %+.3f ms\n",
              adoptAppend - adoptCreate);

  std::printf("\nthe scan's own cost, against the no-scan floor: B %+.3f ms, C %+.3f, D %+.3f\n",
              empty - floor, thousand - floor, fourThousand - floor);
  // Four times the siblings for four times the cost means the scan is the term; anything flatter
  // means it is not, whatever the pointer arithmetic suggested.
  std::printf("C -> D is a 4x widening: %.2fx the time\n",
              thousand > 0.0 ? fourThousand / thousand : 0.0);
  std::printf("\ndevice gap this is trying to explain: Append is now Create + 125 ms, was + 18\n\n");
  return 0;
}

// Build and run (no pod, no simulator, no device — it needs nothing but a C++20 compiler):
//
//   clang++ -std=c++20 -O2 -DNDEBUG -o /tmp/sibling-scan core/engine/bench/sibling-scan.cpp \
//     && /tmp/sibling-scan

// ── ANSWER, measured (2026-09-17) ───────────────────────────────────────────────────────────────
//
// The scan is exonerated, exactly as arms B/C/D predicted it might be: at 4 000 standing siblings,
// its OWN cost over the no-scan floor is +1.224 ms for 1 000 inserts (C -> D widens 4x in sibling
// count but only 2.76x in time — sub-linear, the opposite of what a quadratic culprit would show).
// Nowhere near the 107 ms device gap this file was built to explain. Do not re-open `std::find` as
// a suspect without a new device measurement pointing back at it.
//
// Arms H/I found the real signal instead, unprompted: the FLOOR for a single-child-change commit
// (copy the sibling vector, splice one slot) already costs real time at scale — 13.8 us/commit at
// 4 000 siblings, expected, that is clone-on-write's own price. What `materialize` actually pays
// for the SAME commit is 28.7 us/commit at the same width: a stable ~2.1x over the floor (2.9x at
// 500 siblings, 2.1x at 1000/2000/4000 — converges, does not grow, so this is a constant per-child
// overhead, not a second quadratic term hiding behind the first). The 14.8 us/commit gap at 4 000
// siblings is `appendRenderable`'s own cost: a function call, the anchor test, the empty-raw-text
// test, and a five-field reuse decision (`selfDirty`, `pathDirty`, committed pointer, family,
// context), asked fresh for every UNCHANGED sibling on a commit where only one child differs.
//
// NOT fixed here. This is a real correctness-adjacent hot path (family tracking, anchor handling,
// text-ancestor context all feed the reuse decision `materialize` makes per child) and changing it
// needs the itest suite's full weight behind it, not a headless container bench. Left as the next
// concrete target: a fast path for "parent structurally unchanged, exactly one child self-dirty"
// that splices instead of re-deriving. Quantified in `.docs/tree-inefficiency-findings.md`.
