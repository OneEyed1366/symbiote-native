#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace symbiote {

// The laid-out size of a container, which is all a container query can read
// An axis the container's own style leaves to its content is open, and no query may read it
struct ContainerSize {
  double width;
  double height;
  bool isWidthOpen = false;
  bool isHeightOpen = false;
};

enum class ContainerFeature { kWidth, kHeight, kAspectRatio, kOrientation };
enum class ContainerOp { kEqual, kGreater, kGreaterEqual, kLess, kLessEqual };

// The residual of a rule's condition once the JS side settled every `@media` leaf into a constant
// Mirrors the tuple tree of `style-registry/media-evaluate.ts`: only `@container` leaves are left
struct ContainerCondition {
  enum class Kind { kConstant, kAnd, kOr, kNot, kCompare, kContainer };

  Kind kind = Kind::kConstant;
  bool constant = false;
  // The operands of `&` and `|`, the one operand of `!`, the query inside a container leaf
  std::vector<ContainerCondition> children;
  ContainerOp op = ContainerOp::kEqual;
  ContainerFeature feature = ContainerFeature::kWidth;
  double number = 0;
  std::string keyword;
  // The container a leaf asks for, `nullopt` for the nearest one
  std::optional<std::string> name;
};

// The size of the container a node answers to, `nullopt` when it has none
using ContainerLookup = std::function<std::optional<ContainerSize>(const std::optional<std::string> &name)>;

// Reads the JSON the JS side ships, `nullopt` when the text is not a condition of this grammar
std::optional<ContainerCondition> parseContainerCondition(std::string_view json);

// A container leaf holds only when `containerOf` finds a container, as on the web
bool holdsContainerCondition(const ContainerCondition &condition, const ContainerLookup &containerOf);

// The style a consumer takes when exactly the conditions of `mask` hold, kept as JSON text
struct ContainerVariantStyle {
  uint32_t mask = 0;
  std::string styleJson;
};

// What JS ships per consumer node: its conditions, and a style for each mask worth switching to
// Bit `i` of a mask stands for `conditions[i]`. The all-clear mask has no entry, its style is the
// one already on the node
struct ContainerVariants {
  std::vector<ContainerCondition> conditions;
  std::vector<ContainerVariantStyle> styles;
};

// Reads `[[condition, ...], [mask, {style}], ...]`, `nullopt` when the text is not that
std::optional<ContainerVariants> parseContainerVariants(std::string_view json);

// The mask of conditions that hold for the containers `containerOf` finds
uint32_t holdingMask(const ContainerVariants &variants, const ContainerLookup &containerOf);

std::optional<std::string> styleJsonForMask(const ContainerVariants &variants, uint32_t mask);

} // namespace symbiote
