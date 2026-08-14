import { HwpDocument } from "@rhwp/core";
import { ensureInit } from "./hwpCoreTemplates";

interface CharSpan {
  start: number;
  end: number;
}

interface ParsedLine {
  text: string;
  heading: number | null;
  boldSpans: CharSpan[];
}

// wasm 바이너리에 박혀 있는 CharShape 기본값(JSON 직렬화 결과)에서 확인한 실제 키.
// applyCharFormat/applyParaFormat 문서가 따로 없어서 rhwp_bg.wasm을 strings로 뒤져서
// 알아낸 값이다 — fontSize는 centipoint 단위(1000 = 10pt).
const HEADING_FONT_SIZE: Record<number, number> = {
  1: 1800,
  2: 1600,
  3: 1400,
  4: 1200,
  5: 1200,
  6: 1200,
};
const BODY_FONT_SIZE = 1000;

// **강조** 구간을 걷어내면서, 걷어낸 뒤(=최종 삽입될) 문자열 기준 [start, end) 오프셋을
// 같이 기록한다. 정규식 replace만 쓰면 치환 후 오프셋이 틀어져서 applyCharFormat에 넘길
// 위치가 어긋나므로 직접 스캔하면서 두 값을 같이 쌓는다.
function extractBoldSpans(text: string): { plain: string; spans: CharSpan[] } {
  const spans: CharSpan[] = [];
  let plain = "";
  let lastIndex = 0;

  const boldPattern = /\*\*(.+?)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = boldPattern.exec(text))) {
    plain += text.slice(lastIndex, match.index);
    const start = plain.length;
    plain += match[1];
    spans.push({ start, end: plain.length });
    lastIndex = match.index + match[0].length;
  }
  plain += text.slice(lastIndex);

  return { plain, spans };
}

function parseLine(rawLine: string): ParsedLine {
  const headingMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    // 헤딩은 통째로 굵게+확대 처리하니 내부 **강조**는 마커만 걷어내고 span은 버린다.
    const { plain } = extractBoldSpans(headingMatch[2]);
    return { text: plain, heading: headingMatch[1].length, boldSpans: [] };
  }

  const listMatch = rawLine.match(/^[-*]\s+(.*)$/);
  if (listMatch) {
    const { plain, spans } = extractBoldSpans(listMatch[1]);
    const prefix = "• ";
    return {
      text: prefix + plain,
      heading: null,
      boldSpans: spans.map((s) => ({
        start: s.start + prefix.length,
        end: s.end + prefix.length,
      })),
    };
  }

  const { plain, spans } = extractBoldSpans(rawLine);
  return { text: plain, heading: null, boldSpans: spans };
}

function buildDocument(doc: HwpDocument, markdown: string) {
  const lines = markdown.split("\n").map(parseLine);

  lines.forEach((line, i) => {
    // insertParagraph(section, N)은 N 위치에 삽입(뒤 내용을 밀어냄)이지 "N 뒤에 추가"가
    // 아니므로, 매번 현재 문단 수를 인덱스로 넘겨야 끝에 순서대로 이어붙는다.
    if (i > 0) {
      doc.insertParagraph(0, doc.getParagraphCount(0));
    }

    if (!line.text) return; // 빈 줄은 문단 자체가 여백 역할이라 텍스트/서식 적용 불필요

    doc.insertText(0, i, 0, line.text);

    if (line.heading) {
      doc.applyCharFormat(
        0,
        i,
        0,
        line.text.length,
        JSON.stringify({ bold: true, fontSize: HEADING_FONT_SIZE[line.heading] }),
      );
      return;
    }

    // insertText는 문서 상태를 스캔해서 시작하는 게 아니라, 직전에 applyCharFormat으로
    // "마지막으로 찍힌" 서식을 그대로 물려받는다 — 즉 어느 문단에서든 한 번 굵게를
    // 적용하고 나면 그 뒤에 새로 삽입되는 모든 문단이 별다른 호출 없이도 계속 굵게로
    // 새어 들어온다(headings/body 상관없이). 그래서 굵게 처리할 구간이 없는 문단도
    // 매번 전체 범위에 기본값을 명시적으로 다시 찍어서 새어 들어온 서식을 끊어줘야 한다.
    doc.applyCharFormat(
      0,
      i,
      0,
      line.text.length,
      JSON.stringify({ bold: false, fontSize: BODY_FONT_SIZE }),
    );
    for (const span of line.boldSpans) {
      doc.applyCharFormat(0, i, span.start, span.end, JSON.stringify({ bold: true }));
    }
  });
}

export async function markdownToHwpBytes(markdown: string): Promise<Uint8Array> {
  await ensureInit();
  const doc = HwpDocument.createEmpty();
  buildDocument(doc, markdown);
  return doc.exportHwp();
}
