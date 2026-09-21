"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { FileProfile } from "@/lib/api-client";
import {
  askQuestion,
  createSession,
  deleteFile,
  deleteSession,
  getHistory,
  getOutputs,
  getProfile,
  listFiles,
  listSessions,
  uploadFiles,
} from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Plus, Send, Table2, Trash2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  images?: string[]; // data URLs
  downloads?: { name: string; media_type: string; url: string }[];
  duration?: number;
  error?: string;
}

interface FileCard {
  name: string;
  profile?: FileProfile;
}

interface LogEntry {
  time: string;
  type: "info" | "error" | "success";
  text: string;
}

interface SavedSession {
  id: string;
  title: string;
}

export default function ChatPage() {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? "";

  const [chatId, setChatId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [files, setFiles] = useState<FileCard[]>([]);
  const [previewFile, setPreviewFile] = useState<FileCard | null>(null);
  const [previewTextTable, setPreviewTextTable] = useState<{
    name: string;
    columns: string[];
    rows: string[][];
  } | null>(null);
  const [editedPreviews, setEditedPreviews] = useState<{
    name: string;
    columns: string[];
    rows: string[][];
  }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const log = useCallback((type: LogEntry["type"], text: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), { time, type, text }]);
  }, []);

  // Load chats from API on mount, create one if none exist
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const chats = await listSessions(userId);
        if (cancelled) return;
        if (chats.length > 0) {
          setSessions(chats);
          setChatId(chats[0].id);
        } else {
          // Create first chat
          const created = await createSession(userId, `Chat ${new Date().toLocaleString()}`);
          if (cancelled) return;
          setSessions([{ id: created.id, title: created.title }]);
          setChatId(created.id);
        }
      } catch {
        // server may not be running yet
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  // Load file list + chat history for the active chat
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const names = await listFiles(chatId);
        if (cancelled) return;
        const cards: FileCard[] = [];
        for (const name of names) {
          const profile = await getProfile(chatId, name).catch(() => undefined);
          cards.push({ name, profile });
        }
        setFiles(cards);
      } catch {
        // server may not be running yet — leave files empty
      }
      try {
        const hist = await getHistory(chatId);
        if (cancelled) return;
        setMessages(
          hist.messages.map((m) => ({
            role: m.role === "user" ? ("user" as const) : ("assistant" as const),
            text: m.text,
            images: m.files
              ?.filter((f) => f.media_type === "image/png")
              .map((f) => `data:${f.media_type};base64,${f.content_base64}`),
            downloads: m.files
              ?.filter((f) => f.media_type !== "image/png")
              .map((f) => ({
                name: f.name,
                media_type: f.media_type,
                url: `data:application/octet-stream;base64,${f.content_base64}`,
              })),
            duration: m.duration_s,
          }))
        );
      } catch {
        // history is best-effort
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUpload = useCallback(
    async (picked: File[] | null) => {
      if (!chatId) return;
      const csvs = (picked ?? []).filter((f) =>
        f.name.toLowerCase().endsWith(".csv")
      );
      if (csvs.length === 0) {
        setUploadError("Please choose .csv files");
        toast.error("Please choose .csv files");
        return;
      }
      setUploadError(null);
      setUploading(true);
      log("info", `Uploading ${csvs.length} file(s)...`);
      try {
        const uploaded = await uploadFiles(chatId, csvs);
        log("success", `Uploaded: ${uploaded.join(", ")}`);
        toast.success(`Uploaded ${uploaded.length} file(s)`);
        const cards: FileCard[] = [];
        for (const name of uploaded) {
          const profile = await getProfile(chatId, name).catch(() => undefined);
          if (!cards.some((c) => c.name === name)) cards.push({ name, profile });
        }
        setFiles((prev) => [...prev.filter((c) => !cards.some((n) => n.name === c.name)), ...cards]);
      } catch (err) {
        const msg = String(err);
        setUploadError(msg);
        log("error", `Upload failed: ${msg}`);
        toast.error(`Upload failed: ${msg}`);
      } finally {
        setUploading(false);
      }
    },
    [chatId, log],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  function parseCsv(text: string): { columns: string[]; rows: string[][] } {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        if (row.some((v) => v !== "")) rows.push(row);
        row = [];
      } else if (c === "\r") continue;
      else field += c;
    }
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
    const [header, ...rest] = rows;
    return { columns: header ?? [], rows: rest };
  }

  const handleEditedFileClick = (
    d: { name: string; media_type: string; url: string },
  ) => {
    if (!d.name.toLowerCase().endsWith(".csv")) {
      // not a CSV (e.g. json) — just download
      const a = document.createElement("a");
      a.href = d.url;
      a.download = d.name;
      a.click();
      return;
    }
    try {
      const base64 = d.url.split("base64,")[1] ?? "";
      const text = atob(base64);
      const parsed = parseCsv(text);
      setPreviewTextTable({
        name: d.name,
        columns: parsed.columns,
        rows: parsed.rows.slice(0, 100),
      });
    } catch (err) {
      toast.error(`Could not preview file: ${String(err)}`);
    }
  };

  const handleFilePreview = async (f: FileCard) => {
    setPreviewFile(f);
    setEditedPreviews([]);
    try {
      const outputs = await getOutputs();
      const csvOutputs = outputs.filter((o) => o.name.toLowerCase().endsWith(".csv"));
      const parsed = csvOutputs.map((o) => {
        const text = atob(o.content_base64);
        const p = parseCsv(text);
        return { name: o.name, columns: p.columns, rows: p.rows.slice(0, 100) };
      });
      setEditedPreviews(parsed);
    } catch {
      // outputs may not exist yet
    }
  };

  const newSession = async () => {
    if (!userId) return;
    try {
      const created = await createSession(userId, `Chat ${new Date().toLocaleString()}`);
      const s = { id: created.id, title: created.title };
      setSessions((prev) => [s, ...prev]);
      setChatId(created.id);
      setMessages([]);
      setFiles([]);
      toast.success(`New chat created`);
    } catch (err) {
      toast.error(`Failed to create chat: ${String(err)}`);
    }
  };

  const switchSession = (id: string) => {
    if (id === chatId) return;
    setChatId(id);
    setMessages([]);
    setFiles([]);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (chatId === id) {
        setChatId(null);
        setMessages([]);
        setFiles([]);
        // Switch to first remaining chat or create new
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          setChatId(remaining[0].id);
        } else if (userId) {
          const created = await createSession(userId, `Chat ${new Date().toLocaleString()}`);
          setSessions([{ id: created.id, title: created.title }]);
          setChatId(created.id);
        }
      }
      toast.success("Chat deleted");
    } catch (err) {
      toast.error(`Failed to delete chat: ${String(err)}`);
    }
  };

  const handleDeleteFile = async (name: string) => {
    if (!chatId) return;
    try {
      await deleteFile(chatId, name);
      setFiles((prev) => prev.filter((f) => f.name !== name));
      toast.success(`Deleted ${name}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading || !chatId) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    log("info", `Asking: ${question.slice(0, 60)}...`);
    try {
      const res = await askQuestion(chatId, question);
      const images = res.files
        .filter((f) => f.media_type === "image/png")
        .map((f) => `data:${f.media_type};base64,${f.content_base64}`);
      const downloads = res.files
        .filter((f) => f.media_type !== "image/png")
        .map((f) => ({
          name: f.name,
          media_type: f.media_type,
          url: `data:application/octet-stream;base64,${f.content_base64}`,
        }));
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant" as const,
          text: res.stdout || res.stderr || "(no output)",
          images,
          downloads,
          duration: res.duration_s,
          error: res.stderr && !res.stdout ? res.stderr : undefined,
        },
      ]);
      log(
        res.stderr && !res.stdout ? "error" : "success",
        `Reply in ${res.duration_s.toFixed(1)}s (${res.files.length} file(s))`,
      );
    } catch (err) {
      log("error", `Ask failed: ${String(err)}`);
      toast.error(String(err));
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "", error: String(err) },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            AI CSV Analyzer
          </Link>
          <div className="flex items-center gap-2">
            <Select value={chatId ?? undefined} onValueChange={switchSession}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select session" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={newSession}>
              <Plus className="size-4" />
              New
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-4 overflow-hidden p-4">
        {/* Upload sidebar */}
        <aside className="flex w-72 flex-col gap-3">
          <div
            onDragOver={handleDragOver}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              void handleUpload(Array.from(e.dataTransfer.files));
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragActive ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            {uploading ? (
              <Spinner className="size-6" />
            ) : (
              <Upload className="text-primary size-6" />
            )}
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Drop CSV files here"}
            </p>
            <p className="text-muted-foreground text-xs">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              hidden
              onChange={(e) => {
                void handleUpload(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </div>
          {uploadError && (
            <p className="text-destructive text-xs">{uploadError}</p>
          )}

          <div className="flex flex-col gap-2">
            {files.map((f) => (
              <Card key={f.name}>
                <CardContent className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => void handleFilePreview(f)}
                    className="text-primary shrink-0"
                    title="Preview"
                  >
                    <Table2 className="size-4" />
                  </button>
                  <button
                    onClick={() => void handleFilePreview(f)}
                    className="flex-1 truncate text-left text-sm"
                    title={f.name}
                  >
                    {f.name}
                  </button>
                  {f.profile && (
                    <span className="text-muted-foreground text-xs">
                      {f.profile.rows} rows
                    </span>
                  )}
                  <button
                    onClick={() => void handleDeleteFile(f.name)}
                    className="text-muted-foreground shrink-0 hover:text-destructive"
                    title="Delete file"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </CardContent>
              </Card>
            ))}
            {files.length === 0 && !uploading && (
              <p className="text-muted-foreground text-center text-xs">
                No files yet
              </p>
            )}
          </div>

          <div className="mt-auto flex flex-col">
            <button
              onClick={() => setShowLogs((s) => !s)}
              className="text-muted-foreground hover:text-foreground flex items-center justify-between text-xs"
            >
              <span>Activity logs ({logs.length})</span>
              <span>{showLogs ? "hide" : "show"}</span>
            </button>
            {showLogs && (
              <div className="scroll-green bg-muted/50 mt-2 h-40 overflow-y-auto rounded border p-2 font-mono text-[10px] leading-relaxed">
                {logs.length === 0 && (
                  <p className="text-muted-foreground">No activity yet</p>
                )}
                {logs.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{l.time}</span>
                    <span
                      className={
                        l.type === "error"
                          ? "text-destructive"
                          : l.type === "success"
                            ? "text-green-600 dark:text-green-400"
                            : ""
                      }
                    >
                      {l.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Chat area */}
        <section className="flex flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="scroll-green flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3 p-4">
              {messages.length === 0 && (
                <p className="text-muted-foreground mt-16 text-center text-sm">
                  Upload CSVs, then ask a question about them.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] ${m.role === "user" ? "" : "w-full"}`}>
                    <div
                      className={`rounded-lg px-4 py-2 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground [&_a]:text-primary-foreground [&_a]:underline"
                          : "bg-muted [&_strong]:font-semibold [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5 [&_code]:bg-background [&_code]:px-1 [&_code]:rounded [&_h4]:font-semibold [&_h5]:font-semibold [&_p]:my-1"
                      }`}
                    >
                      {m.role === "user" ? (
                        <span className="whitespace-pre-wrap">{m.text}</span>
                      ) : (
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      )}
                      {m.error && (
                        <span className="text-destructive block">{m.error}</span>
                      )}
                      {m.duration != null && (
                        <span className="text-muted-foreground mt-1 block text-xs">
                          {m.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>
                    {m.images?.map((src, j) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`img-${j}`}
                        src={src}
                        alt="chart"
                        className="bg-background mt-2 rounded-lg border p-2"
                      />
                    ))}
                    {m.downloads?.map((d) => (
                      <button
                        key={d.name}
                        onClick={() => handleEditedFileClick(d)}
                        className="bg-background mt-2 flex w-fit items-center gap-2 rounded-lg border px-4 py-2 text-sm underline underline-offset-2 hover:bg-muted"
                        title={d.name.toLowerCase().endsWith(".csv") ? "Preview this file" : "Download"}
                      >
                        <FileText className="size-4" />
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted flex items-center gap-2 rounded-lg px-4 py-2 text-sm">
                    <Spinner className="size-4" />
                    Analyzing your data...
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  files.length === 0
                    ? "Upload a CSV first..."
                    : "e.g. Average salary by department, as a chart"
                }
                disabled={files.length === 0 || loading}
                className="min-h-10 flex-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <Button
                onClick={() => void sendMessage()}
                disabled={!input.trim() || loading || files.length === 0}
                size="icon"
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* CSV preview dialog (uploaded files + AI-edited files) */}
      <Dialog
        open={!!previewFile || !!previewTextTable}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewFile(null);
            setPreviewTextTable(null);
            setEditedPreviews([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Table2 className="text-primary size-4" />
              {previewTextTable?.name ?? previewFile?.name}
            </DialogTitle>
            <DialogDescription>
              {previewTextTable
                ? `AI-generated file · showing first ${previewTextTable.rows.length} rows`
                : previewFile?.profile &&
                  `${previewFile.profile.rows} rows · ${previewFile.profile.columns.length} columns · showing first ${previewFile.profile.preview.length} rows` +
                    (Object.values(previewFile.profile.missing_values).some((v) => v > 0)
                      ? ` · ${Object.entries(previewFile.profile.missing_values)
                          .filter(([, v]) => v > 0)
                          .length} column(s) with missing values`
                      : "")}
            </DialogDescription>
          </DialogHeader>
          {previewTextTable && (
            <div className="scroll-green max-h-[55vh] overflow-auto rounded border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {previewTextTable.columns.map((col) => (
                      <th
                        key={col}
                        className="border-b px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewTextTable.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      {previewTextTable.columns.map((_, c) => (
                        <td key={c} className="border-b px-2 py-1 whitespace-nowrap">
                          {row[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!previewTextTable && previewFile?.profile && (
            <>
              <div className="scroll-green max-h-[55vh] overflow-auto rounded border">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {previewFile.profile.columns.map((col) => (
                        <th
                          key={col}
                          className="border-b px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewFile.profile.preview.map((row, i) => (
                      <tr key={i} className="hover:bg-muted/50">
                        {previewFile.profile!.columns.map((col) => (
                          <td
                            key={col}
                            className="border-b px-2 py-1 whitespace-nowrap"
                          >
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editedPreviews.map((ep) => (
                <div key={ep.name} className="mt-4">
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    Output: {ep.name}
                  </p>
                  <div className="scroll-green max-h-[55vh] overflow-auto rounded border">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          {ep.columns.map((col) => (
                            <th
                              key={col}
                              className="border-b px-2 py-1.5 text-left font-semibold whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ep.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-muted/50">
                            {ep.columns.map((_, c) => (
                              <td key={c} className="border-b px-2 py-1 whitespace-nowrap">
                                {row[c] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
