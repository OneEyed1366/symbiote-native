#pragma once

#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>

namespace symbiote {

// The `:root` custom properties of every loaded stylesheet, one table for all surfaces
// It is the last stop of a variable lookup, after the node chain and the surface table
class GlobalVariables {
 public:
  static GlobalVariables &instance();

  void set(std::string name, std::string value);
  void erase(std::string_view name);
  std::optional<std::string> get(std::string_view name) const;
  void clear();

 private:
  // A commit can run off the JS thread, and this table is the one piece of state all trees share
  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::string> values_;
};

} // namespace symbiote
