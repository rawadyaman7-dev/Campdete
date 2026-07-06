"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/apiClient";
import { submitWithRetry } from "@/lib/offlineQueue";
import { getSession } from "@/lib/session";
import PhotoSubmitForm from "@/components/PhotoSubmitForm";

type Challenge = {
  id: string;
  title: string;
  description: string;
  points: number;
  status: "open" | "pending" | "racing" | "rejected" | "collected";
  unlockType: "PHOTO_SUBMISSION" | "DISTANCE_WALKED";
  distanceProgress: { walkedMeters: number; requiredMeters: number } | null;
  collectedBy: { teamName: string; at: string } | null;
  egg: { lat: number; lng: number; hintPhotoUrl: string | null } | null;
  myClaimPending: boolean;
};

export default function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [findingIt, setFindingIt] = useState(false);

  async function load() {
    const res = await apiGet<{ challenges: Challenge[] }>("/api/challenges");
    setChallenge(res.challenges.find((c) => c.id === id) ?? null);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleFoundIt() {
    const session = getSession();
    if (!session) return;
    setFindingIt(true);
    setMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await submitWithRetry({
          url: `/api/challenges/${id}/found`,
          method: "POST",
          token: session.token,
          kind: "json",
          jsonBody: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });

        if (result.queued) {
          setMessage("No connection — your claim will be sent automatically once you're back online.");
        } else if (result.ok) {
          const body = await result.response.json();
          setMessage(
            body.withinRange
              ? "Nice! Your claim was sent to the admin for confirmation."
              : "Your claim was sent, but you look far from the egg's location — the admin may check with you."
          );
          load();
        } else {
          const body = await result.response.json().catch(() => ({}));
          setMessage(body.error ?? "Couldn't submit your claim.");
        }
        setFindingIt(false);
      },
      () => {
        setMessage("Couldn't get your location. Enable GPS and try again.");
        setFindingIt(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  if (!challenge) {
    return <div className="flex flex-1 items-center justify-center text-zinc-400">Loading...</div>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <button onClick={() => router.back()} className="mb-3 self-start text-sm text-zinc-400 underline">
        ← Back
      </button>

      <h1 className="text-2xl font-bold text-zinc-800">{challenge.title}</h1>
      <span className="mt-1 inline-block w-fit rounded-full bg-emerald-700 px-3 py-1 text-sm font-bold text-white">
        {challenge.points} points
      </span>
      <p className="mt-3 text-zinc-600">{challenge.description}</p>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        {challenge.status === "collected" && challenge.collectedBy && (
          <p className="font-medium text-zinc-500">
            🥚 This egg was already collected by <strong>{challenge.collectedBy.teamName}</strong>.
          </p>
        )}

        {challenge.status === "open" && challenge.unlockType === "DISTANCE_WALKED" && challenge.distanceProgress && (
          <div className="flex flex-col gap-2">
            <p className="font-medium text-zinc-700">
              🚶 Walk {(challenge.distanceProgress.requiredMeters / 1000).toFixed(1)} km as a patrol to unlock this egg.
            </p>
            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.min(100, (challenge.distanceProgress.walkedMeters / challenge.distanceProgress.requiredMeters) * 100)}%`,
                }}
              />
            </div>
            <p className="text-sm text-zinc-500">
              {(challenge.distanceProgress.walkedMeters / 1000).toFixed(2)} / {(challenge.distanceProgress.requiredMeters / 1000).toFixed(1)} km walked
              so far. Keep the Map tab open while you hike — that's what tracks your distance!
            </p>
          </div>
        )}

        {challenge.status === "rejected" && challenge.unlockType === "DISTANCE_WALKED" && (
          <p className="font-medium text-amber-700">
            This challenge was reset by the camp admin. Check with them if you think that&apos;s a mistake.
          </p>
        )}

        {(challenge.status === "open" || challenge.status === "rejected") && challenge.unlockType === "PHOTO_SUBMISSION" && (
          <>
            {challenge.status === "rejected" && (
              <p className="mb-3 font-medium text-red-600">Your last submission was rejected — try again with a clearer photo.</p>
            )}
            <p className="mb-3 text-sm text-zinc-500">Submit a photo proving your patrol completed this challenge.</p>
            <PhotoSubmitForm
              url={`/api/challenges/${id}/submit`}
              fileField="photo"
              buttonLabel="Submit proof"
              onDone={(result) => {
                setMessage(result.message);
                if (result.ok) load();
              }}
            />
          </>
        )}

        {challenge.status === "pending" && (
          <p className="font-medium text-amber-700">⏳ Your submission is waiting for admin review.</p>
        )}

        {challenge.status === "racing" && (
          <div className="flex flex-col gap-3">
            <p className="font-bold text-emerald-700">🥚 Egg unlocked! Here&apos;s the hiding spot:</p>
            {challenge.egg?.hintPhotoUrl && (
              <img src={challenge.egg.hintPhotoUrl} alt="Hint" className="w-full rounded-xl" />
            )}
            {challenge.myClaimPending ? (
              <p className="font-medium text-amber-700">⏳ Claim submitted — waiting for admin confirmation.</p>
            ) : (
              <button
                onClick={handleFoundIt}
                disabled={findingIt}
                className="h-14 rounded-xl bg-emerald-700 text-lg font-bold text-white active:bg-emerald-800 disabled:opacity-50"
              >
                {findingIt ? "Checking your location..." : "Found it!"}
              </button>
            )}
          </div>
        )}

        {message && <p className="mt-3 text-sm font-medium text-zinc-600">{message}</p>}
      </div>
    </div>
  );
}
