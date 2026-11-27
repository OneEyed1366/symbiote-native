// Prices an insert as the sibling list grows, and whether that is where Append went
// `examples/svelte` regressed on Create, Append and Replace with `WRITES` and the tree identical
// Append inserts into a list that already holds a thousand children, so a per-sibling cost fits

// The one such scan on the path is the `std::find` over siblings in `SymbioteTree.cpp`
// Svelte reaches it on every row: `{#each}` inserts before an anchor that sits after the items,
// which the renderer spells as `insertBefore(node, anchor)`, so the find walks the whole list

// The arithmetic says it should not matter: a thousand inserts over ~1 500 siblings is ~1.5M
// pointer comparisons in a 24 KB vector held in L2, single-digit ms and not 107
// A flat per-insert cost across the arms exonerates the scan outright

// Prices the container operations only (no JSI, Fabric, folly or props), as `dynamic-copy.cpp` does
// A node carries only what the scan touches, and flat arms mean a real instrument is next

// Arm A is the control: `appendChild` does no find, so it is the floor for every other arm

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <memory>
#include <vector>

namespace {

struct Node;
using NodePtr = std::shared_ptr<Node>;

// Only the two fields the insert path touches, so node size does not skew the vector being walked
struct Node {
  Node *parent = nullptr;
  std::vector<NodePtr> children;
};

double millisOf(const char *label, int inserts, void (*arm)(int), int argument) {
  // Two warm passes, then the timed one, as the first pass pays the pool's page faults
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

// Arm A, `appendChild`: push_back with no scan, the floor
void armAppend(int) {
  auto parent = std::make_shared<Node>();
  for (int at = 0; at < kInserts; at += 1) {
    auto child = std::make_shared<Node>();
    child->parent = parent.get();
    parent->children.push_back(std::move(child));
  }
}

// Arms B to D, `insertBefore` against a trailing anchor, the `{#each}` shape: the find walks every
// standing sibling first, and `standing` is what the list holds (B is Create, C and D are Append)
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

// Arm E, removal, for reference: already fixed on the JS side and Clear is back at baseline
// If it reads large the container is implicated after all, and the JS fix was masking it
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
  // Front-to-back is the worst order, as every erase shifts the whole remaining tail
  for (const auto &child : held) {
    auto &siblings = parent->children;
    siblings.erase(std::remove(siblings.begin(), siblings.end(), child), siblings.end());
  }
}

// Arm F, the post-commit adopt pass at its worst: `adoptCommitted` claims O(changed) via the
// identical-pointer early-out, but Fabric substitutes clones in the commit, so it can be O(tree)
// Whether Fabric does is not answerable headless, so this prices the ceiling: every node visited
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
  // The ChildSet copy: one heap allocation plus an atomic increment per child
  committedChildren = landed->children;
}

// Ten nodes per row, the shape of `examples/svelte`'s benchmark row
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

// Arm H, the floor for a one-child change: a persistent tree gives the parent a NEW child vector,
// O(siblings) whatever the implementation, so that cost is clone-on-write's price and React pays it
// The floor is a copy of the standing vector with one slot replaced, at the insert arms' widths
void armReplaceOneChild(int standing) {
  auto parent = std::make_shared<Node>();
  parent->children.reserve(static_cast<size_t>(standing));
  for (int at = 0; at < standing; at += 1) {
    parent->children.push_back(std::make_shared<Node>());
  }
  const size_t middle = static_cast<size_t>(standing) / 2;

  // `kInserts` commits each replacing one child, like `select`, repeated so the timer sees it
  for (int at = 0; at < kInserts; at += 1) {
    std::vector<NodePtr> next = parent->children;  // the unavoidable copy
    next[middle] = std::make_shared<Node>();       // the one slot that actually changed
    parent->children = std::move(next);
  }
}

// Arm I, how `materialize` builds that same vector, in the same language so the arms compare
// Per child: anchor and empty-raw-text tests, then a reuse decision over dirty flags, committed
// pointer, family and text context, modelled with the same branch and allocation shape
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
  // Per NODE, not per insert, as the walk is priced: Create holds 10 001 nodes, Append 20 001
  const double adoptCreate =
      millisOf("F  adopt 1 000 rows  (10 001 nodes, Create)", 10001, armAdoptWholeTree, 1000);
  const double adoptAppend =
      millisOf("G  adopt 2 000 rows  (20 001 nodes, Append)", 20001, armAdoptWholeTree, 2000);
  std::printf("\nG - F, which is what an Append walks and a Create does not: %+.3f ms\n",
              adoptAppend - adoptCreate);

  std::printf("\nthe scan's own cost, against the no-scan floor: B %+.3f ms, C %+.3f, D %+.3f\n",
              empty - floor, thousand - floor, fourThousand - floor);
  // Four times the siblings for four times the cost means the scan is the term, flatter means not
  std::printf("C -> D is a 4x widening: %.2fx the time\n",
              thousand > 0.0 ? fourThousand / thousand : 0.0);
  std::printf("\ndevice gap this is trying to explain: Append is now Create + 125 ms, was + 18\n\n");
  return 0;
}

// Build and run, it needs nothing but a C++20 compiler

//   clang++ -std=c++20 -O2 -DNDEBUG -o /tmp/sibling-scan core/engine/bench/sibling-scan.cpp \
//     && /tmp/sibling-scan

// Result: the scan costs +1.224 ms over the no-scan floor at 4 000 siblings and 1 000 inserts
// C to D widens 4x in siblings and 2.76x in time, so it is sub-linear and far from the 107 ms gap
// Do not reopen `std::find` as a suspect without a new device measurement pointing back at it

// Arms H and I found the real signal: a one-child commit costs 13.8 us at 4 000 siblings (floor)
// against 28.7 us through `materialize`, a stable ~2.1x (2.9x at 500, 2.1x at 1000 to 4000)
// The 14.8 us gap is `appendRenderable`'s per-sibling work, asked again for every unchanged child

// Not fixed here, as the reuse decision feeds family, anchor and text-ancestor handling
// The next target is a fast path that splices when the parent is unchanged and one child is dirty
