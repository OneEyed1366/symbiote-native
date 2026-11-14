#include "SymbioteSyntax.h"

#include <algorithm>
#include <unordered_map>

#include "SymbioteSyntaxValue.h"

namespace symbiote {

namespace {

const std::unordered_map<std::string, SyntaxType> &dataTypeNames() {
  static const std::unordered_map<std::string, SyntaxType> names = {
      {"length", SyntaxType::kLength},
      {"number", SyntaxType::kNumber},
      {"percentage", SyntaxType::kPercentage},
      {"length-percentage", SyntaxType::kLengthPercentage},
      {"color", SyntaxType::kColor},
      {"image", SyntaxType::kImage},
      {"url", SyntaxType::kUrl},
      {"integer", SyntaxType::kInteger},
      {"angle", SyntaxType::kAngle},
      {"time", SyntaxType::kTime},
      {"resolution", SyntaxType::kResolution},
      {"transform-function", SyntaxType::kTransformFunction},
      {"transform-list", SyntaxType::kTransformList},
      {"custom-ident", SyntaxType::kCustomIdent},
      {"string", SyntaxType::kString}};
  return names;
}

// The multiplier a term ends with, or nothing when the character is none
std::optional<Multiplier> multiplierOf(char suffix) {
  if (suffix == '+') return Multiplier::kSpaces;
  if (suffix == '#') return Multiplier::kCommas;
  return std::nullopt;
}

std::string trimmedSyntaxText(std::string_view text) {
  return std::string(trimmed(text));
}

// `<name>` with an optional multiplier right after it
std::optional<SyntaxTerm> dataTypeTerm(const std::string &part) {
  const size_t close = part.find('>');
  if (close == std::string::npos) return std::nullopt;
  const auto known = dataTypeNames().find(part.substr(1, close - 1));
  if (known == dataTypeNames().end()) return std::nullopt;
  const std::string rest = part.substr(close + 1);
  if (rest.size() > 1) return std::nullopt;
  if (rest.empty()) return SyntaxTerm{known->second, Multiplier::kNone, ""};
  const std::optional<Multiplier> multiplier = multiplierOf(rest[0]);
  const bool isList = known->second == SyntaxType::kTransformList;
  if (!multiplier.has_value() || isList) return std::nullopt;
  return SyntaxTerm{known->second, *multiplier, ""};
}

// A keyword, decoded, with an optional multiplier
std::optional<SyntaxTerm> identTerm(const std::string &part) {
  std::string name = part;
  Multiplier multiplier = Multiplier::kNone;
  const std::optional<Multiplier> suffix = multiplierOf(name.back());
  if (suffix.has_value()) {
    multiplier = *suffix;
    name.pop_back();
  }
  const std::optional<std::string> decoded = decodedIdent(name);
  if (!decoded.has_value() || isReservedIdent(*decoded)) return std::nullopt;
  return SyntaxTerm{SyntaxType::kIdent, multiplier, *decoded};
}

std::optional<SyntaxTerm> parseTerm(const std::string &part) {
  if (part.empty()) return std::nullopt;
  return part[0] == '<' ? dataTypeTerm(part) : identTerm(part);
}

std::vector<std::string> alternativesOf(const std::string &text) {
  std::vector<std::string> parts;
  size_t from = 0;
  for (size_t at = 0; at <= text.size(); ++at) {
    if (at < text.size() && text[at] != '|') continue;
    parts.push_back(trimmedSyntaxText(std::string_view(text).substr(from, at - from)));
    from = at + 1;
  }
  return parts;
}

bool matchesTerm(
    const SyntaxTerm &term, const std::string &text, ValueContext context, const ColorParser &parseColor) {
  if (term.multiplier == Multiplier::kNone) {
    return term.type == SyntaxType::kIdent ? decodedIdent(text) == term.ident
                                           : matchesDataType(term.type, text, context, parseColor);
  }
  const std::vector<std::string> parts = splitValues(text, term.multiplier == Multiplier::kCommas);
  return std::all_of(parts.begin(), parts.end(), [&](const std::string &part) {
    SyntaxTerm single = term;
    single.multiplier = Multiplier::kNone;
    return matchesTerm(single, std::string(trimmed(part)), context, parseColor);
  });
}

} // namespace

std::optional<Syntax> parseSyntax(std::string_view text) {
  const std::string body = trimmedSyntaxText(text);
  if (body.empty()) return std::nullopt;
  Syntax syntax;
  if (body == "*") {
    syntax.isUniversal = true;
    return syntax;
  }
  for (const std::string &part : alternativesOf(body)) {
    const std::optional<SyntaxTerm> term = parseTerm(part);
    if (!term.has_value()) return std::nullopt;
    syntax.terms.push_back(*term);
  }
  return syntax;
}

bool matchesSyntax(
    const Syntax &syntax, std::string_view value, ValueContext context, const ColorParser &parseColor) {
  const std::string uncommented = withoutComments(value);
  if (syntax.isUniversal) return matchesUniversal(uncommented, context);
  const std::string text(trimmed(uncommented));
  if (text.empty()) return false;
  return std::any_of(syntax.terms.begin(), syntax.terms.end(), [&](const SyntaxTerm &term) {
    return matchesTerm(term, text, context, parseColor);
  });
}

} // namespace symbiote
