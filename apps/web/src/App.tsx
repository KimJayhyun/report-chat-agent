import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Cpu,
  FileText,
  LayoutTemplate,
  Loader2,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Paperclip,
  Send,
  Settings,
  Settings2,
  Sparkles,
  Wand2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { SendMessageStreamError, listModels, sendMessageStream } from "@/lib/a2aClient";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

const SUGGESTIONS = [
  { tag: "기획보고서", desc: "주제와 목적을 입력해 기획보고서 초안을 시작합니다." },
  { tag: "보도자료", desc: "발표할 핵심 내용을 입력해 보도자료 서식으로 시작합니다." },
  { tag: "근거자료로 작성", desc: "정부 보도자료를 찾아 근거를 확인한 뒤 작성합니다." },
  { tag: "조직도 만들기", desc: "인공지능정부실 현행 조직도를 만들고 편집합니다." },
  { tag: "HWPX", desc: "기존 한글 문서를 열어 이어서 작성합니다." },
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

    const appendToLastMessage = (chunk: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, text: last.text + chunk };
        return next;
      });
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    };

    const appendToDocument = (chunk: string) => {
      setDocumentDraft((prev) => (documentStartedRef.current ? prev + chunk : chunk));
      documentStartedRef.current = true;
      setRightTab("draft");
    };

    try {
      contextIdRef.current = await sendMessageStream(trimmed, {
        onChunk: appendToLastMessage,
        onDocumentChunk: appendToDocument,
        contextId: contextIdRef.current,
        model: selectedModel,
      });
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

  const handleConvertToHwp = async () => {
    if (!documentDraft.trim() || isConverting) return;
    setIsConverting(true);
    setConvertError(null);
    try {
      const bytes = await markdownToHwpBytes(documentDraft);
      await hwpEditorRef.current?.loadFile(bytes, "문서초안.hwp");
      setRightTab("editor");
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
          <Button variant="ghost" size="icon" className="size-7">
            <Settings className="size-4" />
          </Button>
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
          <ChevronLeft className="size-3" />
          새 보고서 작업
          <ChevronRight className="size-3" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setFormatPickerOpen(true)}
        >
          <LayoutTemplate className="size-3" />
          {docFormat ? docFormat.name : "문서서식 선택"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={models.length === 0}>
              <Cpu className="size-3" />
              {selectedModel ?? "모델 선택"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={selectedModel} onValueChange={setSelectedModel}>
              {models.map((model) => (
                <DropdownMenuRadioItem key={model} value={model}>
                  {model}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

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

      <ScrollArea className="flex-1">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 px-6 py-10 text-center">
            <div>
              <h2 className="text-base font-semibold">오른쪽 한글 문서에 무엇을 작성할까요?</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                대화로 초안을 만들거나 기존 HWPX를 바로 열 수 있습니다.
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
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7">
              <Paperclip className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
              <Settings2 className="size-3.5" />
              작성 설정 대화
            </Button>
          </div>
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
