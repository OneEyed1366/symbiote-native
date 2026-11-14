#pragma once

#include <mutex>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace symbiote {

// Which owners read which custom property name, so a write to the `:root` table marks only them
// The owner is an opaque pointer, never dereferenced here: the tree passes its node
class VarReaders {
 public:
  static VarReaders &instance();

  // Replaces everything `owner` read; an empty list forgets it
  void set(void *owner, const std::vector<std::string> &names);
  void forget(void *owner);
  std::vector<void *> readersOf(std::string_view name) const;
  // True while nobody reads any name, which lets the hot paths skip their scans
  bool empty() const;
  void clear();

 private:
  void forgetLocked(void *owner);

  mutable std::mutex mutex_;
  std::unordered_map<std::string, std::unordered_set<void *>> ownersByName_;
  std::unordered_map<void *, std::vector<std::string>> namesByOwner_;
};

} // namespace symbiote
