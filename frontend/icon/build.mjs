// Derive the served icons from the Inkscape master `gitreant.svg`.
//
// The master holds the treant on a 512px canvas in the layers "frame",
// "body", "face" and "leaf" (its "… mini" layers, a simplified drawing, are
// kept for reference but not used: the full drawing reads better even at tab
// size). This script writes `public/favicon.svg` and `public/icon.svg`,
// stripped of editor metadata and with a white outline along the diamond
// frame so it stands off dark tab strips, and when Inkscape is available
// rasterizes `public/icon-512.png` and `gitreant.ico` (the Windows
// executable's icon, embedded by build.rs), each frame outlined one pixel
// wide at its own size.
//
//   pnpm icon
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const master = path.join(here, "gitreant.svg");
const outDir = path.join(here, "..", "public");
const SIZE = 512;

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

/**
 * A white band `width` canvas units wide along the inside of the diamond's
 * edge, drawn above every layer. The blue diamond's tips already touch the
 * canvas, so the outline cannot go outside it; inside, it also trims the
 * trunk where the drawing runs up to the frame.
 */
function frameOutline(frame, width) {
  const rect = /<rect\b[^>]*\/>/.exec(frame)?.[0];
  if (!rect) throw new Error("the frame layer holds no <rect>");
  const num = (name) => parseFloat(new RegExp(`\\b${name}="([^"]+)"`).exec(rect)[1]);
  const transform = /transform="([^"]+)"/.exec(rect)?.[1] ?? "";
  const inset = width / 2;
  return (
    `<g><rect x="${num("x") + inset}" y="${num("y") + inset}"` +
    ` width="${num("width") - width}" height="${num("height") - width}"` +
    ` ry="${Math.max(0, num("ry") - inset)}" transform="${transform}"` +
    ` style="fill:none;stroke:#ffffff;stroke-width:${width};stroke-linejoin:round"/></g>`
  );
}

function document(layers, outline) {
  const frame = layers.find((g) => layerLabel(g) === "frame");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">\n` +
    clean(defs) +
    "\n" +
    layers.map(clean).join("\n") +
    "\n" +
    frameOutline(frame, outline) +
    "\n</svg>\n"
  );
}

const layers = topLevelGroups(source).filter((g) => layerLabel(g) !== "");
const full = layers.filter((g) => !layerLabel(g).endsWith(" mini"));
if (!full.some((g) => layerLabel(g) === "frame")) {
  throw new Error(`no "frame" layer among ${layers.map(layerLabel)}`);
}

/** Canvas units per device pixel when the drawing is `pixels` wide. */
const unitsPerPixel = (pixels) => SIZE / pixels;

mkdirSync(outDir, { recursive: true });
// The tab favicon renders at 16px on a 1x display: a one-pixel outline there.
writeFileSync(path.join(outDir, "favicon.svg"), document(full, unitsPerPixel(16)));
// The large icon shows at 128px in the READMEs: one pixel there too.
writeFileSync(path.join(outDir, "icon.svg"), document(full, unitsPerPixel(128)));
console.log(`wrote favicon.svg and icon.svg (${full.length} layers)`);

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

/** Rasterize the drawing `width` pixels wide with a one-pixel outline. */
function render(width) {
  const svg = path.join(here, `.render-${width}.svg`);
  const png = path.join(here, `.render-${width}.png`);
  writeFileSync(svg, document(full, unitsPerPixel(width)));
  execFileSync(inkscape, [
    "--export-type=png",
    `--export-width=${width}`,
    `--export-filename=${png}`,
    svg,
  ]);
  const data = readFileSync(png);
  rmSync(png);
  rmSync(svg);
  return data;
}

/** A Windows .ico holding PNG-compressed frames, one per size Explorer and
 * the taskbar ask for. */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const directory = Buffer.alloc(16 * frames.length);
  let offset = header.length + directory.length;
  frames.forEach(({ size, data }, i) => {
    const entry = directory.subarray(16 * i);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
  });
  return Buffer.concat([header, directory, ...frames.map((f) => f.data)]);
}

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

if (inkscape) {
  writeFileSync(path.join(outDir, "icon-512.png"), render(SIZE));
  console.log("wrote icon-512.png");
  const frames = ICO_SIZES.map((size) => ({ size, data: render(size) }));
  writeFileSync(path.join(here, "gitreant.ico"), ico(frames));
  console.log(`wrote gitreant.ico (${frames.length} frames)`);
} else if (
  !existsSync(path.join(outDir, "icon-512.png")) ||
  !existsSync(path.join(here, "gitreant.ico"))
) {
  throw new Error("the rasterized icons are missing and Inkscape was not found to render them");
} else {
  console.log("Inkscape not found; icon-512.png and gitreant.ico left as committed");
}
