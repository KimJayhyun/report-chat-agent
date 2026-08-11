// One-off generator: builds the report-format .hwp templates with @rhwp/core
// and writes them into apps/web/public/templates, so Vite serves them as
// plain static files. Re-run manually whenever a template needs to change.
//
// Usage: node scripts/generate-hwp-templates.mjs   (run from apps/web)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import init, { HwpDocument } from "@rhwp/core";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(dirname, "../node_modules/@rhwp/core/rhwp_bg.wasm");
const outDir = path.join(dirname, "../public/templates");

function buildParagraphs(doc, lines) {
  // insertParagraph(section, N) inserts a blank paragraph AT index N, pushing
  // whatever was there down — it does not append after N. To build lines in
  // reading order we must insert at the current (end-of-document) paragraph
  // count each time, not at `i - 1`.
  lines.forEach((line, i) => {
    if (i > 0) {
      doc.insertParagraph(0, doc.getParagraphCount(0));
    }
    doc.insertText(0, i, 0, line);
  });
}

async function generate(id, title, body) {
  const doc = HwpDocument.createEmpty();
  buildParagraphs(doc, [title, ...body]);
  doc.applyCharFormat(0, 0, 0, title.length, JSON.stringify({ bold: true }));
  doc.applyParaFormat(0, 0, JSON.stringify({ alignment: "center" }));

  const bytes = doc.exportHwp();
  const outPath = path.join(outDir, `${id}.hwp`);
  await writeFile(outPath, bytes);
  console.log(`wrote ${outPath} (${bytes.length} bytes)`);
}

async function main() {
  const wasmBytes = await readFile(wasmPath);
  await init({ module_or_path: wasmBytes });
  await mkdir(outDir, { recursive: true });

  await generate("planning-report", "기획보고서", [
    "",
    "1. 개요",
    "본 보고서는 사업의 목적과 범위를 정의한다.",
    "",
    "2. 추진 배경",
    "관련 현황과 필요성을 기술한다.",
    "",
    "3. 세부 계획",
    "추진 일정과 담당 조직을 명시한다.",
    "",
    "4. 기대 효과",
    "기대되는 성과를 요약한다.",
  ]);

  await generate("press-release", "보도자료", [
    "",
    "행사 개최 안내",
    "핵심 내용을 한두 문장으로 요약한다.",
    "",
    "주요 내용은 다음과 같다.",
    "- 일시 및 장소",
    "- 참석 대상",
    "- 세부 프로그램",
    "",
    "문의: 담당부서 (연락처)",
  ]);
}

main();
