import { Worker } from "node:worker_threads";
import fs from "node:fs";
const w = new Worker(new URL("./dot-worker-node.mjs", import.meta.url));
await new Promise((resolve, reject) => {
  w.once("message", resolve);
  w.once("error", reject);
});
let source = "digraph {";
for (let i = 0; i < 220; i++)
  for (let j = i + 1; j < 220; j++) source += `n${i}->n${j};`;
source += "}";
const start = Date.now();
w.postMessage(source);
await new Promise((r) => setTimeout(r, 50));
const exit = await w.terminate();
const result = {
  sourceBytes: source.length,
  elapsedMs: Date.now() - start,
  terminated: exit === 1,
  inputLimitRejects: Buffer.byteLength(source) > 65536,
};
fs.writeFileSync("cancellation.json", JSON.stringify(result, null, 2));
console.log(result);
