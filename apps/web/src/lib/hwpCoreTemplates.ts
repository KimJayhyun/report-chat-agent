import init, { HwpDocument } from "@rhwp/core";
import wasmUrl from "@rhwp/core/rhwp_bg.wasm?url";

declare global {
  // eslint-disable-next-line no-var
  var measureTextWidth: (font: string, text: string) => number;
}

let measureCtx: CanvasRenderingContext2D | null = null;

// @rhwp/core calls back into this global to measure glyph widths for layout
// (it can't measure fonts itself from Rust/WASM). Without it defined, the
// WASM side falls back to an approximate width, which made characters
// overlap instead of being missing.
globalThis.measureTextWidth = (font, text) => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 10;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
};

let initPromise: Promise<void> | null = null;

function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = init({ module_or_path: wasmUrl }).then(() => undefined);
  }
  return initPromise;
}

/**
 * A full rendered page is a whole A4 sheet, but our short templates only use
 * the top ~35% of it — shrunk to thumbnail size that reads as a blank white
 * box. Crop the root <svg> to just the top slice so the actual text is
 * visible. Shrinking width/height + viewBox together relies on the root
 * <svg> clipping overflow by default, so this doesn't need to touch any of
 * the drawn content.
 */
function cropToTop(svg: string, fraction: number): string {
  const widthMatch = svg.match(/width="([0-9.]+)"/);
  const heightMatch = svg.match(/height="([0-9.]+)"/);
  if (!widthMatch || !heightMatch) return svg;

  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  const croppedHeight = height * fraction;

  return svg
    .replace(/height="[0-9.]+"/, `height="${croppedHeight}"`)
    .replace(/viewBox="0 0 [0-9.]+ [0-9.]+"/, `viewBox="0 0 ${width} ${croppedHeight}"`);
}

/**
 * Renders the top portion of page 0 of a report-format template as SVG,
 * cropped to just the content area (see `cropToTop`).
 *
 * The template bytes are fetched from apps/web/public/templates/ (generated
 * by apps/web/scripts/generate-hwp-templates.mjs) rather than built in the
 * browser on every render.
 */
export async function renderTemplateSvg(templateId: string): Promise<string> {
  const [, res] = await Promise.all([
    ensureInit(),
    fetch(`/templates/${templateId}.hwp`),
  ]);

  if (!res.ok) {
    throw new Error(`Failed to fetch template "${templateId}": ${res.status}`);
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  const doc = new HwpDocument(bytes);
  return cropToTop(doc.renderPageSvg(0), 0.42);
}
