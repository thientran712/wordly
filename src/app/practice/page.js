"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Mic, MicOff, ArrowLeft, Volume2, Loader2, Phone, PhoneOff,
  Plus, Trash2, Pencil, Check, X, MessageSquare, Menu, ChevronLeft,
} from "lucide-react";

const AVATAR_FRAMES = ["🧑‍🏫", "👨‍🏫"];

async function speakText(text) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: "en-US" }),
    });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play();
    });
  } catch { return Promise.resolve(); }
}

function formatDate(iso) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  if (diff < 7) return `${diff} ngày trước`;
  return d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onRename, loading, open, onClose }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (renamingId) inputRef.current?.focus(); }, [renamingId]);

  const startRename = (s) => { setRenamingId(s.id); setRenameVal(s.title); };
  const submitRename = (id) => {
    if (renameVal.trim()) onRename(id, renameVal.trim());
    setRenamingId(null);
  };

  return (
    <>
      {/* Backdrop on mobile */}
      {open && (
        <div className="fixed inset-0 z-20 md:hidden" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      )}
      <aside
        className={`fixed md:relative top-0 left-0 h-full z-30 md:z-auto flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{ width: 260, background: "var(--card-bg)", borderRight: "1px solid var(--divider)", minHeight: "100vh" }}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b" style={{ borderColor: "var(--divider)" }}>
          <span className="font-bold text-sm flex-1" style={{ color: "var(--ink)" }}>Lịch sử luyện nói</span>
          <button
            onClick={onNew}
            className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
            style={{ background: "var(--electric)", color: "#0A0A0A" }}
            title="Cuộc trò chuyện mới"
          >
            <Plus size={14} />
          </button>
          <button onClick={onClose} className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center md:hidden" style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}>
            <X size={14} />
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--ink-soft)" }} />
            </div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
              Chưa có cuộc trò chuyện nào
            </div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              className="group relative flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors mx-1 rounded-xl"
              style={{ background: activeId === s.id ? "var(--hover-bg)" : "transparent" }}
              onClick={() => { if (renamingId !== s.id) { onSelect(s.id); onClose(); } }}
            >
              <MessageSquare size={13} style={{ color: "var(--ink-soft)", flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                {renamingId === s.id ? (
                  <input
                    ref={inputRef}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submitRename(s.id); if (e.key === "Escape") setRenamingId(null); }}
                    onClick={e => e.stopPropagation()}
                    className="w-full text-xs rounded px-1 py-0.5 outline-none"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--electric)", color: "var(--ink)" }}
                  />
                ) : (
                  <>
                    <div className="text-xs font-medium truncate" style={{ color: "var(--ink)" }}>{s.title}</div>
                    <div className="text-[10px]" style={{ color: "var(--ink-soft)" }}>{formatDate(s.updated_at)}</div>
                  </>
                )}
              </div>

              {renamingId === s.id ? (
                <div className="flex gap-1">
                  <button onClick={e => { e.stopPropagation(); submitRename(s.id); }} className="no-min-h w-5 h-5 flex items-center justify-center rounded" style={{ color: "var(--electric)" }}><Check size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); setRenamingId(null); }} className="no-min-h w-5 h-5 flex items-center justify-center rounded" style={{ color: "var(--ink-soft)" }}><X size={11} /></button>
                </div>
              ) : (
                <div className="hidden group-hover:flex gap-1">
                  <button onClick={e => { e.stopPropagation(); startRename(s); }} className="no-min-h w-6 h-6 flex items-center justify-center rounded-lg transition-all" style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}><Pencil size={11} /></button>
                  <button onClick={e => { e.stopPropagation(); onDelete(s.id); }} className="no-min-h w-6 h-6 flex items-center justify-center rounded-lg transition-all" style={{ background: "var(--hover-bg)", color: "var(--error)" }}><Trash2 size={11} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PracticePage() {
  const router = useRouter();

  // Session management
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Chat state
  const [sessionState, setSessionState] = useState("idle"); // idle | connecting | active | ended
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);  // VAD mic is on
  const [isSpeaking, setIsSpeaking] = useState(false);    // Alex is speaking
  const [isThinking, setIsThinking] = useState(false);    // AI is processing
  const [isUserTalking, setIsUserTalking] = useState(false); // VAD detected voice
  const [transcript, setTranscript] = useState("");
  const [avatarFrame, setAvatarFrame] = useState(0);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [vadReady, setVadReady] = useState(false);

  const vadRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const avatarTimerRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isThinkingRef = useRef(false);
  const activeSessionIdRef = useRef(null);
  const messagesRef = useRef([]);

  // Keep refs in sync
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // ── Load sessions ──────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/practice/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Auto-save messages to active session ───────────────────────────────────
  const saveMessages = useCallback((msgs, sessionId) => {
    if (!sessionId || msgs.length === 0) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await fetch(`/api/practice/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs }),
        });
      } finally {
        setIsSaving(false);
      }
    }, 1500);
  }, []);

  // ── Avatar animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (isSpeaking) {
      avatarTimerRef.current = setInterval(() => setAvatarFrame(f => (f + 1) % AVATAR_FRAMES.length), 400);
    } else {
      clearInterval(avatarTimerRef.current);
      setAvatarFrame(0);
    }
    return () => clearInterval(avatarTimerRef.current);
  }, [isSpeaking]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Select existing session ────────────────────────────────────────────────
  const selectSession = useCallback(async (id) => {
    // Stop any active session first
    if (vadRef.current) { try { vadRef.current.destroy(); } catch {} vadRef.current = null; }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    setIsListening(false);
    setVadReady(false);
    setIsSpeaking(false);
    setIsThinking(false);
    setError(null);

    setSessionState("idle");
    setMessages([]);
    setActiveSessionId(id);

    try {
      const res = await fetch(`/api/practice/sessions/${id}`);
      const data = await res.json();
      if (data.session?.messages?.length > 0) {
        setMessages(data.session.messages);
        setSessionState("ended");
      }
    } catch { /* silently fail */ }
  }, []);

  // ── Create new session ─────────────────────────────────────────────────────
  const createSession = useCallback(async (firstMessages) => {
    const title = "Conversation " + new Date().toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
    const res = await fetch("/api/practice/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, messages: firstMessages || [] }),
    });
    const data = await res.json();
    const session = data.session;
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    return session.id;
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (userText, currentMessages, sessionId) => {
    const newMessages = [...currentMessages, { role: "user", content: userText }];
    setMessages(newMessages);
    setIsThinking(true);

    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (!data.reply) throw new Error("No reply");

      const withReply = [...newMessages, { role: "assistant", content: data.reply }];
      setMessages(withReply);
      setIsThinking(false);
      saveMessages(withReply, sessionId);

      setIsSpeaking(true);
      await speakText(data.reply);
      setIsSpeaking(false);

      return withReply;
    } catch {
      setIsThinking(false);
      setIsSpeaking(false);
      setError("Có lỗi xảy ra. Thử lại nhé!");
      return currentMessages;
    }
  }, [saveMessages]);

  // ── Start new session ──────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    setSessionState("connecting");
    setMessages([]);
    setError(null);
    setIsThinking(true);

    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello! I want to practice my English." }],
          vocabularyContext: true,
        }),
      });
      const data = await res.json();
      const greeting = data.reply || "Hey! I'm Alex, your English teacher. Great to meet you! What would you like to talk about today?";

      const initMessages = [
        { role: "user", content: "Hello! I want to practice my English." },
        { role: "assistant", content: greeting },
      ];
      setMessages(initMessages);
      setIsThinking(false);
      setSessionState("active");

      // Create session in DB
      const newId = await createSession(initMessages);
      setActiveSessionId(newId);

      setIsSpeaking(true);
      await speakText(greeting);
      setIsSpeaking(false);
    } catch {
      setIsThinking(false);
      setSessionState("idle");
      setError("Không thể kết nối. Thử lại nhé!");
    }
  }, [createSession]);

  // ── Resume session ─────────────────────────────────────────────────────────
  const resumeSession = useCallback(() => {
    setSessionState("active");
    setError(null);
  }, []);

  // ── STT: convert audio blob → text via Web Speech API ─────────────────────
  const transcribeAudio = useCallback((audioFloat32) => {
    return new Promise((resolve) => {
      if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
        resolve(""); return;
      }
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      // Convert float32 PCM → WAV blob → play back into recognition
      // Since Web Speech API can't accept blobs directly, we use a short
      // continuous session trick: start recognition right when speech starts.
      // The VAD already detected speech; we just need the text.
      let result = "";
      recognition.onresult = (e) => {
        result = Array.from(e.results).map(r => r[0].transcript).join(" ").trim();
      };
      recognition.onend = () => resolve(result);
      recognition.onerror = () => resolve(result);
      try { recognition.start(); setTimeout(() => recognition.stop(), 200); } catch { resolve(""); }
    });
  }, []);

  // ── VAD: init once per session ─────────────────────────────────────────────
  const startVAD = useCallback(async () => {
    try {
      const { MicVAD } = await import("@ricky0123/vad-web");

      const vad = await MicVAD.new({
        workletURL: "/vad.worklet.bundle.min.js",
        modelURL: "/silero_vad_v5.onnx",
        ortConfig: (ort) => {
          ort.env.wasm.wasmPaths = "/";
        },
        positiveSpeechThreshold: 0.6,
        negativeSpeechThreshold: 0.4,
        minSpeechFrames: 4,
        preSpeechPadFrames: 10,
        redemptionFrames: 8,

        onSpeechStart: () => {
          // Don't listen while Alex is speaking or AI is thinking
          if (isSpeakingRef.current || isThinkingRef.current) return;
          setIsUserTalking(true);
          setTranscript("");

          // Start Web Speech API in parallel to capture text
          if (("webkitSpeechRecognition" in window) || ("SpeechRecognition" in window)) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            const rec = new SR();
            rec.lang = "en-US";
            rec.continuous = true;
            rec.interimResults = true;
            let accumulated = "";

            rec.onresult = (e) => {
              let final = "", interim = "";
              for (const r of e.results) {
                if (r.isFinal) final += r[0].transcript;
                else interim += r[0].transcript;
              }
              accumulated = final;
              setTranscript((final + " " + interim).trim());
              recognitionRef.current._accumulated = accumulated;
            };
            rec.onerror = () => {};
            rec.onend = () => {};
            rec.start();
            recognitionRef.current = rec;
          }
        },

        onSpeechEnd: () => {
          if (isSpeakingRef.current || isThinkingRef.current) {
            setIsUserTalking(false);
            setTranscript("");
            if (recognitionRef.current) {
              try { recognitionRef.current.stop(); } catch {}
              recognitionRef.current = null;
            }
            return;
          }

          setIsUserTalking(false);

          // Stop STT and get accumulated text
          const rec = recognitionRef.current;
          if (rec) {
            try { rec.stop(); } catch {}
            recognitionRef.current = null;
          }

          // Small delay to let final STT result come in
          setTimeout(() => {
            const text = rec?._accumulated?.trim() || "";
            setTranscript("");
            if (text) {
              const currentMessages = messagesRef.current;
              const sessionId = activeSessionIdRef.current;
              setMessages(prev => {
                sendMessage(text, prev, sessionId).then(updated => setMessages(updated));
                return prev;
              });
            }
          }, 300);
        },

        onVADMisfire: () => {
          setIsUserTalking(false);
          setTranscript("");
          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch {}
            recognitionRef.current = null;
          }
        },
      });

      vadRef.current = vad;
      vad.start();
      setIsListening(true);
      setVadReady(true);
      setError(null);
    } catch (err) {
      setError("Không thể bật mic: " + (err.message || "unknown error"));
      setIsListening(false);
    }
  }, [sendMessage]);

  const stopVAD = useCallback(() => {
    if (vadRef.current) {
      try { vadRef.current.destroy(); } catch {}
      vadRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setIsUserTalking(false);
    setTranscript("");
    setVadReady(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) stopVAD();
    else startVAD();
  }, [isListening, startVAD, stopVAD]);

  // Auto-start VAD when session becomes active
  useEffect(() => {
    if (sessionState === "active" && !isListening && !vadRef.current) {
      startVAD();
    }
    if (sessionState !== "active" && isListening) {
      stopVAD();
    }
  }, [sessionState]); // eslint-disable-line

  const endSession = useCallback(() => {
    stopVAD();
    setSessionState("ended");
    setIsSpeaking(false);
  }, [stopVAD]);

  // ── Session CRUD ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
      setSessionState("idle");
    }
    await fetch(`/api/practice/sessions/${id}`, { method: "DELETE" });
  }, [activeSessionId]);

  const handleRename = useCallback(async (id, title) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
    await fetch(`/api/practice/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }, []);

  const handleNew = useCallback(() => {
    if (vadRef.current) { try { vadRef.current.destroy(); } catch {} vadRef.current = null; }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} recognitionRef.current = null; }
    setActiveSessionId(null);
    setMessages([]);
    setSessionState("idle");
    setError(null);
    setIsListening(false);
    setIsSpeaking(false);
    setSidebarOpen(false);
  }, []);

  const canTalk = sessionState === "active" && !isThinking && !isSpeaking; // kept for reference

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        activeId={activeSessionId}
        onSelect={selectSession}
        onNew={handleNew}
        onDelete={handleDelete}
        onRename={handleRename}
        loading={sessionsLoading}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ background: "var(--card-bg)", borderColor: "var(--divider)" }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="no-min-h w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 md:hidden"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            <Menu size={16} />
          </button>
          <button
            onClick={() => router.push("/profile")}
            className="no-min-h w-8 h-8 rounded-xl items-center justify-center transition-all active:scale-90 hidden md:flex"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>
              {sessions.find(s => s.id === activeSessionId)?.title || "Luyện nói với Alex"}
            </div>
            <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>Native American English Teacher</div>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && <Loader2 size={12} className="animate-spin" style={{ color: "var(--ink-soft)" }} />}
            {sessionState === "active" && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs font-medium hidden sm:block" style={{ color: "var(--electric)" }}>Live</span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable chat area */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-lg mx-auto w-full px-4 py-6 flex flex-col gap-5">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all duration-200"
                style={{
                  background: isSpeaking ? "var(--green-subtle)" : "var(--card-bg)",
                  border: `3px solid ${isSpeaking ? "var(--electric)" : "var(--card-border)"}`,
                  boxShadow: isSpeaking ? "0 0 24px rgba(34,197,94,0.3)" : "0 4px 20px rgba(0,0,0,0.1)",
                  transform: isSpeaking ? "scale(1.05)" : "scale(1)",
                }}
              >
                {AVATAR_FRAMES[avatarFrame]}
              </div>
              <div className="text-center">
                <div className="font-bold text-sm" style={{ color: "var(--ink)" }}>Alex</div>
                <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {isThinking ? "Đang suy nghĩ..." : isSpeaking ? "Đang nói..." : sessionState === "active" ? "Sẵn sàng nghe" : "American English Teacher"}
                </div>
              </div>
            </div>

            {/* Messages */}
            {messages.length > 0 && (
              <div className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                      style={m.role === "user"
                        ? { background: "var(--electric)", color: "#fff", borderBottomRightRadius: "4px" }
                        : { background: "var(--card-bg)", color: "var(--ink)", borderBottomLeftRadius: "4px", border: "1px solid var(--card-border)" }
                      }
                    >
                      {m.content}
                      {m.role === "assistant" && (
                        <button onClick={() => speakText(m.content)} className="ml-2 opacity-40 hover:opacity-100 inline-flex align-middle">
                          <Volume2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {isThinking && (
                  <div className="flex justify-start">
                    <div className="px-4 py-3 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--ink-soft)", animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Transcript */}
            {isListening && (
              <div className="rounded-xl px-4 py-3 text-center text-sm" style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}>
                {transcript || "Đang nghe... hãy nói tiếng Anh"}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl px-4 py-3 text-center text-sm flex items-center justify-between" style={{ background: "var(--error-soft)", color: "var(--error)" }}>
                {error}
                <button onClick={() => setError(null)}><X size={14} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom controls */}
        <div className="flex-shrink-0 border-t py-5" style={{ background: "var(--card-bg)", borderColor: "var(--divider)" }}>
          <div className="max-w-lg mx-auto px-4 flex flex-col items-center gap-3">

            {sessionState === "idle" && (
              <button
                onClick={startSession}
                className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95"
                style={{ background: "var(--electric)", color: "#0A0A0A", boxShadow: "0 4px 20px rgba(34,197,94,0.4)" }}
              >
                <Phone size={18} />
                {activeSessionId ? "Bắt đầu cuộc trò chuyện mới" : "Bắt đầu luyện nói"}
              </button>
            )}

            {sessionState === "connecting" && (
              <div className="flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm" style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}>
                <Loader2 size={18} className="animate-spin" /> Đang kết nối...
              </div>
            )}

            {sessionState === "active" && (
              <>
                <div className="flex items-center gap-5">
                  {/* Mic toggle — VAD auto-detects voice, this just enables/disables */}
                  <div className="relative">
                    <button
                      onClick={toggleListening}
                      className="rounded-full flex items-center justify-center transition-all active:scale-95"
                      style={{
                        width: 72, height: 72,
                        background: isUserTalking ? "var(--electric)" : isListening ? "var(--green-subtle)" : "var(--card-bg)",
                        border: `3px solid ${isUserTalking ? "var(--electric)" : isListening ? "var(--electric)" : "var(--card-border)"}`,
                        boxShadow: isUserTalking ? "0 0 32px rgba(34,197,94,0.7)" : isListening ? "0 0 20px rgba(34,197,94,0.3)" : "0 4px 16px rgba(0,0,0,0.15)",
                        color: isListening ? "var(--electric)" : "var(--ink-soft)",
                      }}
                    >
                      {isListening ? <Mic size={28} /> : <MicOff size={24} />}
                    </button>
                    {isListening && !isUserTalking && !isSpeaking && !isThinking && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-400 animate-pulse border-2" style={{ borderColor: "var(--card-bg)" }} />
                    )}
                  </div>
                  <button
                    onClick={endSession}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
                    style={{ background: "var(--error)", color: "#fff", boxShadow: "0 4px 12px rgba(239,68,68,0.4)" }}
                  >
                    <PhoneOff size={18} />
                  </button>
                </div>
                <p className="text-xs text-center" style={{ color: "var(--ink-soft)" }}>
                  {isThinking ? "Alex đang suy nghĩ..." :
                   isSpeaking ? "Alex đang nói..." :
                   isUserTalking ? "Đang nghe bạn nói..." :
                   isListening ? "Mic đang bật — cứ tự nhiên nói" :
                   "Nhấn mic để bật"}
                </p>
              </>
            )}

            {sessionState === "ended" && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>
                  Buổi luyện tập kết thúc · {messages.filter(m => m.role === "user").length} lượt nói
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={resumeSession}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{ background: "var(--electric)", color: "#0A0A0A" }}
                  >
                    <Mic size={15} /> Tiếp tục
                  </button>
                  <button
                    onClick={handleNew}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                    style={{ background: "var(--hover-bg)", color: "var(--ink)", border: "1px solid var(--card-border)" }}
                  >
                    <Plus size={15} /> Cuộc mới
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
