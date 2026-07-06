import { idbPut, idbDelete, idbGetAll } from "@/lib/idb";

type QueuedRequest = {
  id: string;
  url: string;
  method: string;
  token: string | null;
  createdAt: number;
  kind: "json" | "multipart";
  jsonBody?: unknown;
  fields?: Record<string, string>;
  fileField?: string;
  file?: Blob;
};

const QUEUE_EVENT = "egg-hunt-queue-changed";

function notifyChanged() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function onQueueChanged(cb: () => void): () => void {
  window.addEventListener(QUEUE_EVENT, cb);
  return () => window.removeEventListener(QUEUE_EVENT, cb);
}

export async function getPendingCount(): Promise<number> {
  const items = await idbGetAll<QueuedRequest>();
  return items.length;
}

function buildInit(item: Omit<QueuedRequest, "id" | "createdAt">): RequestInit {
  const headers: Record<string, string> = {};
  if (item.token) headers["Authorization"] = `Bearer ${item.token}`;

  if (item.kind === "json") {
    headers["Content-Type"] = "application/json";
    return { method: item.method, headers, body: JSON.stringify(item.jsonBody ?? {}) };
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(item.fields ?? {})) formData.append(key, value);
  if (item.file && item.fileField) formData.append(item.fileField, item.file);
  return { method: item.method, headers, body: formData };
}

type WriteResult =
  | { ok: true; queued: false; response: Response }
  | { ok: false; queued: true }
  | { ok: false; queued: false; response: Response };

export async function submitWithRetry(item: Omit<QueuedRequest, "id" | "createdAt">): Promise<WriteResult> {
  try {
    const response = await fetch(item.url, buildInit(item));
    if (response.ok || response.status < 500) {
      return { ok: response.ok, queued: false, response } as WriteResult;
    }
    // 5xx: treat as transient, queue for retry
    await enqueue(item);
    return { ok: false, queued: true };
  } catch {
    // network error: queue for retry
    await enqueue(item);
    return { ok: false, queued: true };
  }
}

async function enqueue(item: Omit<QueuedRequest, "id" | "createdAt">): Promise<void> {
  const full: QueuedRequest = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  await idbPut(full);
  notifyChanged();
}

let processing = false;

export async function processQueue(): Promise<void> {
  if (processing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  processing = true;

  try {
    const items = await idbGetAll<QueuedRequest>();
    items.sort((a, b) => a.createdAt - b.createdAt);

    for (const item of items) {
      try {
        const response = await fetch(item.url, buildInit(item));
        if (response.ok || response.status < 500) {
          await idbDelete(item.id);
          notifyChanged();
        }
        // 5xx: leave queued, try again next cycle
      } catch {
        // still offline or network error: leave queued, stop this cycle
        break;
      }
    }
  } finally {
    processing = false;
  }
}

let started = false;

export function startOfflineQueueProcessor(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("online", () => void processQueue());
  setInterval(() => void processQueue(), 20000);
  void processQueue();
}
