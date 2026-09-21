const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export interface AskResponse {
  stdout: string;
  stderr: string;
  files: { name: string; media_type: string; content_base64: string }[];
  duration_s: number;
  attempts: number;
  opencode_session_id: string | null;
}

export interface HistoryMessage {
  role: string;
  text: string;
  files?: { name: string; media_type: string; content_base64: string }[];
  duration_s?: number;
}

export interface HistoryResponse {
  messages: HistoryMessage[];
}

export interface FileProfile {
  name: string;
  rows: number;
  columns: string[];
  column_types: Record<string, string>;
  missing_values: Record<string, number>;
  numeric_stats: Record<string, Record<string, number>>;
  preview: Record<string, unknown>[];
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface OutputFile {
  name: string;
  media_type: string;
  content_base64: string;
}

export const getApiUrl = () => API_URL;

// --- Upload ---

export async function uploadFiles(
  sessionId: string,
  files: File[],
): Promise<string[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${API_URL}/upload/${sessionId}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Upload failed: ${res.status} ${detail}`);
  }
  return (await res.json()).files as string[];
}

export async function listFiles(sessionId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/upload/${sessionId}`);
  if (!res.ok) throw new Error(`List files failed: ${res.status}`);
  return (await res.json()).files as string[];
}

export async function getProfile(
  sessionId: string,
  filename: string,
): Promise<FileProfile> {
  const res = await fetch(
    `${API_URL}/upload/${sessionId}/profile/${encodeURIComponent(filename)}`,
  );
  if (!res.ok) throw new Error(`Profile failed: ${res.status}`);
  return res.json();
}

export async function deleteFile(
  sessionId: string,
  filename: string,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/upload/${sessionId}/${encodeURIComponent(filename)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

// --- Chat ---

export async function askQuestion(
  chatId: string,
  question: string,
): Promise<AskResponse> {
  const res = await fetch(`${API_URL}/chat/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, question }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ask failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function getHistory(chatId: string): Promise<HistoryResponse> {
  const res = await fetch(`${API_URL}/chat/history?chat_id=${encodeURIComponent(chatId)}`);
  if (!res.ok) throw new Error(`History failed: ${res.status}`);
  return res.json();
}

export async function getOutputs(): Promise<OutputFile[]> {
  const res = await fetch(`${API_URL}/chat/outputs`);
  if (!res.ok) throw new Error(`Outputs failed: ${res.status}`);
  return (await res.json()).files;
}

// --- Sessions (v2) ---

export async function listSessions(userId: string): Promise<ChatSession[]> {
  const res = await fetch(`${API_URL}/chat/sessions?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`List sessions failed: ${res.status}`);
  return (await res.json()).sessions;
}

export async function createSession(
  userId: string,
  title?: string,
): Promise<{ id: string; title: string }> {
  const res = await fetch(`${API_URL}/chat/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, title }),
  });
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
  return res.json();
}

export async function updateSession(
  chatId: string,
  title: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/chat/sessions/${chatId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Update session failed: ${res.status}`);
}

export async function deleteSession(chatId: string): Promise<void> {
  const res = await fetch(`${API_URL}/chat/sessions/${chatId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete session failed: ${res.status}`);
}
