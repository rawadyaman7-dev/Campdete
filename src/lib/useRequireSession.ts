"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, Session } from "@/lib/session";

export function useRequireSession<R extends Session["role"]>(role: R) {
  const router = useRouter();
  const [session, setSessionState] = useState<Extract<Session, { role: R }> | null | undefined>(undefined);

  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== role) {
      router.replace(role === "admin" ? "/admin/login" : "/login");
      setSessionState(null);
      return;
    }
    setSessionState(s as Extract<Session, { role: R }>);
  }, [role, router]);

  return session;
}
