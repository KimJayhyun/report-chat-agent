import { useState } from "react";
import { sendMessage } from "./lib/a2aClient";
import "./App.css";

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
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <h1>Report Chat Agent</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 240 }}>
        {messages.map((message, i) => (
          <div key={i} style={{ textAlign: message.role === "user" ? "right" : "left" }}>
            <strong>{message.role === "user" ? "You" : "Agent"}:</strong> {message.text}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type a message..."
          style={{ flex: 1 }}
        />
        <button type="button" onClick={handleSend} disabled={isSending}>
          {isSending ? "..." : "Send"}
        </button>
      </div>
    </main>
  );
}

export default App;
