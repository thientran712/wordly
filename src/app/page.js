"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { 
  ArrowRight, Sparkles, Brain, Mail, BarChart3, Zap, 
  CheckCircle, Star, BookOpen, Target, Clock, Globe, 
  ChevronDown, Volume2
} from "lucide-react";

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      {/* Sticky Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'py-2' : 'py-4'
      }`}>
        <div className={`max-w-6xl mx-auto px-4 sm:px-6 transition-all duration-300 ${
          scrolled ? 'bg-white/80 backdrop-blur-xl rounded-2xl mx-3 sm:mx-auto shadow-lg' : ''
        }`}>
          <div className="flex justify-between items-center py-3 px-3 sm:px-4">
            <Link href="/" className="flex items-center gap-2 sm:gap-3">
              <div 
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl shadow-[0_4px_16px_rgba(255,92,138,0.35)] transition-transform hover:rotate-12"
                style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)', transform: 'rotate(-5deg)' }}
              >
                🌈
              </div>
              <span className="font-serif font-black text-xl sm:text-2xl gradient-text-purple-pink tracking-tight">
                Wordly
              </span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <Link 
                href="/login"
                className="hidden sm:inline-block px-4 py-2 text-sm font-bold text-[--ink-soft] hover:text-[--electric] transition-colors"
              >
                Sign in
              </Link>
              <Link 
                href="/signup"
                className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-white font-bold text-xs sm:text-sm cursor-pointer transition-all hover:-translate-y-0.5"
                style={{ 
                  background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
                  boxShadow: '0 8px 20px rgba(255, 92, 138, 0.25)'
                }}
              >
                Get started <ArrowRight size={14} className="inline ml-1" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-24 sm:pt-32">
        {/* HERO SECTION */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 text-center pb-16 sm:pb-24">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6 animate-fade-in"
            style={{ background: 'linear-gradient(135deg, #DCC9FF, #FFC1D8)' }}
          >
            <Sparkles size={14} className="text-[--electric]" />
            <span className="font-bold text-xs sm:text-sm text-[--electric]">
              Powered by FSRS Algorithm
            </span>
          </div>

          <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-6 animate-fade-in">
            Master English vocabulary,{" "}
            <em className="italic" style={{ background: 'linear-gradient(135deg, #FF5C8A, #FFB627)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              one word a day
            </em>
          </h1>

          <p className="text-base sm:text-xl text-[--ink-soft] max-w-2xl mx-auto mb-8 leading-relaxed animate-fade-in">
            Learn 4,900+ Oxford words with science-backed spaced repetition.
            Smart, fun, and just 5 minutes a day.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-8 animate-fade-in">
            <Link 
              href="/signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full text-white font-bold text-base cursor-pointer transition-all hover:-translate-y-0.5 hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
                boxShadow: '0 12px 32px rgba(255, 92, 138, 0.25)'
              }}
            >
              Start learning free <ArrowRight size={18} />
            </Link>
            <Link 
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white border-2 border-[--line] font-bold text-base text-[--ink] cursor-pointer transition-all hover:border-[--electric] hover:text-[--electric]"
            >
              I have an account
            </Link>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 text-xs sm:text-sm text-[--ink-soft]">
            <div className="flex items-center gap-1.5">
              <CheckCircle size={16} className="text-[--grass]" />
              <span>100% free</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle size={16} className="text-[--grass]" />
              <span>No credit card</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle size={16} className="text-[--grass]" />
              <span>4,900+ Oxford words</span>
            </div>
          </div>
        </section>

        {/* APP PREVIEW */}
        <section className="max-w-5xl mx-auto px-4 sm:px-8 mb-20 sm:mb-32">
          <div className="bg-white rounded-3xl sm:rounded-[40px] p-6 sm:p-12 border-2 border-white animate-fade-in"
            style={{ boxShadow: '0 24px 64px rgba(45, 27, 78, 0.15)' }}
          >
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold mb-4"
                style={{ background: 'linear-gradient(135deg, #DCC9FF, #FFC1D8)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[--hot-pink] animate-pulse-dot"></span>
                <span>WORD OF THE DAY</span>
              </div>
              <h2 className="font-serif font-black tracking-tight gradient-text-word inline-block mb-3"
                style={{ fontSize: 'clamp(48px, 10vw, 96px)' }}
              >
                Resilient
              </h2>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                <span className="font-serif italic text-base sm:text-xl text-[--ink-soft]">/rɪˈzɪliənt/</span>
                <span className="px-2.5 py-1 rounded-full font-bold text-[10px] sm:text-xs uppercase"
                  style={{ background: '#B8F3D2', color: '#00754C' }}
                >adjective</span>
                <span className="px-2.5 py-1 rounded-full font-bold text-[10px] sm:text-xs uppercase"
                  style={{ background: '#DCC9FF', color: '#5B3FBC' }}
                >B2</span>
              </div>
            </div>

            <div className="p-4 sm:p-6 rounded-2xl border-2 mb-3"
              style={{ background: 'linear-gradient(135deg, #FFF1F8, #FFE8F0)', borderColor: '#FFD0E2' }}
            >
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2 text-[--hot-pink]">📖 DEFINITION</div>
              <p className="text-sm sm:text-base font-medium">Able to recover quickly from difficulties; tough.</p>
            </div>
            <div className="p-4 sm:p-6 rounded-2xl border-2"
              style={{ background: 'linear-gradient(135deg, #F0F9FF, #E8F4FE)', borderColor: '#C9E5FB' }}
            >
              <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-2 text-[--ocean]">💬 EXAMPLE</div>
              <p className="text-sm sm:text-base italic">"She remained resilient despite all the setbacks."</p>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="max-w-6xl mx-auto px-4 sm:px-8 mb-20 sm:mb-32">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl sm:text-5xl font-black tracking-tight mb-3">
              Why <em className="italic gradient-text-purple-pink">Wordly</em>?
            </h2>
            <p className="text-base sm:text-lg text-[--ink-soft] max-w-2xl mx-auto">
              Built different. Designed to make you remember words for life.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <FeatureCard
              icon={<Brain size={28} />}
              iconBg="linear-gradient(135deg, #6C5CE7, #FF5C8A)"
              title="Smart Algorithm (FSRS)"
              description="The same algorithm Anki uses. We predict when you'll forget a word and show it just in time."
            />
            <FeatureCard
              icon={<Mail size={28} />}
              iconBg="linear-gradient(135deg, #FF5C8A, #FFB627)"
              title="Daily Email Reminders"
              description="One beautiful email a day with your perfect word. Learn while drinking coffee."
            />
            <FeatureCard
              icon={<BookOpen size={28} />}
              iconBg="linear-gradient(135deg, #00C896, #00B4D8)"
              title="4,900+ Oxford Words"
              description="Curated from Oxford 5000 — the most useful words for English learners worldwide."
            />
            <FeatureCard
              icon={<Volume2 size={28} />}
              iconBg="linear-gradient(135deg, #FFB627, #FF6B47)"
              title="Native Pronunciation"
              description="Hear how words sound. Practice speaking with confidence."
            />
            <FeatureCard
              icon={<BarChart3 size={28} />}
              iconBg="linear-gradient(135deg, #6C5CE7, #00B4D8)"
              title="Track Your Progress"
              description="Beautiful stats. See your retention rate, streaks, and growth over time."
            />
            <FeatureCard
              icon={<Zap size={28} />}
              iconBg="linear-gradient(135deg, #FF5C8A, #00C896)"
              title="Just 5 Minutes a Day"
              description="Tiny daily practice. Massive long-term results. Consistency beats intensity."
            />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="max-w-5xl mx-auto px-4 sm:px-8 mb-20 sm:mb-32">
          <div className="text-center mb-12">
            <h2 className="font-serif text-3xl sm:text-5xl font-black tracking-tight mb-3">
              How it works
            </h2>
            <p className="text-base sm:text-lg text-[--ink-soft]">
              Three simple steps to vocabulary mastery
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <StepCard
              number="1"
              title="Sign up & set your level"
              description="Tell us your English level and goals. Takes 30 seconds."
              color="#FF5C8A"
            />
            <StepCard
              number="2"
              title="Learn 1 word a day"
              description="We send you a beautiful card. Tap Easy, Good, or Hard."
              color="#6C5CE7"
            />
            <StepCard
              number="3"
              title="Master it forever"
              description="Our algorithm reviews at the perfect moment to lock it in."
              color="#00C896"
            />
          </div>
        </section>

        {/* STATS / SOCIAL PROOF */}
        <section className="max-w-5xl mx-auto px-4 sm:px-8 mb-20 sm:mb-32">
          <div className="bg-white rounded-3xl sm:rounded-[40px] p-8 sm:p-12 border-2 border-white"
            style={{ boxShadow: '0 16px 48px rgba(45, 27, 78, 0.10)' }}
          >
            <div className="text-center mb-8">
              <h2 className="font-serif text-2xl sm:text-4xl font-black tracking-tight mb-3">
                The science behind <em className="italic gradient-text-purple-pink">Wordly</em>
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
              <StatBlock value="4,922" label="Oxford words" />
              <StatBlock value="90%" label="Retention rate" />
              <StatBlock value="5 min" label="Per day" />
              <StatBlock value="365" label="Days journey" />
            </div>

            <p className="text-center text-sm sm:text-base text-[--ink-soft] mt-8 max-w-2xl mx-auto">
              Based on <strong>Ebbinghaus's Forgetting Curve</strong> and <strong>FSRS algorithm</strong> — 
              the same science used by Anki, the world's most popular flashcard app with 10M+ users.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-4 sm:px-8 mb-20 sm:mb-32">
          <div className="text-center mb-10">
            <h2 className="font-serif text-3xl sm:text-5xl font-black tracking-tight mb-3">
              Common questions
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <FaqItem
                key={i}
                question={faq.question}
                answer={faq.answer}
                isOpen={openFaq === i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="max-w-4xl mx-auto px-4 sm:px-8 mb-16 sm:mb-24">
          <div className="rounded-3xl sm:rounded-[40px] p-8 sm:p-16 text-center text-white relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7, #FFB627)' }}
          >
            <div className="text-5xl sm:text-7xl mb-4">🚀</div>
            <h2 className="font-serif text-3xl sm:text-5xl font-black tracking-tight mb-4">
              Ready to start learning?
            </h2>
            <p className="text-sm sm:text-lg opacity-90 mb-8 max-w-xl mx-auto">
              Join thousands of learners. Master English vocabulary. 5 minutes a day.
            </p>

            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white rounded-full font-bold text-base text-[--hot-pink] cursor-pointer transition-all hover:-translate-y-0.5 hover:scale-105"
              style={{ boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15)' }}
            >
              Get started free <ArrowRight size={18} />
            </Link>

            <p className="text-xs sm:text-sm opacity-70 mt-4">No credit card • 100% free • Unlimited access</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-[--line] py-8 sm:py-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)', transform: 'rotate(-5deg)' }}
              >
                🌈
              </div>
              <span className="font-serif font-bold gradient-text-purple-pink">Wordly</span>
            </div>
            <p className="text-xs sm:text-sm text-[--ink-soft]">
              © 2026 Wordly · Made with 💖 in Vietnam
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}

function FeatureCard({ icon, iconBg, title, description }) {
  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white transition-all hover:scale-[1.02] hover:-translate-y-1"
      style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
    >
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4"
        style={{ background: iconBg, boxShadow: `0 8px 20px ${iconBg.match(/#[A-F0-9]{6}/i)?.[0] || '#FF5C8A'}25` }}
      >
        {icon}
      </div>
      <h3 className="font-serif font-bold text-lg sm:text-xl mb-2">{title}</h3>
      <p className="text-sm sm:text-base text-[--ink-soft] leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description, color }) {
  return (
    <div className="text-center relative">
      <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 rounded-3xl flex items-center justify-center text-white font-serif font-black text-2xl sm:text-3xl shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
        style={{ background: color }}
      >
        {number}
      </div>
      <h3 className="font-serif font-bold text-lg sm:text-xl mb-2">{title}</h3>
      <p className="text-sm sm:text-base text-[--ink-soft] leading-relaxed">{description}</p>
    </div>
  );
}

function StatBlock({ value, label }) {
  return (
    <div className="text-center">
      <div className="font-serif font-black gradient-text-purple-pink text-3xl sm:text-5xl mb-1">
        {value}
      </div>
      <div className="text-xs sm:text-sm text-[--ink-soft] uppercase tracking-wider font-bold">
        {label}
      </div>
    </div>
  );
}

function FaqItem({ question, answer, isOpen, onClick }) {
  return (
    <div 
      className={`bg-white rounded-2xl border-2 transition-all overflow-hidden ${
        isOpen ? 'border-[--electric]' : 'border-white'
      }`}
      style={{ boxShadow: '0 4px 16px rgba(108, 92, 231, 0.06)' }}
    >
      <button
        onClick={onClick}
        className="w-full px-5 sm:px-6 py-4 sm:py-5 text-left font-bold text-sm sm:text-base flex justify-between items-center gap-3 cursor-pointer"
      >
        <span>{question}</span>
        <ChevronDown 
          size={20} 
          className={`flex-shrink-0 transition-transform text-[--electric] ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-5 sm:px-6 pb-5 text-sm sm:text-base text-[--ink-soft] leading-relaxed animate-fade-in">
          {answer}
        </div>
      )}
    </div>
  );
}

const FAQS = [
  {
    question: "Is Wordly really free?",
    answer: "Yes! 100% free. No credit card required. We believe everyone deserves access to great learning tools.",
  },
  {
    question: "How is Wordly different from Duolingo or Quizlet?",
    answer: "We focus on one thing: vocabulary mastery using FSRS — the most advanced spaced repetition algorithm available today. Unlike gamification-heavy apps, we use science to maximize retention.",
  },
  {
    question: "How many words will I learn?",
    answer: "Our database has 4,922 carefully curated Oxford words covering A1 to C2 levels. Learning just 1 word a day gives you 365 words a year — enough to handle 80% of everyday English conversations.",
  },
  {
    question: "What is FSRS algorithm?",
    answer: "FSRS (Free Spaced Repetition Scheduler) is the most accurate algorithm available for predicting when you'll forget something. Instead of fixed intervals, it adapts to your personal memory — showing each word at the perfect moment.",
  },
  {
    question: "Can I use Wordly on my phone?",
    answer: "Yes! Wordly works beautifully on iPhone, Android, and any web browser. Just open the app in your browser and start learning.",
  },
  {
    question: "Will I receive too many emails?",
    answer: "You control the frequency. Set it to daily, weekdays only, or specific days you choose. One email at the time you pick. That's it.",
  },
];
