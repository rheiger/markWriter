#pragma once
#include <cstdint>
#include <string>
#include <string_view>

// Produces inert RTF; source is never interpreted as RTF or HTML.
inline std::string render_markdown(std::string_view input, bool truncated = false) {
  std::string out = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs22 ";
  auto emit = [&](uint32_t c) {
    auto unit = [&](uint16_t u) { out += "\\u" + std::to_string(static_cast<int16_t>(u)) + "?"; };
    if (c == '\n') out += "\\par\n";
    else if (c == '\r') {} // CRLF and CR do not inject RTF controls
    else if (c == '\\' || c == '{' || c == '}') { out += '\\'; out += char(c); }
    else if (c == '\t') out += "\\tab ";
    else if (c >= 32 && c < 127) out += char(c);
    else if (c < 32 || c == 127) out += ' ';
    else if (c <= 0xffff) unit(static_cast<uint16_t>(c));
    else { c -= 0x10000; unit(static_cast<uint16_t>(0xd800 + (c >> 10))); unit(static_cast<uint16_t>(0xdc00 + (c & 1023))); }
  };
  bool line = true, heading = false, bold = false, code = false;
  for (size_t i = 0; i < input.size();) {
    if (line) {
      size_t n = 0; while (n < 6 && i+n < input.size() && input[i+n] == '#') ++n;
      if (n && i+n < input.size() && input[i+n] == ' ') { out += "\\b\\fs" + std::to_string(38 - 2*int(n)) + " "; i += n+1; heading = true; }
      line = false;
    }
    if (i+1 < input.size() && input.substr(i,2) == "**" && !code) { out += bold ? "\\b0 " : "\\b "; bold = !bold; i += 2; continue; }
    if (input[i] == '`') { out += code ? "\\i0 " : "\\i "; code = !code; ++i; continue; }
    unsigned char b = static_cast<unsigned char>(input[i]); uint32_t cp = 0xfffd; size_t count = 1;
    if (b < 0x80) cp = b;
    else {
      size_t n = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0;
      if (n && i+n <= input.size()) {
        uint32_t v = b & ((1u << (7-n))-1); bool valid = true;
        for (size_t j=1; j<n; ++j) { unsigned char x=static_cast<unsigned char>(input[i+j]); if ((x&0xc0)!=0x80) { valid=false; break; } v=(v<<6)|(x&0x3f); }
        if (valid && v >= (n==2?0x80u:n==3?0x800u:0x10000u) && v <= 0x10ffff && !(v>=0xd800 && v<=0xdfff)) { cp=v; count=n; }
      }
    }
    if (cp == '\n') { if (heading) { out += "\\b0\\fs22 "; heading=false; } if (bold) { out += "\\b0 "; bold=false; } if (code) { out += "\\i0 "; code=false; } line=true; }
    emit(cp); i += count;
  }
  if (truncated) out += "\\par\\i Preview truncated at 1 MiB.\\i0 ";
  out += '}'; return out;
}
