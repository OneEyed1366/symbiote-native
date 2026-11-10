#include "SymbioteShadow.h"

#include <cmath>

namespace symbiote {

namespace {

constexpr const char *kInsetKeyword = "inset";
constexpr const char *kPixelUnit = "px";
constexpr const char *kEmptyList = "[]";

// A length of a box shadow: a number with `px`, or a bare zero
std::optional<double> shadowLength(const std::string &token) {
  const NumberPrefix split = numberPrefix(token);
  const std::optional<double> value = numberOfPrefix(split.digits);
  const bool hasDigit = split.digits.find_first_of("0123456789") != std::string::npos;
  if (!value.has_value() || !hasDigit) return std::nullopt;
  if (split.rest == kPixelUnit) return value;
  if (split.rest.empty() && *value == 0) return value;
  return std::nullopt;
}

struct ShadowScan {
  ShadowTokens tokens;
  bool keywordAfterLength = false;
};

// A colour or `inset` after the first length bars every later length
bool takeKeyword(ShadowScan &scan, bool alreadySet) {
  if (alreadySet) return false;
  if (!scan.tokens.lengths.empty()) scan.keywordAfterLength = true;
  return true;
}

bool takeLength(ShadowScan &scan, const std::string &token, size_t maxLengths) {
  if (scan.tokens.lengths.size() >= maxLengths) return false;
  if (!scan.tokens.lengths.empty() && scan.keywordAfterLength) return false;
  scan.tokens.lengths.push_back(token);
  return true;
}

std::optional<std::string> boxShadowEntry(std::string_view entry, const ColorParser &parseColor) {
  const std::optional<ShadowTokens> split = splitShadowTokens(entry, 4, true, parseColor);
  if (!split.has_value() || split->lengths.size() < 2) return std::nullopt;
  std::vector<std::pair<std::string, std::string>> fields;
  const char *const names[] = {"offsetX", "offsetY", "blurRadius", "spreadDistance"};
  for (size_t at = 0; at < split->lengths.size(); ++at) {
    const std::optional<double> length = shadowLength(split->lengths[at]);
    if (!length.has_value() || (at == 2 && *length < 0)) return std::nullopt;
    fields.emplace_back(names[at], jsonNumber(*length));
  }
  if (split->color.has_value()) fields.emplace_back("color", std::to_string(*split->color));
  if (split->inset) fields.emplace_back(kInsetKeyword, "true");
  return jsonObject(fields);
}

} // namespace

std::optional<ShadowTokens> splitShadowTokens(
    std::string_view entry, size_t maxLengths, bool allowsInset, const ColorParser &parseColor) {
  ShadowScan scan;
  for (const std::string &token : splitOutsideParens(entry, false)) {
    const std::optional<long long> color = parseColor(token);
    if (color.has_value()) {
      if (!takeKeyword(scan, scan.tokens.color.has_value())) return std::nullopt;
      scan.tokens.color = color;
    } else if (allowsInset && token == kInsetKeyword) {
      if (!takeKeyword(scan, scan.tokens.inset)) return std::nullopt;
      scan.tokens.inset = true;
    } else if (!takeLength(scan, token, maxLengths)) {
      return std::nullopt;
    }
  }
  return scan.tokens;
}

std::string boxShadowJson(std::string_view text, const ColorParser &parseColor) {
  std::vector<std::string> entries;
  for (const std::string &raw : splitOutsideParens(text, true)) {
    const std::string_view entry = trimmed(raw);
    if (entry.empty()) continue;
    const std::optional<std::string> parsed = boxShadowEntry(entry, parseColor);
    if (!parsed.has_value()) return kEmptyList;
    entries.push_back(*parsed);
  }
  return jsonArray(entries);
}

} // namespace symbiote
