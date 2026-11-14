#include "SymbioteShorthand.h"

#include <array>
#include <cctype>
#include <cstdio>
#include <cstdlib>
#include <unordered_map>

namespace symbiote {

namespace {

using Tokens = std::vector<std::string>;
using Longhands = std::vector<std::pair<std::string, std::string>>;
using Sides = std::array<std::string, 4>;

constexpr size_t kMaxSides = 4;
constexpr double kRatioDigits = 7;
constexpr const char *kZeroPercent = "0%";
constexpr const char *kAuto = "auto";

ShorthandResult notShorthand() {
  return {ShorthandOutcome::kNotShorthand, {}};
}

ShorthandResult invalid() {
  return {ShorthandOutcome::kInvalid, {}};
}

ShorthandResult expandedTo(Longhands longhands) {
  return {ShorthandOutcome::kExpanded, std::move(longhands)};
}

bool isSpace(char c) {
  return std::isspace(static_cast<unsigned char>(c)) != 0;
}

// Whitespace-separated tokens, a function such as `rgb(1, 2, 3)` counting as one
Tokens tokensOf(std::string_view text) {
  Tokens tokens;
  std::string current;
  int depth = 0;
  for (const char c : text) {
    if (c == '(') depth += 1;
    if (c == ')') depth -= 1;
    if (isSpace(c) && depth <= 0) {
      if (!current.empty()) tokens.push_back(std::move(current));
      current.clear();
      continue;
    }
    current += c;
  }
  if (!current.empty()) tokens.push_back(std::move(current));
  return tokens;
}

bool isNumber(const std::string &token) {
  if (token.empty()) return false;
  char *end = nullptr;
  std::strtod(token.c_str(), &end);
  return *end == '\0';
}

// The four values of a CSS box shorthand, in top, right, bottom, left order
Sides boxSides(const Tokens &tokens) {
  const std::string &first = tokens[0];
  const std::string &second = tokens.size() > 1 ? tokens[1] : first;
  const std::string &third = tokens.size() > 2 ? tokens[2] : first;
  const std::string &fourth = tokens.size() > 3 ? tokens[3] : second;
  return {first, second, third, fourth};
}

bool allEqual(const Sides &sides) {
  return sides[0] == sides[1] && sides[1] == sides[2] && sides[2] == sides[3];
}

struct RectSpec {
  // The one-key form, empty when RN has none and the value is always split
  const char *shorthand;
  std::array<const char *, 4> sides;
};

const std::unordered_map<std::string, RectSpec> &rects() {
  static const std::unordered_map<std::string, RectSpec> table = {
      {"padding", {"padding", {"paddingTop", "paddingRight", "paddingBottom", "paddingLeft"}}},
      {"margin", {"margin", {"marginTop", "marginRight", "marginBottom", "marginLeft"}}},
      {"borderWidth",
       {"borderWidth", {"borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"}}},
      {"borderColor",
       {"borderColor", {"borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor"}}},
      {"inset", {"", {"top", "right", "bottom", "left"}}},
  };
  return table;
}

ShorthandResult expandRect(const RectSpec &spec, const Tokens &tokens) {
  if (tokens.empty() || tokens.size() > kMaxSides) return invalid();
  const std::string shorthand = spec.shorthand;
  if (tokens.size() == 1 && !shorthand.empty()) return notShorthand();
  const Sides sides = boxSides(tokens);
  if (allEqual(sides) && !shorthand.empty()) return expandedTo({{shorthand, sides[0]}});
  Longhands longhands;
  for (size_t at = 0; at < kMaxSides; at += 1) longhands.emplace_back(spec.sides[at], sides[at]);
  return expandedTo(std::move(longhands));
}

ShorthandResult expandBorderRadius(std::string_view text) {
  // RN has no elliptical radius, so only the part before the slash is read
  const size_t slash = text.find('/');
  const Tokens tokens = tokensOf(text.substr(0, slash));
  if (tokens.empty() || tokens.size() > kMaxSides) return invalid();
  const Sides corners = boxSides(tokens);
  if (allEqual(corners)) return expandedTo({{"borderRadius", corners[0]}});
  return expandedTo({
      {"borderTopLeftRadius", corners[0]},
      {"borderTopRightRadius", corners[1]},
      {"borderBottomRightRadius", corners[2]},
      {"borderBottomLeftRadius", corners[3]},
  });
}

ShorthandResult expandGap(const Tokens &tokens) {
  if (tokens.empty() || tokens.size() > 2) return invalid();
  if (tokens.size() == 1) return notShorthand();
  if (tokens[0] == tokens[1]) return expandedTo({{"gap", tokens[0]}});
  return expandedTo({{"rowGap", tokens[0]}, {"columnGap", tokens[1]}});
}

Longhands flexParts(const std::string &grow, const std::string &shrink, const std::string &basis) {
  const bool isOneShrink = std::strtod(shrink.c_str(), nullptr) == 1;
  if (isOneShrink && basis == kZeroPercent) return {{"flex", grow}};
  return {{"flexGrow", grow}, {"flexShrink", shrink}, {"flexBasis", basis}};
}

ShorthandResult expandFlex(const Tokens &tokens) {
  if (tokens.empty() || tokens.size() > 3) return invalid();
  const std::string &first = tokens[0];
  if (tokens.size() == 1) {
    if (first == "none") return expandedTo(flexParts("0", "0", kAuto));
    if (first == kAuto) return expandedTo(flexParts("1", "1", kAuto));
    if (isNumber(first)) return notShorthand();
    return expandedTo(flexParts("1", "1", first));
  }
  if (!isNumber(first)) return invalid();
  if (tokens.size() == 3) return expandedTo(flexParts(first, tokens[1], tokens[2]));
  if (isNumber(tokens[1])) return expandedTo(flexParts(first, tokens[1], kZeroPercent));
  return expandedTo(flexParts(first, "1", tokens[1]));
}

// One value, or two equal ones, becomes the RN key
ShorthandResult expandPair(const char *key, const Tokens &tokens) {
  if (tokens.empty() || tokens.size() > 2) return invalid();
  if (tokens.size() == 1) return notShorthand();
  if (tokens[0] != tokens[1]) return invalid();
  return expandedTo({{key, tokens[0]}});
}

ShorthandResult expandBorderStyle(const Tokens &tokens) {
  if (tokens.empty() || tokens.size() > kMaxSides) return invalid();
  if (tokens.size() == 1) return notShorthand();
  if (!allEqual(boxSides(tokens))) return invalid();
  return expandedTo({{"borderStyle", tokens[0]}});
}

ShorthandResult expandAspectRatio(std::string_view text) {
  const size_t slash = text.find('/');
  if (slash == std::string_view::npos) return notShorthand();
  const Tokens width = tokensOf(text.substr(0, slash));
  const Tokens height = tokensOf(text.substr(slash + 1));
  if (width.size() != 1 || height.size() != 1) return invalid();
  if (!isNumber(width[0]) || !isNumber(height[0])) return invalid();
  const double divisor = std::strtod(height[0].c_str(), nullptr);
  if (divisor == 0) return invalid();
  char buffer[32];
  std::snprintf(
      buffer, sizeof(buffer), "%.*g", static_cast<int>(kRatioDigits), std::strtod(width[0].c_str(), nullptr) / divisor);
  return expandedTo({{"aspectRatio", buffer}});
}

} // namespace

ShorthandResult expandShorthand(std::string_view key, std::string_view text) {
  const auto rect = rects().find(std::string(key));
  if (rect != rects().end()) return expandRect(rect->second, tokensOf(text));
  if (key == "borderRadius") return expandBorderRadius(text);
  if (key == "aspectRatio") return expandAspectRatio(text);
  if (key == "gap") return expandGap(tokensOf(text));
  if (key == "flex") return expandFlex(tokensOf(text));
  if (key == "overflow") return expandPair("overflow", tokensOf(text));
  if (key == "borderStyle") return expandBorderStyle(tokensOf(text));
  return notShorthand();
}

} // namespace symbiote
