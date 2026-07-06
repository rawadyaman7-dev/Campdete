"use client";

import { useRequireSession } from "@/lib/useRequireSession";
import { clearSession } from "@/lib/session";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireSession("team");
  const router = useRouter();

  if (!session) return null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: session.color }} />
          <span className="font-bold text-zinc-800">{session.teamName}</span>
        </div>
        <button
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
          className="text-sm text-zinc-400 underline"
        >
          Log out
        </button>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>

      <BottomNav
        items={[
          { href: "/map", label: "Map", icon: "🗺️" },
          { href: "/challenges", label: "Challenges", icon: "🏆" },
          { href: "/leaderboard", label: "Scores", icon: "📊" },
        ]}
      />
    </div>
  );
}
