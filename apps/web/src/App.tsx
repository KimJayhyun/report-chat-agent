import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  Columns2,
  Cpu,
  ExternalLink,
  FileText,
  FolderCheck,
  FolderOpen,
  History,
  LayoutTemplate,
  Loader2,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  LITELLM_UI_URL,
  SendMessageStreamError,
  getSession,
  listModels,
  listSessions,
  sendMessageStream,
  type SessionSummary,
} from "@/lib/a2aClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HwpEditor, type HwpEditorHandle } from "@/components/HwpEditor";
import { TemplateThumbnail } from "@/components/TemplateThumbnail";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { DOC_FORMATS, type DocFormat } from "@/lib/docFormats";
import { markdownToHwpBytes } from "@/lib/markdownToHwp";
import { cn } from "@/lib/utils";
import {
  isFileSystemAccessSupported,
  pickWorkspaceFolder,
  readWorkspaceTextFiles,
  writeWorkspaceFile,
} from "@/lib/workspaceFolder";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

const SUGGESTIONS = [
  { tag: "기획보고서", desc: "주제와 목적을 입력해 기획보고서 초안을 시작합니다." },
  { tag: "보도자료", desc: "발표할 핵심 내용을 입력해 보도자료 서식으로 시작합니다." },
  { tag: "근거자료로 작성", desc: "정부 보도자료를 찾아 근거를 확인한 뒤 작성합니다." },
  { tag: "조직도 만들기", desc: "인공지능정부실 현행 조직도를 만들고 편집합니다." },
];

type ViewMode = "split" | "chat" | "editor";
type RightTab = "draft" | "editor";

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [docFormat, setDocFormat] = useState<DocFormat | null>(null);
  const [formatPickerOpen, setFormatPickerOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("draft");
  const [documentDraft, setDocumentDraft] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  // 작업 폴더 핸들은 새로고침하면 사라짐(세션 동안만 유지하기로 결정) — 로컬
  // 파일시스템 접근이라 서버는 이 상태를 전혀 모른다.
  const [workspaceDir, setWorkspaceDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  // 실제로 읽히는 파일이 뭔지 눈으로 확인할 수 있게, 연결/전송/새로고침 시점마다
  // 스캔한 이름 목록을 따로 들고 있음(내용까지 state에 안 두는 이유: 화면엔 이름만
  // 필요하고, 전송 시 필요한 내용은 handleSend에서 그때그때 다시 읽음).
  const [workspaceFileNames, setWorkspaceFileNames] = useState<string[] | null>(null);
  const [isLoadingWorkspaceFiles, setIsLoadingWorkspaceFiles] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hwpEditorRef = useRef<HwpEditorHandle>(null);
  // write_document 청크는 매 호출마다 문서 "전체"를 다시 스트리밍하므로, 이번 턴에서
  // 첫 청크가 오면 이전 초안을 이어붙이지 않고 새로 시작해야 함.
  const documentStartedRef = useRef(false);
  // 백엔드 thread_id로 그대로 쓰이는 A2A context_id — 첫 턴은 없으니 서버가 새로
  // 발급하고, 이후 턴부터는 이걸 그대로 실어 보내야 같은 대화(멀티턴)로 이어짐.
  const contextIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // 모델 목록은 litellm-config.yaml이 유일한 출처라 여기선 하드코딩하지 않고
    // agent를 통해 조회한다. 실패해도(예: litellm이 아직 안 떠 있음) 앱 자체는
    // 계속 쓸 수 있어야 하니 조용히 무시 — 이 경우 서버 기본 모델로 동작한다.
    listModels()
      .then((fetched) => {
        setModels(fetched);
        setSelectedModel((prev) => prev ?? fetched[0]);
      })
      .catch(() => {});
  }, []);

  const handleSend = async (text = input) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    // 빈 agent 버블을 바로 붙여두고, 청크가 올 때마다 그 버블의 텍스트만 이어붙인다.
    setMessages((prev) => [...prev, { role: "user", text: trimmed }, { role: "agent", text: "" }]);
    setInput("");
    setIsSending(true);
    documentStartedRef.current = false;

    // 작업 폴더가 연결돼 있으면 최상위 .txt/.md 파일 내용을 참고자료로 붙여서 보낸다.
    // 화면에는 원래 사용자 메시지(trimmed)만 보이고, 백엔드로 보내는 텍스트에만 실림 —
    // A2A 프로토콜/백엔드 변경 없이 텍스트에 얹는 방식이라 별도 FilePart 확장이 필요 없음.
    let sendText = trimmed;
    if (workspaceDir) {
      try {
        const files = await readWorkspaceTextFiles(workspaceDir);
        setWorkspaceFileNames(files.map((f) => f.name));
        if (files.length > 0) {
          const context = files
            .map((f) => `### ${f.name}\n${f.content}`)
            .join("\n\n---\n\n");
          sendText = `다음은 작업 폴더에 있는 참고 파일입니다. 필요하면 활용하세요.\n\n${context}\n\n---\n\n${trimmed}`;
        }
      } catch (err) {
        setWorkspaceError(err instanceof Error ? err.message : String(err));
      }
    }

    const appendToLastMessage = (chunk: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, text: last.text + chunk };
        return next;
      });
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    };

    // setDocumentDraft만으로는 비동기 상태 업데이트라 이 함수 스코프에서 "지금까지
    // 쌓인 최종 텍스트"를 바로 읽을 수 없어서, 폴더에 저장할 때 쓰려고 별도로 들고 있음.
    let latestDocumentText = "";
    const appendToDocument = (chunk: string) => {
      latestDocumentText = documentStartedRef.current ? latestDocumentText + chunk : chunk;
      setDocumentDraft(latestDocumentText);
      documentStartedRef.current = true;
      setRightTab("draft");
    };

    try {
      contextIdRef.current = await sendMessageStream(sendText, {
        onChunk: appendToLastMessage,
        onDocumentChunk: appendToDocument,
        contextId: contextIdRef.current,
        model: selectedModel,
      });

      // 문서 초안이 갱신됐으면 폴더에도 바로 반영 — 매번 다운로드 버튼을 누를 필요 없음.
      if (workspaceDir && documentStartedRef.current && latestDocumentText.trim()) {
        try {
          await writeWorkspaceFile(workspaceDir, "문서초안.md", latestDocumentText);
        } catch (err) {
          setWorkspaceError(err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      // 스트림이 도중에 끊겨도 서버가 이미 발급한 contextId는 살려서 이어감 —
      // 안 그러면 다음 메시지가 (실패한 턴과) 다른 새 대화로 갈라짐.
      if (err instanceof SendMessageStreamError && err.contextId) {
        contextIdRef.current = err.contextId;
      }
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "agent", text: `Error: ${message}` };
        return next;
      });
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  };

  const handleNewConversation = () => {
    // 스트리밍 도중이면 이전 handleSend의 콜백(appendToLastMessage 등)이 그 클로저에
    // 잡아둔 옛 state 그대로 계속 돌다가, 방금 비운 messages/documentDraft에 뒤늦게
    // 써버릴 수 있어서(취소 수단이 없음) 진행 중엔 막는다 — 버튼도 같이 disabled 처리.
    if (isSending) return;

    setMessages([]);
    setInput("");
    setDocumentDraft("");
    setDocFormat(null);
    setConvertError(null);
    setRightTab("draft");
    // undefined로 돌리면 다음 sendMessageStream 호출에 contextId를 안 실어 보내서
    // 서버가 새 context_id를 발급함 — 즉 새 대화(스레드)로 시작됨.
    contextIdRef.current = undefined;
    documentStartedRef.current = false;
  };

  const handlePickWorkspace = async () => {
    try {
      const handle = await pickWorkspaceFolder();
      setWorkspaceDir(handle);
      setWorkspaceError(null);
      // 연결 직후 바로 스캔해서 보여줘야 "진짜로 이 폴더를 보고 있다"를 확인할 수 있음.
      await scanWorkspaceFiles(handle);
    } catch (err) {
      // 사용자가 폴더 선택 다이얼로그를 취소한 경우 — 에러로 취급하지 않는다.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setWorkspaceError(err instanceof Error ? err.message : String(err));
    }
  };

  const scanWorkspaceFiles = async (handle: FileSystemDirectoryHandle) => {
    setIsLoadingWorkspaceFiles(true);
    try {
      const files = await readWorkspaceTextFiles(handle);
      setWorkspaceFileNames(files.map((f) => f.name));
      setWorkspaceError(null);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingWorkspaceFiles(false);
    }
  };

  const handleClearWorkspace = () => {
    setWorkspaceDir(null);
    setWorkspaceFileNames(null);
    setWorkspaceError(null);
  };

  const handleOpenSessions = () => {
    setSessionsOpen(true);
    setIsLoadingSessions(true);
    setSessionsError(null);
    // 목록은 대화가 바뀔 때마다 달라지니 열 때마다 새로 조회한다(캐시 없음).
    listSessions()
      .then(setSessions)
      .catch((err) => setSessionsError(err instanceof Error ? err.message : String(err)))
      .finally(() => setIsLoadingSessions(false));
  };

  const handleResumeSession = async (contextId: string) => {
    if (isSending) return;
    try {
      const session = await getSession(contextId);
      setMessages(session.messages);
      setDocumentDraft(session.document_draft ?? "");
      setDocFormat(null);
      setConvertError(null);
      setRightTab("draft");
      contextIdRef.current = session.context_id;
      documentStartedRef.current = false;
      setSessionsOpen(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }));
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConvertToHwp = async () => {
    if (!documentDraft.trim() || isConverting) return;
    setIsConverting(true);
    setConvertError(null);
    try {
      const bytes = await markdownToHwpBytes(documentDraft);
      await hwpEditorRef.current?.loadFile(bytes, "문서초안.hwp");
      setRightTab("editor");

      if (workspaceDir) {
        try {
          // Uint8Array<ArrayBufferLike>는 BlobPart로 바로 안 들어가서(TS가 SharedArrayBuffer
          // 가능성을 배제 못 함) ArrayBuffer로 못박은 새 사본을 만들어 넘긴다.
          await writeWorkspaceFile(workspaceDir, "문서초안.hwp", new Blob([new Uint8Array(bytes)]));
        } catch (err) {
          setWorkspaceError(err instanceof Error ? err.message : String(err));
        }
      }
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConverting(false);
    }
  };

  const chatPanel = (
    <div
      className={cn(
        "flex h-full w-full flex-col",
        viewMode === "chat" && "mx-auto max-w-2xl",
      )}
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            AI Work
          </div>
          <p className="text-xs text-muted-foreground">
            공공보고서 작업공간 with report-chat-agent
          </p>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <Settings className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setFormatPickerOpen(true)}>
                <LayoutTemplate className="size-3.5" />
                {docFormat ? docFormat.name : "문서서식 선택"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleNewConversation}
          disabled={isSending}
        >
          <Plus className="size-3" />
          새 보고서 작업
        </Button>

        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleOpenSessions}>
          <History className="size-3" />
          이전 대화
        </Button>

        {isFileSystemAccessSupported() &&
          (workspaceDir ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 items-center gap-1 rounded-full border bg-muted/50 px-2 text-xs hover:bg-muted"
                >
                  <FolderCheck className="size-3 text-primary" />
                  <span className="max-w-28 truncate" title={workspaceDir.name}>
                    {workspaceDir.name}
                  </span>
                  <span className="text-muted-foreground">
                    ({isLoadingWorkspaceFiles ? "…" : (workspaceFileNames?.length ?? 0)})
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  인식된 참고 파일 (최상위 .txt/.md)
                </div>
                {isLoadingWorkspaceFiles ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    불러오는 중...
                  </div>
                ) : workspaceFileNames && workspaceFileNames.length > 0 ? (
                  workspaceFileNames.map((name) => (
                    <div key={name} className="flex items-center gap-1.5 px-2 py-1 text-xs">
                      <FileText className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))
                ) : (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    최상위에 .txt/.md 파일이 없습니다.
                  </p>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => scanWorkspaceFiles(workspaceDir)}>
                  <RefreshCw className="size-3.5" />
                  새로고침
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleClearWorkspace} variant="destructive">
                  <X className="size-3.5" />
                  연결 해제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handlePickWorkspace}
              title="폴더를 선택하면 참고자료를 읽고 결과물을 그 폴더에 저장합니다"
            >
              <FolderOpen className="size-3" />
              작업 폴더 연결
            </Button>
          ))}

        <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>이전 대화</DialogTitle>
            </DialogHeader>
            {isLoadingSessions ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                불러오는 중...
              </div>
            ) : sessionsError ? (
              <p className="py-6 text-center text-sm text-destructive">{sessionsError}</p>
            ) : sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                아직 저장된 대화가 없습니다.
              </p>
            ) : (
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {sessions.map((session) => (
                  <button
                    key={session.context_id}
                    type="button"
                    onClick={() => handleResumeSession(session.context_id)}
                    className="flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors hover:bg-muted"
                  >
                    <p className="text-sm font-medium">{session.title}</p>
                    {session.updated_at && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.updated_at).toLocaleString("ko-KR")}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={formatPickerOpen} onOpenChange={setFormatPickerOpen}>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>문서서식 선택</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              {DOC_FORMATS.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => {
                    setDocFormat(format);
                    setFormatPickerOpen(false);
                  }}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-colors hover:bg-muted",
                    docFormat?.id === format.id ? "border-primary bg-muted" : "border-transparent",
                  )}
                >
                  <div className="aspect-[793.7/471.45] w-full overflow-hidden rounded-lg border shadow-sm">
                    <TemplateThumbnail id={format.id} render={format.renderSvg} className="h-full w-full" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{format.name}</p>
                    <p className="text-xs text-muted-foreground">{format.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {workspaceError && (
        <p className="border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive">
          작업 폴더 오류: {workspaceError}
        </p>
      )}

      <ScrollArea className="flex-1">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 px-6 py-10 text-center">
            <div>
              <h2 className="text-base font-semibold">오른쪽 한글 문서에 무엇을 작성할까요?</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                대화로 초안을 만들면 오른쪽에 실시간으로 표시됩니다.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.tag}
                  type="button"
                  onClick={() => setInput(s.desc)}
                  className="rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Badge variant="secondary" className="mb-1">
                    {s.tag}
                  </Badge>
                  <p className="text-muted-foreground">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4">
            {messages.map((message, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-end gap-2",
                  message.role === "user" && "flex-row-reverse",
                )}
              >
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback>{message.role === "user" ? "Y" : "A"}</AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "prose prose-sm max-w-none break-words text-inherit",
                      "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-1.5",
                      "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                      // typography 플러그인은 :where() 기반이라 개별 prose-*:text-inherit로
                      // 색을 덮으려 하면 우선순위 다툼에서 밀릴 수 있음 — 모든 자손에
                      // color:inherit을 강제해서 항상 버블의 전경색을 따라가게 함.
                      "[&_*]:text-inherit",
                    )}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {message.text}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {messages.length > 0 && (
        <div className="flex justify-center border-t py-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 rounded-full text-xs"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            <ArrowDown className="size-3" />
            새 답변 보기
          </Button>
        </div>
      )}

      <div className="border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 한글 등 IME 조합 중에 Enter를 누르면 마지막 글자 커밋과 전송이
            // 동시에 발생해 입력창에 글자가 남는 문제가 있어 조합 중엔 무시.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="보고서 주제를 입력하면 바로 초안을 작성합니다"
          className="min-h-16 resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between pt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={models.length === 0}>
                <Cpu className="size-3" />
                {selectedModel ?? "모델 선택"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuRadioGroup value={selectedModel} onValueChange={setSelectedModel}>
                {models.map((model) => (
                  <DropdownMenuRadioItem key={model} value={model} className="whitespace-nowrap">
                    {model}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.open(LITELLM_UI_URL, "_blank")}>
                <ExternalLink className="size-3.5" />
                LiteLLM에서 모델 관리
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="icon" className="size-8" onClick={() => handleSend()} disabled={isSending}>
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const draftPanel = (
    <div className={cn("flex h-full w-full flex-col", rightTab !== "draft" && "hidden")}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4 text-muted-foreground" />
          문서 초안
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={handleConvertToHwp}
          disabled={!documentDraft.trim() || isConverting}
        >
          {isConverting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Wand2 className="size-3.5" />
          )}
          한글로 변환
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {documentDraft ? (
          <div className="prose prose-sm max-w-none p-4 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-1.5">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {documentDraft}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            대화에서 문서 작성을 요청하면 여기에 초안이 실시간으로 표시됩니다.
          </div>
        )}
      </ScrollArea>
      {convertError && (
        <p className="border-t px-4 py-2 text-xs text-destructive">{convertError}</p>
      )}
    </div>
  );

  const hwpPanel = (
    <div className={cn("flex h-full w-full flex-col", rightTab !== "editor" && "hidden")}>
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
        <NotebookPen className="size-4 text-muted-foreground" />
        한글 편집기
      </div>
      <div className="flex-1 overflow-hidden">
        <HwpEditor ref={hwpEditorRef} className="h-full w-full" />
      </div>
    </div>
  );

  const rightPanel = (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-1 border-b bg-muted/30 px-2 py-1">
        <Button
          variant={rightTab === "draft" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setRightTab("draft")}
        >
          <FileText className="size-3.5" />
          문서 초안
        </Button>
        <Button
          variant={rightTab === "editor" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setRightTab("editor")}
        >
          <NotebookPen className="size-3.5" />
          한글 편집기
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        {draftPanel}
        {hwpPanel}
      </div>
    </div>
  );

  return (
    <div className="flex h-svh w-full flex-col">
      {/* Always-visible toggle bar — stays mounted even when a panel is hidden,
          so there's always an explicit, visible way back to split view. */}
      <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b bg-muted/30 px-2">
        <Button
          variant={viewMode === "split" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setViewMode("split")}
        >
          <Columns2 className="size-3.5" />
          분할 보기
        </Button>
        <Button
          variant={viewMode === "chat" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setViewMode("chat")}
        >
          <PanelLeft className="size-3.5" />
          대화 창만
        </Button>
        <Button
          variant={viewMode === "editor" ? "secondary" : "ghost"}
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setViewMode("editor")}
        >
          <PanelRight className="size-3.5" />
          문서만
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {viewMode === "split" && (
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel
              id="chat"
              defaultSize={600}
              minSize={360}
              maxSize={900}
              className="border-r"
            >
              {chatPanel}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="editor">{rightPanel}</ResizablePanel>
          </ResizablePanelGroup>
        )}
        {viewMode === "chat" && <div className="h-full w-full">{chatPanel}</div>}
        {viewMode === "editor" && (
          <div className="h-full w-full">{rightPanel}</div>
        )}
      </div>
    </div>
  );
}

export default App;
