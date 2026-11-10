#include "SymbioteStyleText.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstdlib>

namespace symbiote {

namespace {

bool isSplitPoint(char at, bool atComma) {
  return atComma ? at == ',' : std::isspace(static_cast<unsigned char>(at)) != 0;
}

bool isDigit(char at) {
  return std::isdigit(static_cast<unsigned char>(at)) != 0;
}

} // namespace

std::string_view trimmed(std::string_view text) {
  size_t first = 0;
  while (first < text.size() && std::isspace(static_cast<unsigned char>(text[first])) != 0) ++first;
  size_t last = text.size();
  while (last > first && std::isspace(static_cast<unsigned char>(text[last - 1])) != 0) --last;
  return text.substr(first, last - first);
}

std::vector<std::string> splitOutsideParens(std::string_view text, bool atComma) {
  std::vector<std::string> parts;
  std::string current;
  int depth = 0;
  for (size_t at = 0; at < text.size(); ++at) {
    const char letter = text[at];
    if (letter == '(') ++depth;
    if (letter == ')' && depth > 0) --depth;
    if (depth > 0 || !isSplitPoint(letter, atComma)) {
      current += letter;
      continue;
    }
    parts.push_back(current);
    current.clear();
    // A run of whitespace is one separator, a comma is one by itself
    while (!atComma && at + 1 < text.size() && isSplitPoint(text[at + 1], false)) ++at;
  }
  parts.push_back(current);
  return parts;
}

NumberPrefix numberPrefix(std::string_view text) {
  size_t at = 0;
  if (at < text.size() && (text[at] == '+' || text[at] == '-')) ++at;
  while (at < text.size() && isDigit(text[at])) ++at;
  if (at + 1 < text.size() && text[at] == '.' && isDigit(text[at + 1])) {
    at += 2;
    while (at < text.size() && isDigit(text[at])) ++at;
  }
  return NumberPrefix{std::string(text.substr(0, at)), std::string(text.substr(at))};
}

std::optional<double> numberOfPrefix(const std::string &digits) {
  if (digits.empty()) return 0;
  if (!std::any_of(digits.begin(), digits.end(), [](char at) { return isDigit(at); })) {
    return std::nullopt;
  }
  return std::strtod(digits.c_str(), nullptr);
}

std::string jsonNumber(double value) {
  char buffer[40];
  std::snprintf(buffer, sizeof(buffer), "%.17g", value);
  return buffer;
}

std::string jsonText(std::string_view text) {
  std::string out = "\"";
  for (const char letter : text) {
    if (letter == '"' || letter == '\\') out += '\\';
    out += letter;
  }
  return out + "\"";
}

std::string jsonObject(const std::vector<std::pair<std::string, std::string>> &fields) {
  std::string out = "{";
  for (const auto &[name, value] : fields) {
    if (out.size() > 1) out += ",";
    out += jsonText(name) + ":" + value;
  }
  return out + "}";
}

std::string jsonArray(const std::vector<std::string> &items) {
  std::string out = "[";
  for (const std::string &item : items) {
    if (out.size() > 1) out += ",";
    out += item;
  }
  return out + "]";
}

} // namespace symbiote
