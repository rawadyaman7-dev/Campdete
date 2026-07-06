"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setSession } from "@/lib/session";

type TeamOption = { id: string; name: string; color: string };

export default function LoginPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamName, setTeamName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/teams/names")
      .then((r) => r.json())
      .then((data) => {
        setTeams(data.teams ?? []);
        if (data.teams?.[0]) setTeamName(data.teams[0].name);
      })
      .catch(() => setError("Couldn't load teams. Check your connection."));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/team-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");

      setSession({
        role: "team",
        token: data.token,
        teamId: data.team.id,
        teamName: data.team.name,
        color: data.team.color,
      });
      router.replace("/map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-emerald-700 px-6 py-12">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold text-emerald-800">🥚 Egg Hunt</h1>
        <p className="mb-6 text-center text-sm text-zinc-500">Enter your patrol name and PIN</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">Team</span>
            <select
              className="h-14 rounded-xl border border-zinc-300 px-4 text-lg"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
            >
              {teams.length === 0 && <option value="">Loading teams...</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-700">4-digit PIN</span>
            <input
              className="h-14 rounded-xl border border-zinc-300 px-4 text-center text-2xl tracking-[0.5em]"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
            />
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || pin.length !== 4}
            className="h-14 rounded-xl bg-emerald-700 text-lg font-bold text-white active:bg-emerald-800 disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Let's go"}
          </button>
        </form>

        <Link href="/admin/login" className="mt-6 block text-center text-sm text-zinc-400 underline">
          Camp organizer login
        </Link>
      </div>
    </div>
  );
}
