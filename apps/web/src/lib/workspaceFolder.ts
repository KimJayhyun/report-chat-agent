// File System Access API로 "작업 폴더"에 연결한다. 서버가 아니라 브라우저 탭이
// 직접 로컬 파일시스템에 접근하는 구조라, 백엔드는 이 폴더의 존재 자체를 모른다 —
// showDirectoryPicker() 호출 자체가 브라우저 네이티브 동의 다이얼로그라 별도
// 권한 체계가 필요 없고, 사용자가 취소하면 그냥 AbortError가 난다. 핸들은 세션
// 동안(state)만 들고 있고 새로고침하면 사라짐 — 브라우저 재시작 후 재사용은
// 스코프 밖(IndexedDB에 handle을 저장하고 재확인하는 방식으로 나중에 확장 가능).

const TEXT_FILE_EXTENSIONS = [".txt", ".md"];
// 채팅 메시지에 통째로 실어 보낼 것이므로 한 파일이 너무 크면 컨텍스트를
// 통째로 잡아먹는다 — 사용자가 눈치채기 쉽게 조용히 건너뛴다.
const MAX_TEXT_FILE_BYTES = 200_000;

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** 읽기+쓰기 권한을 한 번에 요청 — 브라우저가 이 시점에 동의 다이얼로그를 띄운다. */
export async function pickWorkspaceFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker({ mode: "readwrite" });
}

export interface WorkspaceTextFile {
  name: string;
  content: string;
}

/** 폴더 최상위의 .txt/.md 파일만 읽는다(하위 폴더 탐색은 스코프 밖). */
export async function readWorkspaceTextFiles(
  dirHandle: FileSystemDirectoryHandle,
): Promise<WorkspaceTextFile[]> {
  const files: WorkspaceTextFile[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== "file") continue;
    if (!TEXT_FILE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))) continue;

    const file = await handle.getFile();
    if (file.size > MAX_TEXT_FILE_BYTES) continue;
    files.push({ name, content: await file.text() });
  }
  return files;
}

/** 결과물(마크다운 초안, 변환된 HWP 등)을 폴더에 직접 생성/덮어쓰기한다. */
export async function writeWorkspaceFile(
  dirHandle: FileSystemDirectoryHandle,
  name: string,
  content: FileSystemWriteChunkType,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
