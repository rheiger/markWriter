import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd(),
  index = await fs.readFile(
    path.join(
      process.argv[2] ?? "/Users/rheiger/Dev/markWriter",
      "frontend/index.html",
    ),
    "utf8",
  ),
  csp = index.match(/Content-Security-Policy" content="([^"]+)/)[1];
await fs.writeFile(
  "index.html",
  `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><title>Notation offline spike</title><p>Isolated notation runtime qualification</p><script type="module" src="/browser.js"></script>`,
);
http
  .createServer(async (req, res) => {
    let file = path.resolve(
      root,
      "." + decodeURIComponent(req.url.split("?")[0]),
    );
    if (file === root) file = path.join(root, "index.html");
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    try {
      const data = await fs.readFile(file);
      if (req.url.includes("worker"))
        res.setHeader("Content-Security-Policy", csp);
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".js")
            ? "text/javascript"
            : "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(8106, "127.0.0.1", () => console.log("isolated spike on8106"));
