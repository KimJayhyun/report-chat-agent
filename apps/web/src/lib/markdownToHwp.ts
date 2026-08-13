import { HwpDocument } from "@rhwp/core";
import { ensureInit } from "./hwpCoreTemplates";

// HwpDocument.insertText는 서식 없는 평문만 받으므로 헤딩/목록/강조 기호만 걷어낸다.
// 표·코드블록 등 나머지 markdown 구조는 표현하지 못함 — "한글로 변환"은 빠른 초안
// 내보내기 용도이지 완전한 markdown → HWP 변환기가 아니다.
function toPlainLines(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1"),
    );
}

function buildParagraphs(doc: HwpDocument, lines: string[]) {
  // insertParagraph(section, N)은 N 위치에 삽입(뒤 내용을 밀어냄)이지 "N 뒤에 추가"가
  // 아니므로, 매번 현재 문단 수를 인덱스로 넘겨야 끝에 순서대로 이어붙는다.
  lines.forEach((line, i) => {
    if (i > 0) {
      doc.insertParagraph(0, doc.getParagraphCount(0));
    }
    doc.insertText(0, i, 0, line);
  });
}

export async function markdownToHwpBytes(markdown: string): Promise<Uint8Array> {
  await ensureInit();
  const doc = HwpDocument.createEmpty();
  buildParagraphs(doc, toPlainLines(markdown));
  return doc.exportHwp();
}
