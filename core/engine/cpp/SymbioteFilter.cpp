#include "SymbioteFilter.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <unordered_set>

#include "SymbioteShadow.h"

namespace symbiote {

namespace {

constexpr const char *kEmptyList = "[]";
constexpr const char *kDropShadowName = "drop-shadow";
constexpr const char *kHueRotateName = "hue-rotate";
constexpr const char *kPixelUnit = "px";
constexpr const char *kPercentUnit = "%";
constexpr double kPi = 3.14159265358979323846;
// A call holds one nested pair of parentheses at most, as RN's pattern allows
constexpr int kMaxCallDepth = 2;

struct FilterCall {
  std::string name;
  std::string args;
};

bool isNameChar(char at) {
  return std::isalnum(static_cast<unsigned char>(at)) != 0 || at == '_' || at == '-';
}

// The index of the `)` closing the `(` at `open`, or npos when it nests too deep or never closes
size_t closingParen(std::string_view text, size_t open) {
  int depth = 0;
  for (size_t at = open; at < text.size(); ++at) {
    if (text[at] == '(') ++depth;
    if (text[at] == ')') --depth;
    if (depth > kMaxCallDepth) return std::string_view::npos;
    if (depth == 0) return at;
  }
  return std::string_view::npos;
}

std::vector<FilterCall> filterCalls(std::string_view text) {
  std::vector<FilterCall> calls;
  size_t at = 0;
  while (at < text.size()) {
    size_t nameEnd = at;
    while (nameEnd < text.size() && isNameChar(text[nameEnd])) ++nameEnd;
    const bool opensCall = nameEnd > at && nameEnd < text.size() && text[nameEnd] == '(';
    const size_t close = opensCall ? closingParen(text, nameEnd) : std::string_view::npos;
    if (close == std::string_view::npos) {
      ++at;
      continue;
    }
    calls.push_back({std::string(text.substr(at, nameEnd - at)),
                     std::string(text.substr(nameEnd + 1, close - nameEnd - 1))});
    at = close + 1;
  }
  return calls;
}

std::string lowered(std::string text) {
  std::transform(text.begin(), text.end(), text.begin(),
                 [](unsigned char at) { return static_cast<char>(std::tolower(at)); });
  return text;
}

// The letters or `%` right after a number, empty when there are none
std::string unitOf(const std::string &rest) {
  size_t end = 0;
  while (end < rest.size() && (std::isalpha(static_cast<unsigned char>(rest[end])) != 0 || rest[end] == '%')) ++end;
  return rest.substr(0, end);
}

std::optional<double> hueRotateAmount(double value, const std::string &unit) {
  if (value == 0) return 0;
  if (unit == "deg") return value;
  if (unit == "rad") return 180 * value / kPi;
  return std::nullopt;
}

// An amount is a non negative number or percentage, `px` being tolerated as RN does
std::optional<double> unitlessAmount(double value, const std::string &unit) {
  if ((!unit.empty() && unit != kPercentUnit && unit != kPixelUnit) || value < 0) return std::nullopt;
  return unit == kPercentUnit ? value / 100 : value;
}

std::optional<double> filterAmount(const std::string &name, const std::string &args) {
  static const std::unordered_set<std::string> kAmountNames = {
      "brightness", "contrast", "grayscale", "invert", "opacity", "saturate", "sepia"};
  const NumberPrefix split = numberPrefix(args);
  const std::optional<double> value = numberOfPrefix(split.digits);
  if (!value.has_value()) return std::nullopt;
  const std::string unit = unitOf(split.rest);
  if (name == "hueRotate") return hueRotateAmount(*value, unit);
  if (name == "blur") {
    if ((!unit.empty() && unit != kPixelUnit) || *value < 0) return std::nullopt;
    return value;
  }
  return kAmountNames.count(name) != 0 ? unitlessAmount(*value, unit) : std::nullopt;
}

// A length of a drop shadow: a number with `px`, a bare zero, or just `px`
std::optional<double> dropShadowLength(const std::string &token) {
  const NumberPrefix split = numberPrefix(token);
  const std::optional<double> value = numberOfPrefix(split.digits);
  if (!value.has_value()) return std::nullopt;
  if (split.rest.empty()) return split.digits == "0" ? value : std::nullopt;
  return split.rest == kPixelUnit ? value : std::nullopt;
}

std::optional<std::string> dropShadowJson(const std::string &args, const ColorParser &parseColor) {
  const std::optional<ShadowTokens> split = splitShadowTokens(args, 3, false, parseColor);
  if (!split.has_value() || split->lengths.size() < 2) return std::nullopt;
  std::vector<std::pair<std::string, std::string>> fields;
  const char *const names[] = {"offsetX", "offsetY", "standardDeviation"};
  for (size_t at = 0; at < split->lengths.size(); ++at) {
    const std::optional<double> length = dropShadowLength(split->lengths[at]);
    if (!length.has_value() || (at == 2 && *length < 0)) return std::nullopt;
    fields.emplace_back(names[at], jsonNumber(*length));
  }
  if (split->color.has_value()) fields.emplace_back("color", std::to_string(*split->color));
  return jsonObject(fields);
}

std::optional<std::string> filterEntry(const FilterCall &call, const ColorParser &parseColor) {
  const std::string name = lowered(call.name);
  if (name == kDropShadowName) {
    const std::optional<std::string> shadow = dropShadowJson(call.args, parseColor);
    if (!shadow.has_value()) return std::nullopt;
    return jsonObject({{"dropShadow", *shadow}});
  }
  const std::string key = name == kHueRotateName ? "hueRotate" : name;
  const std::optional<double> amount = filterAmount(key, call.args);
  if (!amount.has_value()) return std::nullopt;
  return jsonObject({{key, jsonNumber(*amount)}});
}

} // namespace

std::string filterJson(std::string_view text, const ColorParser &parseColor) {
  std::string flat(text);
  std::replace(flat.begin(), flat.end(), '\n', ' ');
  std::vector<std::string> entries;
  for (const FilterCall &call : filterCalls(flat)) {
    const std::optional<std::string> entry = filterEntry(call, parseColor);
    if (!entry.has_value()) return kEmptyList;
    entries.push_back(*entry);
  }
  return jsonArray(entries);
}

} // namespace symbiote
