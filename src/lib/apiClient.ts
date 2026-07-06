import { getSession } from "@/lib/session";

export async function apiGet<T>(path: string): Promise<T> {
  const session = getSession();
  const res = await fetch(path, {
    headers: session ? { Authorization: `Bearer ${session.token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPostJson<T>(path: string, data: unknown): Promise<T> {
  const session = getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body;
}
