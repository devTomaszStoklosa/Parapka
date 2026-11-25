// Checks the web build: the font files are in dist and nothing points to
// Google Fonts (NFR-PRV-04).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));

function list(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? list(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const files = list(dist);
const problems = [];

if (!files.some((file) => file.endsWith(".ttf"))) {
  problems.push("dist has no font files (.ttf)");
}
for (const file of files.filter((f) => /\.(js|html|css|json)$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const host of ["fonts.googleapis.com", "fonts.gstatic.com"]) {
    if (text.includes(host)) problems.push(`${file} mentions ${host}`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Web build checked: ${files.length} files, fonts bundled.`);
