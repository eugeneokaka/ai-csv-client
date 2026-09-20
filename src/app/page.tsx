"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  createdAt: string;
}

interface LogEntry {
  time: string;
  type: "info" | "error" | "event";
  text: string;
}

export default function Home() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:4096");
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const trackedMessageIDs = useRef<Set<string>>(new Set());

  const log = useCallback((type: LogEntry["type"], text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-100), { time, type, text }]);
  }, []);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connect = async () => {
    log("info", `Connecting to ${baseUrl}...`);
    try {
      const res = await fetch(`${baseUrl}/global/health`);
      if (!res.ok) {
        const text = await res.text();
        log("error", `Health check failed: ${res.status} ${text}`);
        return;
      }
      const data = await res.json();
      log("info", `Connected! Server v${data.version}`);
      setConnected(true);
      await loadSessions();
      connectSSE();
    } catch (err) {
      log("error", `Cannot connect: ${err}`);
    }
  };

  const connectSSE = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    log("info", "Opening SSE stream...");
    const es = new EventSource(`${baseUrl}/event`);
    es.onopen = () => {
      log("info", "SSE stream connected");
    };
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        log("event", `${event.type}: ${JSON.stringify(event.properties || {}).slice(0, 120)}`);

        // message.part.updated: { sessionID, part: { messageID, type, text, ... } }
        if (event.type === "message.part.updated") {
          const part = event.properties?.part;
          if (!part || part.type !== "text") return;
          if (event.properties.sessionID !== activeSessionRef.current) return;
          const messageID = part.messageID;
          // Skip synthetic parts (used for internal tracking)
          if (part.synthetic) return;

          // Need to know which session this message belongs to.
          // The part doesn't carry sessionID, so match by messageID against
          // messages we know, or fall back to active session.
          setMessages((prev) => {
            // Find existing message by ID
            const idx = prev.findIndex((m) => m.id === messageID);
            const newText = part.text || "";
            if (idx >= 0) {
              if (prev[idx].content === newText) return prev;
              const updated = [...prev];
              updated[idx] = { ...updated[idx], content: newText };
              return updated;
            }
            // New message - assume assistant (user msgs are added locally on send)
            if (!newText) return prev;
            return [...prev, { id: messageID, role: "assistant", content: newText }];
          });
          return;
        }

        const sessionID = event.properties?.info?.sessionID;
        if (sessionID !== activeSessionRef.current) return;

        if (event.type === "session.status") {
          const status = event.properties?.status;
          if (event.properties?.sessionID === activeSessionRef.current && status?.type === "retry") {
            log("error", `Model retry: ${status.message}`);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && last.content.startsWith("Retry:")) {
                return [...prev.slice(0, -1), { role: "assistant", content: `Retry: ${status.message}` }];
              }
              return [...prev, { role: "assistant", content: `Retry: ${status.message}` }];
            });
          }
        }

        if (event.type === "message.updated") {
          const info = event.properties.info;
          if (info.sessionID === activeSessionRef.current) {
            trackedMessageIDs.current.add(info.id);
          }
          if (info.role === "user") {
            // Register user message ID so part updates can match it
            const parts = event.properties.parts || [];
            const textParts = parts.filter((p: { type: string }) => p.type === "text");
            const content = textParts.map((p: { text?: string }) => p.text || "").join("");
            setMessages((prev) => {
              if (prev.some((m) => m.id === info.id)) return prev;
              return [...prev, { id: info.id, role: "user", content }];
            });
          }
        }
      } catch {
        // ignore
      }
    };
    es.onerror = (e) => {
      log("error", `SSE error: ${JSON.stringify(e)}`);
    };
    eventSourceRef.current = es;
  };

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const loadSessions = async () => {
    log("info", "Loading sessions...");
    try {
      const res = await fetch(`${baseUrl}/session`);
      if (!res.ok) {
        const text = await res.text();
        log("error", `Load sessions failed: ${res.status} ${text}`);
        return;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      log("info", `Loaded ${list.length} sessions`);
      setSessions(list);
    } catch (err) {
      log("error", `Load sessions error: ${err}`);
    }
  };

  const createSession = async () => {
    log("info", "Creating session...");
    try {
      const res = await fetch(`${baseUrl}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Chat ${new Date().toLocaleTimeString()}` }),
      });
      if (!res.ok) {
        const text = await res.text();
        log("error", `Create session failed: ${res.status} ${text}`);
        return;
      }
      const data = await res.json();
      log("info", `Session created: ${data.id}`);
      trackedMessageIDs.current = new Set();
      setSessions((prev) => [data, ...prev]);
      setActiveSession(data.id);
      setMessages([]);
      connectSSE();
    } catch (err) {
      log("error", `Create session error: ${err}`);
    }
  };

  const selectSession = async (id: string) => {
    log("info", `Loading session ${id.slice(0, 8)}...`);
    setActiveSession(id);
    trackedMessageIDs.current = new Set();
    try {
      const res = await fetch(`${baseUrl}/session/${id}/message`);
      if (!res.ok) {
        const text = await res.text();
        log("error", `Load messages failed: ${res.status} ${text}`);
        return;
      }
      const data = await res.json();
      const msgs: Message[] = [];
      if (Array.isArray(data)) {
        for (const m of data) {
          trackedMessageIDs.current.add(m.info.id);
          const parts = m.parts || [];
          const textParts = parts.filter((p: { type: string }) => p.type === "text");
          const content = textParts.map((p: { text?: string }) => p.text || "").join("");
          if (content) {
            msgs.push({ role: m.info.role, content });
          }
        }
      }
      log("info", `Loaded ${msgs.length} messages`);
      setMessages(msgs);
    } catch (err) {
      log("error", `Load messages error: ${err}`);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || loading) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    log("info", `Sending: ${userMsg.slice(0, 50)}...`);

    try {
      const res = await fetch(`${baseUrl}/session/${activeSession}/prompt_async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: userMsg }],
        }),
      });
      log("info", `Response: ${res.status} ${res.statusText}`);
      if (!res.ok) {
        const text = await res.text();
        log("error", `Send failed: ${text}`);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error ${res.status}: ${text}` },
        ]);
      }
    } catch (err) {
      log("error", `Send error: ${err}`);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto">
      <header className="border-b p-4 flex items-center gap-3">
        <input
          className="flex-1 px-3 py-2 border rounded text-sm font-mono"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Server URL"
        />
        <button
          onClick={connect}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          {connected ? "Connected" : "Connect"}
        </button>
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
        />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 border-r p-3 flex flex-col gap-2 overflow-y-auto">
          <button
            onClick={createSession}
            disabled={!connected}
            className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            + New Session
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`px-3 py-2 rounded text-sm text-left truncate ${
                activeSession === s.id
                  ? "bg-blue-100 text-blue-800"
                  : "hover:bg-gray-100"
              }`}
            >
              {s.title || s.id.slice(0, 8)}
            </button>
          ))}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!activeSession && (
              <p className="text-gray-400 text-center mt-20">
                Connect to a server, then create or select a session.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-900"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-200 text-gray-500 px-4 py-2 rounded-lg text-sm animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {activeSession && (
            <div className="border-t p-3 flex gap-2">
              <input
                className="flex-1 px-3 py-2 border rounded text-sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}
        </main>

        <aside className="w-80 border-l bg-gray-900 text-green-400 text-xs font-mono p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500 text-[10px] uppercase tracking-wide">Logs</span>
            <button onClick={() => setLogs([])} className="text-gray-500 hover:text-white">Clear</button>
          </div>
          {logs.map((l, i) => (
            <div key={i} className={`mb-1 ${l.type === "error" ? "text-red-400" : l.type === "event" ? "text-yellow-400" : ""}`}>
              <span className="text-gray-600">{l.time}</span> {l.text}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
