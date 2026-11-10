#include "SymbioteContainerQuery.h"

#include <algorithm>
#include <cstdlib>

namespace symbiote {

namespace {

constexpr std::string_view kPortrait = "portrait";
constexpr std::string_view kLandscape = "landscape";

// A cursor over the JSON subset of the grammar: arrays, strings without escapes, numbers
class Reader {
 public:
  explicit Reader(std::string_view text) : text_(text) {}

  bool consume(char expected) {
    skipSpace();
    if (at_ >= text_.size() || text_[at_] != expected) return false;
    at_ += 1;
    return true;
  }

  bool consumeWord(std::string_view word) {
    skipSpace();
    if (text_.substr(at_, word.size()) != word) return false;
    at_ += word.size();
    return true;
  }

  std::optional<std::string> string() {
    if (!consume('"')) return std::nullopt;
    const size_t end = text_.find('"', at_);
    if (end == std::string_view::npos) return std::nullopt;
    std::string value(text_.substr(at_, end - at_));
    if (value.find('\\') != std::string::npos) return std::nullopt;
    at_ = end + 1;
    return value;
  }

  std::optional<double> number() {
    skipSpace();
    const std::string rest(text_.substr(at_));
    char *end = nullptr;
    const double value = std::strtod(rest.c_str(), &end);
    if (end == rest.c_str()) return std::nullopt;
    at_ += static_cast<size_t>(end - rest.c_str());
    return value;
  }

  // The text of the next `{...}`, unread, with braces inside strings left alone
  std::optional<std::string_view> rawObject() {
    skipSpace();
    if (at_ >= text_.size() || text_[at_] != '{') return std::nullopt;
    const size_t start = at_;
    int depth = 0;
    bool isInString = false;
    for (; at_ < text_.size(); at_ += 1) {
      const char each = text_[at_];
      if (isInString) {
        if (each == '\\') at_ += 1;
        else if (each == '"') isInString = false;
      } else if (each == '"') {
        isInString = true;
      } else if (each == '{') {
        depth += 1;
      } else if (each == '}' && --depth == 0) {
        at_ += 1;
        return text_.substr(start, at_ - start);
      }
    }
    return std::nullopt;
  }

  bool atEnd() {
    skipSpace();
    return at_ == text_.size();
  }

  // Each level of nesting enters before it reads and leaves after, whatever the read answered
  bool enter() { return ++depth_ <= kMaxDepth; }
  void leave() { --depth_; }

 private:
  void skipSpace() {
    while (at_ < text_.size() && (text_[at_] == ' ' || text_[at_] == '\n' || text_[at_] == '\t')) {
      at_ += 1;
    }
  }

  // Deeper than any stylesheet nests, so a longer chain is refused before it can overflow the stack
  static constexpr size_t kMaxDepth = 64;

  std::string_view text_;
  size_t at_ = 0;
  size_t depth_ = 0;
};

std::optional<ContainerOp> operatorOf(const std::string &text) {
  if (text == "=") return ContainerOp::kEqual;
  if (text == ">") return ContainerOp::kGreater;
  if (text == ">=") return ContainerOp::kGreaterEqual;
  if (text == "<") return ContainerOp::kLess;
  if (text == "<=") return ContainerOp::kLessEqual;
  return std::nullopt;
}

std::optional<ContainerFeature> featureOf(const std::string &text) {
  if (text == "width") return ContainerFeature::kWidth;
  if (text == "height") return ContainerFeature::kHeight;
  if (text == "aspect-ratio") return ContainerFeature::kAspectRatio;
  if (text == "orientation") return ContainerFeature::kOrientation;
  return std::nullopt;
}

std::optional<ContainerCondition> parseCondition(Reader &reader, bool insideContainer);

// `[c, c, ...]` after the `&` or `|` tag
std::optional<std::vector<ContainerCondition>> parseChildren(Reader &reader, bool insideContainer) {
  std::vector<ContainerCondition> children;
  if (!reader.consume('[')) return std::nullopt;
  bool isFirst = true;
  while (!reader.consume(']')) {
    if (!isFirst && !reader.consume(',')) return std::nullopt;
    isFirst = false;
    std::optional<ContainerCondition> child = parseCondition(reader, insideContainer);
    if (!child.has_value()) return std::nullopt;
    children.push_back(std::move(*child));
  }
  return children;
}

// The rest of `[op, feature, value]` once the operator is known
std::optional<ContainerCondition> parseCompare(Reader &reader, ContainerOp op) {
  ContainerCondition condition;
  condition.kind = ContainerCondition::Kind::kCompare;
  condition.op = op;
  if (!reader.consume(',')) return std::nullopt;
  const std::optional<std::string> featureName = reader.string();
  const std::optional<ContainerFeature> feature =
      featureName.has_value() ? featureOf(*featureName) : std::nullopt;
  if (!feature.has_value() || !reader.consume(',')) return std::nullopt;
  condition.feature = *feature;
  if (*feature == ContainerFeature::kOrientation) {
    std::optional<std::string> keyword = reader.string();
    if (!keyword.has_value()) return std::nullopt;
    condition.keyword = std::move(*keyword);
  } else {
    const std::optional<double> number = reader.number();
    if (!number.has_value()) return std::nullopt;
    condition.number = *number;
  }
  if (!reader.consume(']')) return std::nullopt;
  return condition;
}

// The rest of `["@", name, query]` once the tag is read
std::optional<ContainerCondition> parseContainer(Reader &reader) {
  ContainerCondition condition;
  condition.kind = ContainerCondition::Kind::kContainer;
  if (!reader.consume(',')) return std::nullopt;
  if (!reader.consumeWord("null")) {
    condition.name = reader.string();
    if (!condition.name.has_value()) return std::nullopt;
  }
  if (!reader.consume(',')) return std::nullopt;
  std::optional<ContainerCondition> query = parseCondition(reader, true);
  if (!query.has_value() || !reader.consume(']')) return std::nullopt;
  condition.children.push_back(std::move(*query));
  return condition;
}

// A tagged array: `["&", [..]]`, `["|", [..]]`, `["!", c]`, `["@", name, c]` or a comparison
std::optional<ContainerCondition> parseTagged(Reader &reader, bool insideContainer) {
  const std::optional<std::string> tag = reader.string();
  if (!tag.has_value()) return std::nullopt;
  ContainerCondition condition;
  if (*tag == "&" || *tag == "|") {
    condition.kind = *tag == "&" ? ContainerCondition::Kind::kAnd : ContainerCondition::Kind::kOr;
    if (!reader.consume(',')) return std::nullopt;
    std::optional<std::vector<ContainerCondition>> children = parseChildren(reader, insideContainer);
    if (!children.has_value() || !reader.consume(']')) return std::nullopt;
    condition.children = std::move(*children);
    return condition;
  }
  if (*tag == "!") {
    condition.kind = ContainerCondition::Kind::kNot;
    if (!reader.consume(',')) return std::nullopt;
    std::optional<ContainerCondition> inner = parseCondition(reader, insideContainer);
    if (!inner.has_value() || !reader.consume(']')) return std::nullopt;
    condition.children.push_back(std::move(*inner));
    return condition;
  }
  if (*tag == "@") return insideContainer ? std::nullopt : parseContainer(reader);
  const std::optional<ContainerOp> op = operatorOf(*tag);
  if (!op.has_value() || !insideContainer) return std::nullopt;
  return parseCompare(reader, *op);
}

std::optional<ContainerCondition> parseConditionBody(Reader &reader, bool insideContainer) {
  ContainerCondition constant;
  if (reader.consumeWord("true")) {
    constant.constant = true;
    return constant;
  }
  if (reader.consumeWord("false")) return constant;
  if (!reader.consume('[')) return std::nullopt;
  return parseTagged(reader, insideContainer);
}

std::optional<ContainerCondition> parseCondition(Reader &reader, bool insideContainer) {
  const bool isTooDeep = !reader.enter();
  std::optional<ContainerCondition> parsed =
      isTooDeep ? std::nullopt : parseConditionBody(reader, insideContainer);
  reader.leave();
  return parsed;
}

bool compareNumbers(ContainerOp op, double actual, double expected) {
  switch (op) {
    case ContainerOp::kEqual: return actual == expected;
    case ContainerOp::kGreater: return actual > expected;
    case ContainerOp::kGreaterEqual: return actual >= expected;
    case ContainerOp::kLess: return actual < expected;
    case ContainerOp::kLessEqual: return actual <= expected;
  }
  return false;
}

// A square container is portrait, as on the web, and a flat one has no ratio to compare
bool holdsCompare(const ContainerCondition &condition, const ContainerSize &size) {
  switch (condition.feature) {
    case ContainerFeature::kWidth: return compareNumbers(condition.op, size.width, condition.number);
    case ContainerFeature::kHeight: return compareNumbers(condition.op, size.height, condition.number);
    case ContainerFeature::kAspectRatio:
      return size.height != 0 &&
          compareNumbers(condition.op, size.width / size.height, condition.number);
    case ContainerFeature::kOrientation: {
      const std::string_view actual = size.height >= size.width ? kPortrait : kLandscape;
      return condition.op == ContainerOp::kEqual && condition.keyword == actual;
    }
  }
  return false;
}

// Whether the query reads an axis the container leaves open, `aspect-ratio` and `orientation` both
bool readsOpenAxis(const ContainerCondition &condition, const ContainerSize &size) {
  switch (condition.kind) {
    case ContainerCondition::Kind::kAnd:
    case ContainerCondition::Kind::kOr:
    case ContainerCondition::Kind::kNot:
      return std::any_of(condition.children.begin(), condition.children.end(), [&](const auto &child) {
        return readsOpenAxis(child, size);
      });
    case ContainerCondition::Kind::kCompare: {
      const bool isHeightOnly = condition.feature == ContainerFeature::kHeight;
      const bool isWidthOnly = condition.feature == ContainerFeature::kWidth;
      return (!isHeightOnly && size.isWidthOpen) || (!isWidthOnly && size.isHeightOpen);
    }
    case ContainerCondition::Kind::kConstant:
    case ContainerCondition::Kind::kContainer: return false;
  }
  return false;
}

bool holds(
    const ContainerCondition &condition,
    const ContainerSize *inside,
    const ContainerLookup &containerOf) {
  const auto holdsChild = [&](const ContainerCondition &child) {
    return holds(child, inside, containerOf);
  };
  switch (condition.kind) {
    case ContainerCondition::Kind::kConstant: return condition.constant;
    case ContainerCondition::Kind::kAnd:
      return std::all_of(condition.children.begin(), condition.children.end(), holdsChild);
    case ContainerCondition::Kind::kOr:
      return std::any_of(condition.children.begin(), condition.children.end(), holdsChild);
    case ContainerCondition::Kind::kNot: return !holdsChild(condition.children.front());
    case ContainerCondition::Kind::kCompare: return inside != nullptr && holdsCompare(condition, *inside);
    case ContainerCondition::Kind::kContainer: {
      const std::optional<ContainerSize> size = containerOf(condition.name);
      return size.has_value() && !readsOpenAxis(condition.children.front(), *size) &&
          holds(condition.children.front(), &*size, containerOf);
    }
  }
  return false;
}

constexpr size_t kMaxVariantConditions = 16;

// `[mask, {style}]` once the separating comma is read
std::optional<ContainerVariantStyle> parseVariantStyle(Reader &reader) {
  if (!reader.consume('[')) return std::nullopt;
  const std::optional<double> mask = reader.number();
  if (!mask.has_value() || *mask < 1 || *mask != static_cast<uint32_t>(*mask)) return std::nullopt;
  if (!reader.consume(',')) return std::nullopt;
  const std::optional<std::string_view> style = reader.rawObject();
  if (!style.has_value() || !reader.consume(']')) return std::nullopt;
  return ContainerVariantStyle{static_cast<uint32_t>(*mask), std::string(*style)};
}

} // namespace

std::optional<ContainerVariants> parseContainerVariants(std::string_view json) {
  Reader reader(json);
  ContainerVariants variants;
  if (!reader.consume('[')) return std::nullopt;
  std::optional<std::vector<ContainerCondition>> conditions = parseChildren(reader, false);
  if (!conditions.has_value() || conditions->size() > kMaxVariantConditions) return std::nullopt;
  variants.conditions = std::move(*conditions);
  while (!reader.consume(']')) {
    if (!reader.consume(',')) return std::nullopt;
    std::optional<ContainerVariantStyle> style = parseVariantStyle(reader);
    if (!style.has_value()) return std::nullopt;
    variants.styles.push_back(std::move(*style));
  }
  return reader.atEnd() ? std::optional<ContainerVariants>(std::move(variants)) : std::nullopt;
}

uint32_t holdingMask(const ContainerVariants &variants, const ContainerLookup &containerOf) {
  uint32_t mask = 0;
  for (size_t at = 0; at < variants.conditions.size(); at += 1) {
    if (holdsContainerCondition(variants.conditions[at], containerOf)) mask |= uint32_t{1} << at;
  }
  return mask;
}

std::optional<std::string> styleJsonForMask(const ContainerVariants &variants, uint32_t mask) {
  const auto found = std::find_if(variants.styles.begin(), variants.styles.end(), [&](const auto &each) {
    return each.mask == mask;
  });
  return found == variants.styles.end() ? std::nullopt : std::optional<std::string>(found->styleJson);
}

std::optional<ContainerCondition> parseContainerCondition(std::string_view json) {
  Reader reader(json);
  std::optional<ContainerCondition> condition = parseCondition(reader, false);
  return condition.has_value() && reader.atEnd() ? condition : std::nullopt;
}

bool holdsContainerCondition(const ContainerCondition &condition, const ContainerLookup &containerOf) {
  return holds(condition, nullptr, containerOf);
}

} // namespace symbiote
