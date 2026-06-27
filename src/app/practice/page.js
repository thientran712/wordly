"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, ArrowLeft, Volume2, Loader2, Phone, PhoneOff } from "lucide-react";

const AVATAR_FRAMES = ["🧑‍🏫", "👨‍🏫"];

async function speakText(text) {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: "en-US" }),
    });
    if (!res.ok) throw new Error("TTS failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play();
    });
  } catch {
    return Promise.resolve();
  }
}

export default function PracticePage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState("idle"); // idle | connecting | active | ended
  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [avatarFrame, setAvatarFrame] = useState(0);
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const avatarTimerRef = useRef(null);

  // Animate avatar when speaking
  useEffect(() => {
    if (isSpeaking) {
      avatarTimerRef.current = setInterval(() => {
        setAvatarFrame(f => (f + 1) % AVATAR_FRAMES.length);
      }, 400);
    } else {
      clearInterval(avatarTimerRef.current);
      setAvatarFrame(0);
    }
    return () => clearInterval(avatarTimerRef.current);
  }, [isSpeaking]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (userText, currentMessages) => {
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

      // Speak the reply
      setIsSpeaking(true);
      await speakText(data.reply);
      setIsSpeaking(false);

      return withReply;
    } catch {
      setIsThinking(false);
      setIsSpeaking(false);
      setError("Có lỗi xảy ra. Thử lại nhé!");
      return newMessages;
    }
  }, []);

  const startSession = useCallback(async () => {
    setSessionState("connecting");
    setMessages([]);
    setError(null);

    // AI greets first
    setIsThinking(true);
    try {
      const res = await fetch("/api/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello! I want to practice my English." }],
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

      setIsSpeaking(true);
      await speakText(greeting);
      setIsSpeaking(false);
    } catch {
      setIsThinking(false);
      setSessionState("idle");
      setError("Không thể kết nối. Thử lại nhé!");
    }
  }, []);

  const startListening = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setError("Trình duyệt không hỗ trợ mic. Dùng Chrome nhé!");
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      const interim = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(interim);

      if (e.results[e.results.length - 1].isFinal) {
        const final = e.results[e.results.length - 1][0].transcript.trim();
        if (final) {
          setTranscript("");
          setIsListening(false);
          setMessages(prev => {
            sendMessage(final, prev).then(updated => setMessages(updated));
            return prev;
          });
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== "no-speech") setError("Mic error: " + e.error);
      setIsListening(false);
      setTranscript("");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
  }, [sendMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const endSession = useCallback(() => {
    recognitionRef.current?.stop();
    setSessionState("ended");
    setIsListening(false);
    setIsSpeaking(false);
  }, []);

  const canTalk = sessionState === "active" && !isThinking && !isSpeaking;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: "var(--card-bg)", borderColor: "var(--divider)" }}
      >
        <button
          onClick={() => router.push("/profile")}
          className="no-min-h w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
          style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="font-bold text-sm" style={{ color: "var(--ink)" }}>Luyện nói với Alex</div>
          <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>Native American English Teacher</div>
        </div>
        {sessionState === "active" && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium" style={{ color: "var(--electric)" }}>Đang kết nối</span>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-6 gap-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center text-5xl transition-all duration-200"
            style={{
              background: isSpeaking ? "var(--green-subtle)" : "var(--card-bg)",
              border: `3px solid ${isSpeaking ? "var(--electric)" : "var(--card-border)"}`,
              boxShadow: isSpeaking ? "0 0 24px rgba(34,197,94,0.3)" : "0 4px 20px rgba(0,0,0,0.15)",
              transform: isSpeaking ? "scale(1.05)" : "scale(1)",
            }}
          >
            {AVATAR_FRAMES[avatarFrame]}
          </div>
          <div className="text-center">
            <div className="font-bold text-base" style={{ color: "var(--ink)" }}>Alex</div>
            <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {isThinking ? "Đang suy nghĩ..." : isSpeaking ? "Đang nói..." : sessionState === "active" ? "Sẵn sàng nghe" : "American English Teacher"}
            </div>
          </div>
        </div>

        {/* Conversation */}
        {messages.length > 0 && (
          <div
            className="rounded-2xl p-4 flex flex-col gap-3 overflow-y-auto"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", maxHeight: "280px" }}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                  style={m.role === "user"
                    ? { background: "var(--electric)", color: "#fff", borderBottomRightRadius: "4px" }
                    : { background: "var(--hover-bg)", color: "var(--ink)", borderBottomLeftRadius: "4px" }
                  }
                >
                  {m.content}
                  {m.role === "assistant" && (
                    <button
                      onClick={() => speakText(m.content)}
                      className="ml-2 opacity-50 hover:opacity-100 inline-flex"
                    >
                      <Volume2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-2xl" style={{ background: "var(--hover-bg)" }}>
                  <Loader2 size={14} className="animate-spin" style={{ color: "var(--ink-soft)" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Transcript preview */}
        {isListening && (
          <div
            className="rounded-xl px-4 py-3 text-center text-sm animate-pulse"
            style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
          >
            {transcript || "Đang nghe... hãy nói tiếng Anh"}
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 text-center text-sm"
            style={{ background: "var(--error-soft)", color: "var(--error)" }}
          >
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 mt-auto">
          {sessionState === "idle" && (
            <button
              onClick={startSession}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base transition-all active:scale-95"
              style={{ background: "var(--electric)", color: "#fff", boxShadow: "0 4px 20px rgba(34,197,94,0.4)" }}
            >
              <Phone size={20} />
              Bắt đầu luyện nói
            </button>
          )}

          {sessionState === "connecting" && (
            <div className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base"
              style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}>
              <Loader2 size={20} className="animate-spin" />
              Đang kết nối...
            </div>
          )}

          {sessionState === "active" && (
            <div className="flex items-center gap-4">
              {/* Mic button */}
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onTouchStart={(e) => { e.preventDefault(); startListening(); }}
                onTouchEnd={(e) => { e.preventDefault(); stopListening(); }}
                disabled={!canTalk}
                className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background: isListening ? "var(--electric)" : "var(--card-bg)",
                  border: `3px solid ${isListening ? "var(--electric)" : "var(--card-border)"}`,
                  boxShadow: isListening ? "0 0 32px rgba(34,197,94,0.5)" : "0 4px 20px rgba(0,0,0,0.15)",
                  color: isListening ? "#fff" : "var(--ink)",
                }}
              >
                {isListening ? <Mic size={32} /> : <MicOff size={28} />}
              </button>

              {/* End call */}
              <button
                onClick={endSession}
                className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95"
                style={{ background: "var(--error)", color: "#fff", boxShadow: "0 4px 16px rgba(239,68,68,0.4)" }}
              >
                <PhoneOff size={22} />
              </button>
            </div>
          )}

          {sessionState === "active" && (
            <p className="text-xs text-center" style={{ color: "var(--ink-soft)" }}>
              {isListening ? "Thả để gửi" : canTalk ? "Giữ nút mic để nói" : "Chờ Alex trả lời..."}
            </p>
          )}

          {sessionState === "ended" && (
            <div className="flex flex-col items-center gap-3">
              <div className="text-2xl">🎉</div>
              <div className="font-bold text-base" style={{ color: "var(--ink)" }}>Buổi luyện tập hoàn thành!</div>
              <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {messages.filter(m => m.role === "user").length} lượt nói
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => { setSessionState("idle"); setMessages([]); }}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "var(--electric)", color: "#fff" }}
                >
                  Luyện tiếp
                </button>
                <button
                  onClick={() => router.push("/profile")}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                  style={{ background: "var(--hover-bg)", color: "var(--ink)" }}
                >
                  Về profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
