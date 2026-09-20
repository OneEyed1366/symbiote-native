// Can the engine chunk a wide list BY ITSELF, or does the wrapper change the layout?
//
// WHY THIS EXISTS. Chunking is the largest lever this investigation found: grouping a flat list into
// runs of 50 drops Fabric's child re-adoption 50x (F-5) and a write's sibling scan 11x (F-3). It has
// stayed a recommendation to the app author for one reason only — a wrapper node generates a layout
// box, so `container > 1000 rows` and `container > 20 groups > 50 rows` lay out differently, and an
// engine may not silently change what an app looks like.
//
// `display: contents` removes exactly that objection. Yoga 0.86 implements it as a first-class
// feature (`Display::Contents` in `LayoutableChildren.h`, a `contentsChildrenCount_` on `Node`), and
// RN's own `conversions.h:428` maps the string straight to it — so the style reaches Yoga through
// the ordinary prop path, from any adapter, with no fork.
//
// The first version of this bench asked one question on ONE tree shape — fixed-height rows in a
// column — and got a clean answer, which is exactly the shape of result that should not be trusted.
// `display: contents` is the CSS feature most known for being correct on the simple case and wrong
// the moment a percentage, a flex distribution, a gap or a containing block is involved, because all
// four are resolved against a box the wrapper is supposed not to have. So the table below is hostile
// on purpose: every profile is a style that would expose the wrapper if Yoga hoisted it incompletely.
//
// Yoga is the right place to ask and the only one needed: zero external includes, so this builds
// with one clang++ invocation and needs no pod, no simulator, no device. It does NOT model
// `adoptYogaChild`, `ShadowTree::commit` or the differ — the re-adoption half is already measured in
// `fake-fabric.ts`'s `childrenAdopted`. This answers layout and nothing else.

#include <yoga/Yoga.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <vector>

namespace {

constexpr int kRows = 1'000;
constexpr int kChunk = 50;
constexpr int kCellsPerRow = 3;
constexpr float kContainerWidth = 400.0F;
constexpr float kContainerHeight = 600.0F;
constexpr int kRepeats = 5;

using StyleFn = void (*)(YGNodeRef);

struct Profile {
  const char *name;
  StyleFn styleContainer;
  StyleFn styleRow;
  /** Rows to build. Small where a profile's point is visible without a thousand of them. */
  int rows;
};

struct Tree {
  YGNodeRef root;
  /** Every row, in order, whichever tree shape holds them. */
  std::vector<YGNodeRef> rows;
};

// ── the profiles ───────────────────────────────────────────────────────────────────────────────

void containerPlain(YGNodeRef container) {
  YGNodeStyleSetFlexDirection(container, YGFlexDirectionColumn);
  YGNodeStyleSetWidth(container, kContainerWidth);
}

void containerGap(YGNodeRef container) {
  containerPlain(container);
  // The sharpest question in the table: a gap is inserted BETWEEN flex items. If the wrapper is a
  // flex item, 20 gaps appear; if the rows are, 999 do.
  YGNodeStyleSetGap(container, YGGutterRow, 8.0F);
}

void containerFixedHeight(YGNodeRef container) {
  containerPlain(container);
  YGNodeStyleSetHeight(container, kContainerHeight);
}

void containerSpaceBetween(YGNodeRef container) {
  containerFixedHeight(container);
  YGNodeStyleSetJustifyContent(container, YGJustifySpaceBetween);
}

void containerCenter(YGNodeRef container) {
  containerPlain(container);
  YGNodeStyleSetAlignItems(container, YGAlignCenter);
}

void rowFixed(YGNodeRef row) {
  YGNodeStyleSetHeight(row, 24.0F);
}

void rowGrow(YGNodeRef row) {
  // Flex distribution is the other place a stray box shows: the free space must be divided among
  // the ROWS, not among twenty wrappers.
  YGNodeStyleSetFlexGrow(row, 1.0F);
  YGNodeStyleSetFlexBasis(row, 0.0F);
}

void rowPercentHeight(YGNodeRef row) {
  // A percentage resolves against the containing block. The wrapper must not become one.
  YGNodeStyleSetHeightPercent(row, 10.0F);
}

void rowNarrow(YGNodeRef row) {
  YGNodeStyleSetHeight(row, 24.0F);
  YGNodeStyleSetWidth(row, 200.0F);
}

void rowAbsolute(YGNodeRef row) {
  YGNodeStyleSetHeight(row, 24.0F);
  YGNodeStyleSetPositionType(row, YGPositionTypeAbsolute);
  YGNodeStyleSetPosition(row, YGEdgeTop, 12.0F);
  YGNodeStyleSetPosition(row, YGEdgeLeft, 4.0F);
}

const Profile kProfiles[] = {
    {"fixed heights", containerPlain, rowFixed, kRows},
    {"container row gap 8", containerGap, rowFixed, kRows},
    {"rows flexGrow, fixed container", containerFixedHeight, rowGrow, 20},
    {"rows height 10%", containerFixedHeight, rowPercentHeight, 20},
    {"justifyContent space-between", containerSpaceBetween, rowFixed, 20},
    {"alignItems center, narrow rows", containerCenter, rowNarrow, kRows},
    {"rows position absolute", containerPlain, rowAbsolute, 20},
};

// ── tree building ──────────────────────────────────────────────────────────────────────────────

YGNodeRef makeRow(StyleFn styleRow) {
  YGNodeRef row = YGNodeNew();
  YGNodeStyleSetFlexDirection(row, YGFlexDirectionRow);
  YGNodeStyleSetPadding(row, YGEdgeHorizontal, 8.0F);
  styleRow(row);
  for (int at = 0; at < kCellsPerRow; at += 1) {
    YGNodeRef cell = YGNodeNew();
    YGNodeStyleSetFlexGrow(cell, 1.0F);
    YGNodeStyleSetHeight(cell, 20.0F);
    YGNodeInsertChild(row, cell, static_cast<size_t>(at));
  }
  return row;
}

Tree buildFlat(const Profile &profile) {
  Tree tree{YGNodeNew(), {}};
  profile.styleContainer(tree.root);
  tree.rows.reserve(static_cast<size_t>(profile.rows));
  for (int at = 0; at < profile.rows; at += 1) {
    YGNodeRef row = makeRow(profile.styleRow);
    YGNodeInsertChild(tree.root, row, static_cast<size_t>(at));
    tree.rows.push_back(row);
  }
  return tree;
}

/**
 * The same rows, grouped under wrappers.
 *
 * `contents` picks whether the wrapper generates a box. FALSE is the NEGATIVE CONTROL and it is not
 * optional: seven hostile profiles all reading 0.0000 is equally consistent with "the wrapper is
 * invisible" and with "this harness cannot see a wrapper at all". An ordinary wrapper must show
 * drift, or none of the zeroes mean anything.
 *
 * Note it will NOT show drift on every profile, and that is informative rather than a hole: in a
 * plain column of fixed-height rows, twenty stacked wrappers land the rows exactly where a flat list
 * does. The profiles that separate them are the ones where the wrapper becomes a flex item with a
 * share, a containing block, or a gap boundary.
 */
Tree buildGrouped(const Profile &profile, int chunk, bool contents) {
  Tree tree{YGNodeNew(), {}};
  profile.styleContainer(tree.root);
  tree.rows.reserve(static_cast<size_t>(profile.rows));
  YGNodeRef group = nullptr;
  for (int at = 0; at < profile.rows; at += 1) {
    if (at % chunk == 0) {
      group = YGNodeNew();
      if (contents) YGNodeStyleSetDisplay(group, YGDisplayContents);
      YGNodeInsertChild(tree.root, group, YGNodeGetChildCount(tree.root));
    }
    YGNodeRef row = makeRow(profile.styleRow);
    YGNodeInsertChild(group, row, YGNodeGetChildCount(group));
    tree.rows.push_back(row);
  }
  return tree;
}

Tree buildChunked(const Profile &profile, int chunk) {
  return buildGrouped(profile, chunk, true);
}

/** Chunks of chunks, for a list too wide for one level of grouping. */
Tree buildNested(const Profile &profile, int inner, int outer) {
  Tree tree{YGNodeNew(), {}};
  profile.styleContainer(tree.root);
  tree.rows.reserve(static_cast<size_t>(profile.rows));
  YGNodeRef outerGroup = nullptr;
  YGNodeRef innerGroup = nullptr;
  for (int at = 0; at < profile.rows; at += 1) {
    if (at % (inner * outer) == 0) {
      outerGroup = YGNodeNew();
      YGNodeStyleSetDisplay(outerGroup, YGDisplayContents);
      YGNodeInsertChild(tree.root, outerGroup, YGNodeGetChildCount(tree.root));
    }
    if (at % inner == 0) {
      innerGroup = YGNodeNew();
      YGNodeStyleSetDisplay(innerGroup, YGDisplayContents);
      YGNodeInsertChild(outerGroup, innerGroup, YGNodeGetChildCount(outerGroup));
    }
    YGNodeRef row = makeRow(profile.styleRow);
    YGNodeInsertChild(innerGroup, row, YGNodeGetChildCount(innerGroup));
    tree.rows.push_back(row);
  }
  return tree;
}

void layout(const Tree &tree) {
  YGNodeCalculateLayout(tree.root, kContainerWidth, YGUndefined, YGDirectionLTR);
}

/** Absolute position, summed up the parent chain — a wrapper contributes whatever Yoga gave it. */
void absoluteOf(YGNodeRef node, float &left, float &top) {
  left = 0.0F;
  top = 0.0F;
  for (YGNodeRef at = node; at != nullptr; at = YGNodeGetParent(at)) {
    left += YGNodeLayoutGetLeft(at);
    top += YGNodeLayoutGetTop(at);
  }
}

/** The worst disagreement between two trees, over every row's position and size. */
float worstDrift(const Tree &flat, const Tree &other) {
  float worst = 0.0F;
  for (size_t at = 0; at < flat.rows.size(); at += 1) {
    float flatLeft = 0.0F;
    float flatTop = 0.0F;
    float otherLeft = 0.0F;
    float otherTop = 0.0F;
    absoluteOf(flat.rows[at], flatLeft, flatTop);
    absoluteOf(other.rows[at], otherLeft, otherTop);
    worst = std::fmax(worst, std::fabs(flatLeft - otherLeft));
    worst = std::fmax(worst, std::fabs(flatTop - otherTop));
    worst = std::fmax(worst,
                      std::fabs(YGNodeLayoutGetWidth(flat.rows[at]) -
                                YGNodeLayoutGetWidth(other.rows[at])));
    worst = std::fmax(worst,
                      std::fabs(YGNodeLayoutGetHeight(flat.rows[at]) -
                                YGNodeLayoutGetHeight(other.rows[at])));
  }
  return worst;
}

template <typename TBuild>
double timedFirstLayout(TBuild &&build) {
  double best = 1e9;
  for (int at = 0; at < kRepeats; at += 1) {
    Tree tree = build();
    const auto startedAt = std::chrono::steady_clock::now();
    layout(tree);
    const double ms = std::chrono::duration<double, std::milli>(
                          std::chrono::steady_clock::now() - startedAt)
                          .count();
    if (ms < best) best = ms;
    YGNodeFreeRecursive(tree.root);
  }
  return best;
}

/** Layout again after ONE row is dirtied — the shape a `select` takes. */
template <typename TBuild>
double timedRelayout(TBuild &&build) {
  double best = 1e9;
  for (int at = 0; at < kRepeats; at += 1) {
    Tree tree = build();
    layout(tree);
    YGNodeStyleSetPadding(tree.rows[tree.rows.size() / 2], YGEdgeHorizontal,
                          12.0F);
    const auto startedAt = std::chrono::steady_clock::now();
    layout(tree);
    const double ms = std::chrono::duration<double, std::milli>(
                          std::chrono::steady_clock::now() - startedAt)
                          .count();
    if (ms < best) best = ms;
    YGNodeFreeRecursive(tree.root);
  }
  return best;
}

}  // namespace

int main() {
  std::printf("chunk %d, container %.0fpx — drift is the worst position or size\n"
              "disagreement between the flat tree and the grouped one, over every row.\n\n",
              kChunk, static_cast<double>(kContainerWidth));
  std::printf("%-32s %6s %10s %8s %14s\n", "profile", "rows", "contents",
              "nested", "PLAIN (ctrl)");

  for (const Profile &profile : kProfiles) {
    Tree flat = buildFlat(profile);
    Tree chunked = buildChunked(profile, kChunk);
    Tree nested = buildNested(profile, 5, 4);
    Tree plain = buildGrouped(profile, kChunk, false);
    layout(flat);
    layout(chunked);
    layout(nested);
    layout(plain);
    std::printf("%-32s %6d %10.4f %8.4f %14.4f\n", profile.name, profile.rows,
                static_cast<double>(worstDrift(flat, chunked)),
                static_cast<double>(worstDrift(flat, nested)),
                static_cast<double>(worstDrift(flat, plain)));
    YGNodeFreeRecursive(flat.root);
    YGNodeFreeRecursive(chunked.root);
    YGNodeFreeRecursive(nested.root);
    YGNodeFreeRecursive(plain.root);
  }

  const Profile &timedProfile = kProfiles[0];
  const double flatFirst =
      timedFirstLayout([&]() { return buildFlat(timedProfile); });
  const double chunkedFirst =
      timedFirstLayout([&]() { return buildChunked(timedProfile, kChunk); });
  const double flatAgain =
      timedRelayout([&]() { return buildFlat(timedProfile); });
  const double chunkedAgain =
      timedRelayout([&]() { return buildChunked(timedProfile, kChunk); });

  std::printf("\n%d rows, '%s'\n", timedProfile.rows, timedProfile.name);
  std::printf("%-22s %10s %10s %10s\n", "", "FLAT", "CHUNKED", "ratio");
  std::printf("%-22s %10.3f %10.3f %9.2fx\n", "first layout, ms", flatFirst,
              chunkedFirst, chunkedFirst / flatFirst);
  std::printf("%-22s %10.3f %10.3f %9.2fx\n", "relayout, one row, ms",
              flatAgain, chunkedAgain, chunkedAgain / flatAgain);
  return 0;
}

// Build (Yoga has zero external includes — no pod, no simulator, no device):
//
//   clang++ -std=c++20 -O2 -DNDEBUG \
//     -I.vendors/react-native/packages/react-native/ReactCommon/yoga \
//     $(find .vendors/react-native/packages/react-native/ReactCommon/yoga/yoga -name '*.cpp') \
//     core/engine/bench/contents-chunking.cpp -o .docs/contents-chunking \
//     && .docs/contents-chunking
