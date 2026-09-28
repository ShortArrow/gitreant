// Derive the served icons from the Inkscape master `gitreant.svg`.
//
// The master holds two drawings of the treant on one 512px canvas: the
// full-size layers ("frame", "body", "face", "leaf") and simplified "… mini"
// layers drawn in the central 1/5 box for tab-sized rendering. This script
// splits them into `public/favicon.svg` (mini, cropped) and
// `public/icon.svg` (full), stripped of editor metadata, and rasterizes
// `public/icon-512.png` when Inkscape is available.
//
//   pnpm icon
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const master = path.join(here, "gitreant.svg");
const outDir = path.join(here, "..", "public");
const SIZE = 512;
/** The mini layers live in the central fifth of the canvas. */
const MINI_BOX = { x: SIZE * 0.4, y: SIZE * 0.4, size: SIZE / 5 };

const source = readFileSync(master, "utf8");

/** Top-level `<g>` elements with their text, by walking tag depth. */
function topLevelGroups(svg) {
  const groups = [];
  const tag = /<(\/?)g\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = -1;
  for (let m; (m = tag.exec(svg)); ) {
    const [whole, closing, selfClosing] = m;
    if (closing) {
      depth -= 1;
      if (depth === 0) groups.push(svg.slice(start, m.index + whole.length));
    } else if (selfClosing) {
      if (depth === 0) groups.push(whole);
    } else {
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return groups;
}

const layerLabel = (g) => /inkscape:label="([^"]*)"/.exec(g)?.[1] ?? "";
const defs = /<defs\b[\s\S]*?<\/defs>/.exec(source)?.[0] ?? "";

/** Drop Inkscape/Sodipodi attributes, force layers visible, tidy whitespace. */
function clean(markup) {
  return markup
    .replace(/\s+(inkscape|sodipodi):[\w-]+="[^"]*"/g, "")
    .replace(/display:none/g, "display:inline")
    .replace(/\s+xml:space="preserve"/g, "");
}

function document(viewBox, layers) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n` +
    clean(defs) +
    "\n" +
    layers.map(clean).join("\n") +
    "\n</svg>\n"
  );
}

const layers = topLevelGroups(source).filter((g) => layerLabel(g) !== "");
const mini = layers.filter((g) => layerLabel(g).endsWith(" mini"));
const full = layers.filter((g) => !layerLabel(g).endsWith(" mini"));
if (mini.length === 0 || full.length === 0) {
  throw new Error(`expected both layer sets, found ${layers.map(layerLabel)}`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "favicon.svg"),
  document(`${MINI_BOX.x} ${MINI_BOX.y} ${MINI_BOX.size} ${MINI_BOX.size}`, mini),
);
writeFileSync(path.join(outDir, "icon.svg"), document(`0 0 ${SIZE} ${SIZE}`, full));
console.log(`wrote favicon.svg (${mini.length} layers) and icon.svg (${full.length} layers)`);

// The PNG is for contexts that will not rasterize SVG (app-mode window
// icons, install prompts). Inkscape renders it; without Inkscape the
// committed PNG simply stays as it is.
const inkscape = [
  "inkscape",
  "C:/Program Files/Inkscape/bin/inkscape.exe",
  "/Applications/Inkscape.app/Contents/MacOS/inkscape",
].find((candidate) => {
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
if (inkscape) {
  execFileSync(inkscape, [
    "--export-type=png",
    `--export-width=${SIZE}`,
    `--export-filename=${path.join(outDir, "icon-512.png")}`,
    path.join(outDir, "icon.svg"),
  ]);
  console.log("wrote icon-512.png");
} else if (!existsSync(path.join(outDir, "icon-512.png"))) {
  throw new Error("icon-512.png is missing and Inkscape was not found to render it");
} else {
  console.log("Inkscape not found; icon-512.png left as committed");
}
