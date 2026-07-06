"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useRequireSession } from "@/lib/useRequireSession";
import { clearSession } from "@/lib/session";

const NAV = [
  { href: "/admin", label: "Review" },
  { href: "/admin/claims", label: "Egg Claims" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/leaderboard", label: "Leaderboard" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireSession("admin");
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  if (isLoginPage) return <>{children}</>;
  if (!session) return null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-900 px-4 py-3">
        <span className="font-bold text-white">Camp Admin</span>
        <button
          onClick={() => {
            clearSession();
            router.replace("/admin/login");
          }}
          className="text-sm text-zinc-400 underline"
        >
          Log out
        </button>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-2 py-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
              pathname === item.href ? "bg-zinc-800 text-white" : "text-zinc-500"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
