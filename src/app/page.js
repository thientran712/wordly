"use client";

import { useState, useEffect } from "react";
import InlineTranslate from "@/components/InlineTranslate";
import TranslateHistory from "@/components/TranslateHistory";
import GuestBanner from "@/components/GuestBanner";
import HomeRightRail from "@/components/HomeRightRail";

export default function Home() {
  // Render optimistically as logged-in; flip to guest only if /api/profile says so.
  // Avoids a full-page skeleton + sequential history fetch on every load.
  const [isGuest, setIsGuest] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);
  const [translatePick, setTranslatePick] = useState(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => {
        if (!r.ok) {
          setIsGuest(true);
          return null;
        }
        return r.json();
      })
      .catch(() => setIsGuest(true));
  }, []);

  return (
    <>
      <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /></div>

      <main className="relative z-10 max-w-6xl mx-auto px-3 sm:px-5 py-6 flex gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-2xl mx-auto space-y-3">

          {isGuest && <GuestBanner />}

          {/* Translate */}
          <div
            className="rounded-2xl overflow-visible"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
          >
            <InlineTranslate
              initialPick={translatePick}
              onTranslated={() => setHistoryToken(t => t + 1)}
              isLoggedIn={!isGuest}
            />
          </div>

          {/* Translation history */}
          <TranslateHistory
            refreshToken={historyToken}
            onPick={(entry) => setTranslatePick(entry)}
            isLoggedIn={!isGuest}
          />

        </div>

        {/* Right rail — desktop only, Duolingo-style stats + CTA */}
        <div className="hidden lg:block w-72 flex-shrink-0 sticky top-6">
          <HomeRightRail isGuest={isGuest} />
        </div>
      </main>
    </>
  );
}
