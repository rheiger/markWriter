#include "render.h"
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <string>
int main() {
  auto r = render_markdown("# Hello\n\n**bold** <script>x</script>\n");
  assert(r.find("\\b\\fs36 Hello") != std::string::npos);
  assert(r.find("<script>x</script>") != std::string::npos);
  assert(r.find("\\b bold\\b0") != std::string::npos);
  assert(render_markdown("{\\}\n").find("\\{\\\\\\}") != std::string::npos);
  assert(render_markdown("Grüße 😀").find("\\u-10179?\\u-8704?") != std::string::npos);
  assert(render_markdown(std::string("\xff",1)).find("\\u-3?") != std::string::npos);
  assert(render_markdown("abc", true).find("Preview truncated") != std::string::npos);
}
