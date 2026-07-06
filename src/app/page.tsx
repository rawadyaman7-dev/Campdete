"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    if (!session) router.replace("/login");
    else if (session.role === "admin") router.replace("/admin");
    else router.replace("/map");
  }, [router]);

  return null;
}
