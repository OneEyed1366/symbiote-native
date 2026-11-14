#include "SymbioteSyntaxValue.h"

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <unordered_set>

#include "SymbioteSyntaxNumber.h"

namespace symbiote {

namespace {

bool isSpace(char at) {
  return std::isspace(static_cast<unsigned char>(at)) != 0;
}

bool isHexDigit(char at) {
  return std::isxdigit(static_cast<unsigned char>(at)) != 0;
}

uint32_t hexValue(char at) {
  if (std::isdigit(static_cast<unsigned char>(at)) != 0) return static_cast<uint32_t>(at - '0');
  return static_cast<uint32_t>(std::tolower(static_cast<unsigned char>(at)) - 'a' + 10);
}

bool isNameStart(char at) {
  return std::isalpha(static_cast<unsigned char>(at)) != 0 || at == '_' || static_cast<unsigned char>(at) >= 0x80;
}

bool isNameChar(char at) {
  return isNameStart(at) || std::isdigit(static_cast<unsigned char>(at)) != 0 || at == '-';
}

std::string lowered(std::string_view text) {
  std::string out(text);
  std::transform(out.begin(), out.end(), out.begin(),
                 [](unsigned char at) { return static_cast<char>(std::tolower(at)); });
  return out;
}

void appendUtf8(std::string &out, uint32_t point) {
  if (point == 0 || point > 0x10FFFF || (point >= 0xD800 && point <= 0xDFFF)) point = 0xFFFD;
  if (point < 0x80) {
    out += static_cast<char>(point);
  } else if (point < 0x800) {
    out += static_cast<char>(0xC0 | (point >> 6));
    out += static_cast<char>(0x80 | (point & 0x3F));
  } else if (point < 0x10000) {
    out += static_cast<char>(0xE0 | (point >> 12));
    out += static_cast<char>(0x80 | ((point >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (point & 0x3F));
  } else {
    out += static_cast<char>(0xF0 | (point >> 18));
    out += static_cast<char>(0x80 | ((point >> 12) & 0x3F));
    out += static_cast<char>(0x80 | ((point >> 6) & 0x3F));
    out += static_cast<char>(0x80 | (point & 0x3F));
  }
}

// Reads the escape after a backslash at `at`, appends what it stands for and moves `at` past it
bool readEscape(std::string_view text, size_t &at, std::string &out) {
  if (at >= text.size() || text[at] == '\n') return false;
  if (!isHexDigit(text[at])) {
    out += text[at++];
    return true;
  }
  uint32_t point = 0;
  size_t digits = 0;
  for (; digits < 6 && at < text.size() && isHexDigit(text[at]); ++digits, ++at) {
    point = point * 16 + hexValue(text[at]);
  }
  if (at < text.size() && isSpace(text[at])) {
    const bool isCrLf = text[at] == '\r' && at + 1 < text.size() && text[at + 1] == '\n';
    at += isCrLf ? 2 : 1;
  }
  appendUtf8(out, point);
  return true;
}

// Whether an identifier may begin at `at`: a name start, an escape, or a dash followed by one
bool startsIdent(std::string_view text) {
  if (text.empty()) return false;
  const char first = text[0];
  if (isNameStart(first) || first == '\\') return true;
  if (first != '-' || text.size() < 2) return false;
  return isNameStart(text[1]) || text[1] == '-' || text[1] == '\\';
}

bool startsWithWord(std::string_view text, size_t at, std::string_view word) {
  if (at > 0 && isNameChar(text[at - 1])) return false;
  return lowered(text.substr(at, word.size())) == word;
}

// An unquoted `url(` runs to its `)` with no whitespace inside, no quote and no paren
bool skipBareUrl(std::string_view text, size_t &at) {
  size_t cursor = at;
  while (cursor < text.size() && isSpace(text[cursor])) ++cursor;
  while (cursor < text.size() && text[cursor] != ')') {
    const char letter = text[cursor];
    if (letter == '\'' || letter == '"' || letter == '(') return false;
    if (isSpace(letter)) {
      size_t after = cursor;
      while (after < text.size() && isSpace(text[after])) ++after;
      if (after < text.size() && text[after] != ')') return false;
    }
    ++cursor;
  }
  at = cursor;
  return true;
}

// Moves `at` past a quoted string, and says whether it ended on its own line
bool skipString(std::string_view text, size_t &at) {
  const char quote = text[at++];
  while (at < text.size()) {
    const char letter = text[at];
    if (letter == '\n') return false;
    ++at;
    if (letter == '\\' && at < text.size()) ++at;
    else if (letter == quote) return true;
  }
  return true;
}

bool isCloser(char letter) {
  return letter == ')' || letter == ']' || letter == '}';
}

char closerFor(char opener) {
  if (opener == '(') return ')';
  return opener == '[' ? ']' : '}';
}

// Whether the text is a well formed `url(...)` token or function and nothing else
bool isUrlForm(std::string_view text) {
  if (!startsWithWord(text, 0, "url(") || text.back() != ')') return false;
  const std::string_view inner = trimmed(text.substr(4, text.size() - 5));
  if (inner.empty()) return true;
  if (inner[0] == '\'' || inner[0] == '"') {
    size_t at = 0;
    return skipString(inner, at) && at == inner.size() && inner.size() > 1 && inner.back() == inner[0];
  }
  size_t at = 0;
  return skipBareUrl(inner, at) && at == inner.size();
}

// `name(...)` closing at the very end of the text, with something inside
bool isFunctionCall(std::string_view text, std::string_view &name, std::string_view &inner) {
  const size_t open = text.find('(');
  if (open == std::string_view::npos || open == 0 || text.back() != ')') return false;
  name = text.substr(0, open);
  inner = trimmed(text.substr(open + 1, text.size() - open - 2));
  return std::all_of(name.begin(), name.end(), [](char at) { return isNameChar(at); }) && !inner.empty();
}

bool isGradient(std::string_view text) {
  std::string_view name;
  std::string_view inner;
  if (!isFunctionCall(text, name, inner)) return false;
  const std::string lower = lowered(name);
  return lower.size() > 8 && lower.compare(lower.size() - 8, 8, "gradient") == 0;
}

bool isTransformFunction(std::string_view text) {
  static const std::unordered_set<std::string> names = {
      "matrix", "matrix3d", "translate", "translate3d", "translatex", "translatey", "translatez",
      "scale", "scale3d", "scalex", "scaley", "scalez", "rotate", "rotate3d", "rotatex", "rotatey",
      "rotatez", "skew", "skewx", "skewy", "perspective"};
  std::string_view name;
  std::string_view inner;
  return isFunctionCall(text, name, inner) && names.count(lowered(name)) != 0;
}

bool isTransformList(std::string_view text) {
  const std::vector<std::string> parts = splitValues(text, false);
  return !parts.empty() && std::all_of(parts.begin(), parts.end(),
                                       [](const std::string &part) { return isTransformFunction(part); });
}

// Whether a function of the text takes a length that needs a font or line size to be computed
bool holdsRelativeArgument(std::string_view text) {
  for (const std::string &function : splitValues(text, false)) {
    std::string_view name;
    std::string_view inner;
    if (!isFunctionCall(function, name, inner)) continue;
    for (const std::string &argument : splitValues(inner, true)) {
      const std::optional<TypedValue> value = typedValue(trimmed(argument));
      if (value.has_value() && value->isRelative) return true;
    }
  }
  return false;
}

bool isTransformValue(std::string_view text, bool (*matches)(std::string_view), ValueContext context) {
  return matches(text) && !(context == ValueContext::kInitialValue && holdsRelativeArgument(text));
}

// A quoted string, closed or running to the end of the text
bool isStringToken(std::string_view text) {
  if (text.empty() || (text[0] != '\'' && text[0] != '"')) return false;
  size_t at = 0;
  return skipString(text, at) && at == text.size();
}

bool matchesNumeric(SyntaxType type, std::string_view text, ValueContext context) {
  const std::optional<TypedValue> value = typedValue(text);
  if (!value.has_value()) return false;
  if (context == ValueContext::kInitialValue && value->isRelative) return false;
  const Dimension dimension = value->dimension;
  switch (type) {
    case SyntaxType::kNumber:
      return dimension == Dimension::kNumber;
    case SyntaxType::kInteger:
      return dimension == Dimension::kNumber && (!value->isLiteral || value->isInteger);
    case SyntaxType::kLength:
      return dimension == Dimension::kLength || (value->isLiteral && value->isZero && dimension == Dimension::kNumber);
    case SyntaxType::kPercentage:
      return dimension == Dimension::kPercent;
    case SyntaxType::kLengthPercentage:
      return dimension == Dimension::kLength || dimension == Dimension::kPercent ||
          dimension == Dimension::kLengthPercent ||
          (value->isLiteral && value->isZero && dimension == Dimension::kNumber);
    case SyntaxType::kAngle:
      return dimension == Dimension::kAngle;
    case SyntaxType::kTime:
      return dimension == Dimension::kTime;
    case SyntaxType::kResolution:
      return dimension == Dimension::kResolution && !(value->isLiteral && value->isNegative);
    default:
      return false;
  }
}

} // namespace

std::optional<std::string> decodedIdent(std::string_view text) {
  if (!startsIdent(text)) return std::nullopt;
  std::string out;
  size_t at = 0;
  while (at < text.size()) {
    if (text[at] == '\\') {
      ++at;
      if (!readEscape(text, at, out)) return std::nullopt;
      continue;
    }
    if (!isNameChar(text[at])) return std::nullopt;
    out += text[at++];
  }
  return out;
}

bool isReservedIdent(std::string_view decoded) {
  static const std::unordered_set<std::string> reserved = {
      "initial", "inherit", "unset", "revert", "revert-layer", "default"};
  return reserved.count(lowered(decoded)) != 0;
}

std::string withoutComments(std::string_view text) {
  std::string out;
  size_t at = 0;
  while (at < text.size()) {
    if (text[at] == '\'' || text[at] == '"') {
      const size_t from = at;
      skipString(text, at);
      out.append(text.substr(from, at - from));
    } else if (text.compare(at, 2, "/*") == 0) {
      const size_t close = text.find("*/", at + 2);
      at = close == std::string_view::npos ? text.size() : close + 2;
    } else {
      out += text[at++];
    }
  }
  return out;
}

std::vector<std::string> splitValues(std::string_view text, bool atComma) {
  std::vector<std::string> parts;
  std::string current;
  int depth = 0;
  size_t at = 0;
  while (at < text.size()) {
    const char letter = text[at];
    if (letter == '\'' || letter == '"') {
      const size_t from = at;
      skipString(text, at);
      current.append(text.substr(from, at - from));
      continue;
    }
    if (letter == '(' || letter == '[' || letter == '{') ++depth;
    if (isCloser(letter) && depth > 0) --depth;
    const bool isSplit = depth == 0 && (atComma ? letter == ',' : isSpace(letter));
    if (!isSplit) {
      current += letter;
      ++at;
      continue;
    }
    parts.push_back(current);
    current.clear();
    ++at;
    while (!atComma && at < text.size() && isSpace(text[at])) ++at;
  }
  parts.push_back(current);
  return parts;
}

bool matchesDataType(
    SyntaxType type, std::string_view text, ValueContext context, const ColorParser &parseColor) {
  switch (type) {
    case SyntaxType::kColor:
      return !text.empty() && parseColor(std::string(text)).has_value();
    case SyntaxType::kUrl:
      return isUrlForm(text);
    case SyntaxType::kImage:
      return isUrlForm(text) || isGradient(text);
    case SyntaxType::kTransformFunction:
      return isTransformValue(text, isTransformFunction, context);
    case SyntaxType::kTransformList:
      return isTransformValue(text, isTransformList, context);
    case SyntaxType::kString:
      return isStringToken(text);
    case SyntaxType::kCustomIdent: {
      const std::optional<std::string> name = decodedIdent(text);
      return name.has_value() && !isReservedIdent(*name);
    }
    default:
      return matchesNumeric(type, text, context);
  }
}

bool matchesUniversal(std::string_view text, ValueContext context) {
  if (context == ValueContext::kInitialValue) {
    const std::string lower = lowered(text);
    if (lower != "default" && isReservedIdent(lower)) return false;
  }
  std::vector<char> expected;
  size_t at = 0;
  while (at < text.size()) {
    const char letter = text[at];
    if (letter == '\'' || letter == '"') {
      if (!skipString(text, at)) return false;
      continue;
    }
    if (startsWithWord(text, at, "url(")) {
      at += 4;
      size_t cursor = at;
      while (cursor < text.size() && isSpace(text[cursor])) ++cursor;
      const bool isQuoted = cursor < text.size() && (text[cursor] == '\'' || text[cursor] == '"');
      if (isQuoted) {
        expected.push_back(')');
      } else {
        if (!skipBareUrl(text, at)) return false;
        if (at < text.size()) ++at;
      }
      continue;
    }
    if (context == ValueContext::kInitialValue && startsWithWord(text, at, "var(")) return false;
    if (letter == '(' || letter == '[' || letter == '{') {
      expected.push_back(closerFor(letter));
    } else if (isCloser(letter)) {
      if (expected.empty() || expected.back() != letter) return false;
      expected.pop_back();
    } else if ((letter == ';' || letter == '!') && expected.empty()) {
      return false;
    }
    ++at;
  }
  return true;
}

} // namespace symbiote
