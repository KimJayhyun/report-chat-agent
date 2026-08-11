// TODO: 서버에서 보고서 유형별 템플릿 목록을 받아오도록 교체 (지금은 두 개 고정).
// 템플릿 파일 자체는 apps/agent/src/agent/templates/*.hwp 에 저장되어 있고,
// apps/web/scripts/generate-hwp-templates.mjs 로 생성함.
import { renderTemplateSvg } from "@/lib/hwpCoreTemplates";

export interface DocFormat {
  id: string;
  name: string;
  description: string;
  renderSvg: () => Promise<string>;
}

export const DOC_FORMATS: DocFormat[] = [
  {
    id: "planning-report",
    name: "기획보고서",
    description: "개요·배경·세부 계획 순으로 구성된 표준 기획보고서 서식",
    renderSvg: () => renderTemplateSvg("planning-report"),
  },
  {
    id: "press-release",
    name: "보도자료",
    description: "헤드라인과 본문, 문의처가 포함된 보도자료 서식",
    renderSvg: () => renderTemplateSvg("press-release"),
  },
];
