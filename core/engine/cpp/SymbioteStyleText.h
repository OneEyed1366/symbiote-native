#pragma once

#include <functional>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace symbiote {

// A colour token as the platform int RN paints, or nothing when the text is not a colour
using ColorParser = std::function<std::optional<long long>(const std::string &)>;

std::string_view trimmed(std::string_view text);

// Splits at whitespace, or at commas, that sit outside parentheses
// An empty part stays, since `String.split` keeps it and RN's parsers reject it
std::vector<std::string> splitOutsideParens(std::string_view text, bool atComma);

// The `[+-]?\d*(\.\d+)?` prefix a JS regex takes first, and whatever follows it
struct NumberPrefix {
  std::string digits;
  std::string rest;
};
NumberPrefix numberPrefix(std::string_view text);

// `Number(digits)`: an empty prefix is 0 and a lone sign is not a number
std::optional<double> numberOfPrefix(const std::string &digits);

// JSON text for the values the structured parsers emit
std::string jsonNumber(double value);
std::string jsonText(std::string_view text);
std::string jsonObject(const std::vector<std::pair<std::string, std::string>> &fields);
std::string jsonArray(const std::vector<std::string> &items);

} // namespace symbiote
