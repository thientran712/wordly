"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import InlineTranslate from "@/components/InlineTranslate";
import TranslateHistory from "@/components/TranslateHistory";
import GuestBanner from "@/components/GuestBanner";

export default function Home() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest
  const [toast, setToast] = useState(null);
  const [userName, setUserName] = useState("");
  const [historyToken, setHistoryToken] = useState(0);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => {
        if (!r.ok) {
          setUser(null);
          return null;
        }
        setUser(true);
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setUserName(data.profile?.name || data.email?.split("@")[0] || "");
      })
      .catch(() => setUser(null));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const isGuest = user === null;
  const [translatePick, setTranslatePick] = useState(null);

  if (user === undefined) {
    return (
      <>
        <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /></div>
        <main className="relative z-10">
          <div className="h-14 animate-pulse" style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--divider)" }} />
          <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3 animate-pulse">
            <div className="h-56 rounded-2xl" style={{ background: "var(--card-bg)" }} />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /></div>

      <main className="relative z-10">
        <Header
          userName={userName}
          isGuest={isGuest}
          onJournalAdded={() => showToast("📝 Đã lưu vào Journal")}
        />

        <div className="max-w-2xl mx-auto px-3 sm:px-5 pb-12 space-y-3 pt-1">

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
      </main>

      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full font-semibold text-sm z-[200] animate-fade-in border whitespace-nowrap"
          style={{ background: "var(--surface-elevated)", borderColor: "var(--green-subtle-border)", color: "var(--electric)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
