import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const out = existsSync("dist/client") ? "dist/client" : "dist";
const shell = join(out, "_shell.html");
const index = join(out, "index.html");
const notFound = join(out, "404.html");

if (!existsSync(index) && existsSync(shell)) {
  copyFileSync(shell, index);
}
if (existsSync(index)) {
  copyFileSync(index, notFound);
  console.log(`[pages-static] ready: ${index} + ${notFound}`);
} else {
  console.error(`[pages-static] missing index.html under ${out}`);
  process.exit(1);
}
