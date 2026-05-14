"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    skill_level: '',
    learning_goal: '',
    daily_goal: 5,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const steps = [
    {
      title: "What's your English level?",
      subtitle: "Be honest — we'll pick words just right for you",
      field: 'skill_level',
      options: [
        { value: 'A1', label: 'Beginner', desc: 'I know hello, thank you, simple words' },
        { value: 'A2', label: 'Elementary', desc: 'Basic conversations, common topics' },
        { value: 'B1', label: 'Intermediate', desc: 'Discuss familiar matters' },
        { value: 'B2', label: 'Upper-Intermediate', desc: 'Fluent in most situations' },
        { value: 'C1', label: 'Advanced', desc: 'Express ideas fluently' },
        { value: 'C2', label: 'Proficient', desc: 'Near-native level' },
      ],
    },
    {
      title: "What's your goal?",
      subtitle: "We'll tailor your daily words",
      field: 'learning_goal',
      options: [
        { value: 'daily', label: '💬 Daily Life', desc: 'Conversational English' },
        { value: 'toeic', label: '📊 TOEIC', desc: 'Business test prep' },
        { value: 'ielts', label: '🎓 IELTS', desc: 'Academic English' },
        { value: 'business', label: '💼 Business', desc: 'Workplace vocabulary' },
        { value: 'travel', label: '✈️ Travel', desc: 'Vocabulary for trips' },
      ],
    },
    {
      title: "How many words per day?",
      subtitle: "Consistency > quantity. Start small!",
      field: 'daily_goal',
      options: [
        { value: 3, label: '3 words', desc: 'Casual learning, 5 min/day' },
        { value: 5, label: '5 words', desc: 'Recommended for most users' },
        { value: 10, label: '10 words', desc: 'Serious learner' },
        { value: 20, label: '20 words', desc: 'Intensive study' },
      ],
    },
  ];

  const currentStep = steps[step];

  const handleSelect = (value) => {
    setData(prev => ({ ...prev, [currentStep.field]: value }));
  };

  const handleNext = async () => {
    setError(null);
    
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      setIsLoading(true);
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        
        const result = await res.json();
        
        if (res.ok && result.success) {
          window.location.href = "/";
        } else {
          setError(result.error || "Failed to save");
          setIsLoading(false);
        }
      } catch (e) {
        console.error("Onboarding error:", e);
        setError(e.message);
        setIsLoading(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const isSelected = data[currentStep.field] !== '' && data[currentStep.field] !== 0;

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-8">
        <div 
          className="bg-white rounded-[32px] p-6 sm:p-12 max-w-2xl w-full border-[3px] border-white animate-fade-in"
          style={{ boxShadow: '0 20px 48px rgba(45, 27, 78, 0.12)' }}
        >
          <div className="flex gap-2 justify-center mb-6 sm:mb-8">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === step 
                    ? 'w-8 bg-[--hot-pink]' 
                    : i < step 
                    ? 'w-2 bg-[--grass]' 
                    : 'w-2 bg-[--line]'
                }`}
              />
            ))}
          </div>

          <div className="text-center mb-6 sm:mb-8">
            <h1 className="font-serif text-2xl sm:text-4xl font-bold tracking-tight mb-2">
              {currentStep.title}
            </h1>
            <p className="text-sm sm:text-base text-[--ink-soft]">{currentStep.subtitle}</p>
          </div>

          <div className={`grid gap-3 mb-6 sm:mb-8 ${
            currentStep.options.length <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'
          }`}>
            {currentStep.options.map((opt) => {
              const selected = data[currentStep.field] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className="text-left p-3 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer hover:scale-[1.02] relative"
                  style={{
                    background: selected ? 'linear-gradient(135deg, #FFF1F8, #FFE8F0)' : 'white',
                    borderColor: selected ? '#FF5C8A' : '#E8DFF5',
                    boxShadow: selected ? '0 8px 20px rgba(255, 92, 138, 0.18)' : 'none',
                  }}
                >
                  {selected && (
                    <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[--hot-pink] flex items-center justify-center text-white">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  )}
                  <div className="font-bold text-sm sm:text-lg mb-1">{opt.label}</div>
                  <div className="text-xs sm:text-sm text-[--ink-soft]">{opt.desc}</div>
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-sm text-[#B83426]">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-3 justify-between items-center">
            <button
              onClick={handleBack}
              disabled={step === 0}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-bold text-sm cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[--whisper]"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Back</span>
            </button>

            <span className="text-xs text-[--ink-soft]">
              Step {step + 1} of {steps.length}
            </span>

            <button
              onClick={handleNext}
              disabled={!isSelected || isLoading}
              className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-white font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
                boxShadow: '0 12px 32px rgba(255, 92, 138, 0.25)',
              }}
            >
              {isLoading ? 'Saving...' : step === steps.length - 1 ? '🚀 Start Learning' : 'Next'}
              {!isLoading && step < steps.length - 1 && <ArrowRight size={18} />}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
