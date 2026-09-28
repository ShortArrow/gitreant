// Derive the served icons from the Inkscape master `gitreant.svg`.
//
// The master carries three drawings of the treant, each a top-level layer
// with "frame", "body", "face" and "leaf" sublayers, drawn for the size it
// is meant for: "512px main" (the full drawing, 128px and up), "64px faceup"
// (a bigger face, 24-64px) and "16px outline" (a white line glyph with its
// own white edge, 16-20px). This script writes the served SVGs and PNGs
// stripped of editor metadata, gives the main and faceup frames a white
// outline one pixel wide at the target size, and when Inkscape is available
// rasterizes the PNGs and `gitreant.ico` (the Windows executable's icon,
// embedded by build.rs).
//
//   pnpm icon
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const master = path.join(here, "gitreant.svg");
const outDir = path.join(here, "..", "public");
const SIZE = 512;

/** Where each drawing sits on the master canvas (Inkscape user units). */
const VARIANTS = {
  main: { label: "512px main", viewBox: [0, 0, 512, 512], outlined: true },
  faceup: { label: "64px faceup", viewBox: [204.8, 204.8, 102.4, 102.4], outlined: true },
  outline16: { label: "16px outline", viewBox: [248.32, 248.32, 15.36, 15.36], outlined: false },
};

/** Which drawing a rendition `pixels` wide uses. */
function variantFor(pixels) {
  if (pixels <= 20) return VARIANTS.outline16;
  if (pixels <= 64) return VARIANTS.faceup;
  return VARIANTS.main;
}

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
const layers = topLevelGroups(source).filter((g) => layerLabel(g) !== "");
for (const variant of Object.values(VARIANTS)) {
  variant.markup = layers.find((g) => layerLabel(g) === variant.label);
  if (!variant.markup) {
    throw new Error(`no "${variant.label}" layer among ${layers.map(layerLabel)}`);
  }
}

/** Drop Inkscape/Sodipodi attributes, force layers visible, tidy whitespace. */
function clean(markup) {
  return markup
    .replace(/\s+(inkscape|sodipodi):[\w-]+="[^"]*"/g, "")
    .replace(/display:none/g, "display:inline")
    .replace(/\s+xml:space="preserve"/g, "");
}

/** Canvas units per device pixel when `viewBox` renders `pixels` wide. */
const unitsPerPixel = (variant, pixels) => variant.viewBox[2] / pixels;

/**
 * A white band `width` canvas units wide along the inside of the diamond's
 * edge, drawn above every layer. The diamond's tips touch the drawing's
 * edge, so the outline cannot go outside it; inside, it also trims the
 * trunk where the drawing runs up to the frame. The band repeats the frame
 * sublayer's transform so it lands where the frame does.
 */
function frameOutline(variant, width) {
  const frame = /<g\b[^>]*inkscape:label="frame"[^>]*>[\s\S]*?<\/g>/.exec(variant.markup)?.[0];
  const rect = frame && /<rect\b[^>]*\/>/.exec(frame)?.[0];
  if (!rect) throw new Error(`"${variant.label}" has no frame rect`);
  const num = (name) => parseFloat(new RegExp(`\\b${name}="([^"]+)"`).exec(rect)[1]);
  const own = /transform="([^"]+)"/.exec(rect)?.[1] ?? "";
  const layer = /<g\b[^>]*transform="([^"]+)"/.exec(frame)?.[1] ?? "";
  const inset = width / 2;
  return (
    `<g transform="${layer}"><rect x="${num("x") + inset}" y="${num("y") + inset}"` +
    ` width="${num("width") - width}" height="${num("height") - width}"` +
    ` ry="${Math.max(0, num("ry") - inset)}" transform="${own}"` +
    ` style="fill:none;stroke:#ffffff;stroke-width:${width};stroke-linejoin:round"/></g>`
  );
}

/** The SVG document of `variant` prepared for a rendition `pixels` wide. */
function document(variant, pixels) {
  const outline = variant.outlined ? frameOutline(variant, unitsPerPixel(variant, pixels)) : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${variant.viewBox.join(" ")}">\n` +
    clean(defs) +
    "\n" +
    clean(variant.markup) +
    "\n" +
    outline +
    "\n</svg>\n"
  );
}

mkdirSync(outDir, { recursive: true });
// Browsers take the SVG for any size it has no bitmap for; the tab itself
// gets the 16px and 32px bitmaps below. The README shows icon.svg at 128px.
writeFileSync(path.join(outDir, "favicon.svg"), document(VARIANTS.faceup, 32));
writeFileSync(path.join(outDir, "icon.svg"), document(VARIANTS.main, 128));
console.log("wrote favicon.svg (faceup) and icon.svg (main)");

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

/** Rasterize the drawing meant for `width` pixels, `width` pixels wide. */
function render(width) {
  const svg = path.join(here, `.render-${width}.svg`);
  const png = path.join(here, `.render-${width}.png`);
  writeFileSync(svg, document(variantFor(width), width));
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

const PNG_SIZES = [16, 32, 512];
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const rasters = PNG_SIZES.map((size) => path.join(outDir, `icon-${size}.png`));

if (inkscape) {
  for (const size of PNG_SIZES) {
    writeFileSync(path.join(outDir, `icon-${size}.png`), render(size));
  }
  console.log(`wrote ${PNG_SIZES.map((s) => `icon-${s}.png`).join(", ")}`);
  const frames = ICO_SIZES.map((size) => ({ size, data: render(size) }));
  writeFileSync(path.join(here, "gitreant.ico"), ico(frames));
  console.log(`wrote gitreant.ico (${frames.length} frames)`);
} else if (
  rasters.some((file) => !existsSync(file)) ||
  !existsSync(path.join(here, "gitreant.ico"))
) {
  throw new Error("the rasterized icons are missing and Inkscape was not found to render them");
} else {
  console.log("Inkscape not found; the PNGs and gitreant.ico are left as committed");
}
