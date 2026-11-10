#pragma once

#include <functional>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace symbiote {

// A place declarations live in, opaque here: a reference inside a declaration resolves from it
// A null scope stands for the reader, the node whose value is being built
using VarScope = const void *;

// `above` is where the name is read again when `text` is rejected, null when there is no such place
struct VarDeclared {
  std::string text;
  VarScope scope = nullptr;
  VarScope above = nullptr;
};

// The nearest declaration of `--name` seen from `from` upward, `nullopt` when nothing declares it
using VarLookup = std::function<std::optional<VarDeclared>(std::string_view name, VarScope from)>;

// A lookup with no scopes to tell apart: every declaration is seen from the same place
using PlainVarLookup = std::function<std::optional<std::string>(std::string_view name)>;

// Settles a name's substituted text, `nullopt` in being invalid at computed-value time
// A registered property answers its initial value here, so an unregistered name passes through
using VarComputed = std::function<std::optional<std::string>(
    std::string_view name, const std::optional<std::string> &substituted)>;

// Whether a name refuses its substituted text, which then reads again from `VarDeclared::above`
using VarRejects = std::function<bool(
    std::string_view name, const std::optional<std::string> &substituted)>;

// One parsed `var()` call: the name, the fallback text when written, and the index past the `)`
struct VarReference {
  std::string_view name;
  std::optional<std::string_view> fallback;
  size_t end;
};

// Substitutes `var()` against a lookup, `nullopt` being invalid at computed-value time
// Results are memoized: keep one resolver per node and drop it when a declaration changes
class VarResolver {
 public:
  explicit VarResolver(VarLookup lookup, VarComputed computed = {}, VarRejects rejects = {});
  explicit VarResolver(PlainVarLookup lookup, VarComputed computed = {});

  std::optional<std::string> substitute(std::string_view value);

  // The computed value of one custom property, references resolved
  std::optional<std::string> computed(std::string_view name);

 private:
  using Resolved = std::optional<std::string>;

  // `kValidate` checks syntax only, so an unused fallback is still rejected when malformed
  enum class Mode { kResolve, kValidate };

  // A name being resolved on the scope that declares it, which is how a cycle is told from the
  // same name declared again further up
  struct Frame {
    std::string name;
    VarScope scope;
    bool inCycle;
  };

  Resolved substituteAt(std::string_view value, size_t depth, Mode mode, VarScope scope);
  Resolved referenceText(const VarReference &reference, size_t depth, Mode mode, VarScope scope);
  Resolved computedAt(std::string_view name, size_t depth, VarScope from);

  VarLookup lookup_;
  VarComputed computed_;
  VarRejects rejects_;
  std::map<std::pair<VarScope, std::string>, Resolved> done_;
  std::vector<Frame> stack_;
  bool aborted_ = false;
};

} // namespace symbiote
