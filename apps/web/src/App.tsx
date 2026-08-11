import { useState } from "react";
import { sendMessage } from "@/lib/a2aClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setIsSending(true);

    try {
      const reply = await sendMessage(text);
      setMessages((prev) => [...prev, { role: "agent", text: reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { role: "agent", text: `Error: ${message}` }]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center py-8">
      <Card className="flex h-[600px] w-full flex-col">
        <CardHeader>
          <CardTitle>Report Chat Agent</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
          <ScrollArea className="flex-1 pr-4">
            <div className="flex flex-col gap-3">
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-end gap-2",
                    message.role === "user" && "flex-row-reverse",
                  )}
                >
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback>{message.role === "user" ? "Y" : "A"}</AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
            />
            <Button onClick={handleSend} disabled={isSending}>
              {isSending ? "..." : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default App;
