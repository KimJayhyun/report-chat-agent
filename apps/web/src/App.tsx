import { useRef, useState } from "react";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  PanelLeft,
  PanelRight,
  Paperclip,
  Search,
  Send,
  Settings,
  Settings2,
  Sparkles,
  Wrench,
} from "lucide-react";
import { sendMessage } from "@/lib/a2aClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HwpEditor } from "@/components/HwpEditor";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = async (text = input) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setInput("");
    setIsSending(true);

    try {
      const reply = await sendMessage(trimmed);
      setMessages((prev) => [...prev, { role: "agent", text: reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { role: "agent", text: `Error: ${message}` }]);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
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
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <ChevronLeft className="size-3" />
          새 보고서 작업
          <ChevronRight className="size-3" />
        </Button>
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
                  {message.text}
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
            if (e.key === "Enter" && !e.shiftKey) {
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
              <Wrench className="size-3.5" />
              자료·도구
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
              <Search className="size-3.5" />
              정책 근거 탐색
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

  const editorPanel = (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-medium">
        <FileText className="size-4 text-muted-foreground" />
        한글 문서
      </div>
      <div className="flex-1 overflow-hidden">
        <HwpEditor className="h-full w-full" />
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
            <ResizablePanel id="editor">{editorPanel}</ResizablePanel>
          </ResizablePanelGroup>
        )}
        {viewMode === "chat" && <div className="h-full w-full">{chatPanel}</div>}
        {viewMode === "editor" && (
          <div className="h-full w-full">{editorPanel}</div>
        )}
      </div>
    </div>
  );
}

export default App;
