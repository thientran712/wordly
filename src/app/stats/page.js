"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Target, TrendingUp, Flame, Brain, BarChart3 } from "lucide-react";

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Stats error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <main className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce-soft">📊</div>
            <p className="text-xl font-semibold gradient-text-purple-pink">Loading stats...</p>
          </div>
        </main>
      </>
    );
  }

  if (!stats) {
    return <div>Error loading stats</div>;
  }

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/learn")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/50 transition-all"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            📊 Your Stats
          </h1>
          <div className="w-20"></div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <StatCard
            icon={<Brain size={24} />}
            label="Total Words"
            value={stats.overview.total_words}
            color="#6C5CE7"
            bgColor="#EFEAFE"
          />
          <StatCard
            icon={<Target size={24} />}
            label="Mastered"
            value={stats.overview.mastered}
            color="#00C896"
            bgColor="#E0FBE8"
            description="30+ days"
          />
          <StatCard
            icon={<TrendingUp size={24} />}
            label="Learning"
            value={stats.overview.learning}
            color="#FF5C8A"
            bgColor="#FFE8EE"
          />
          <StatCard
            icon={<Flame size={24} />}
            label="Due Now"
            value={stats.overview.due_now}
            color="#FF6B47"
            bgColor="#FFE9DD"
          />
        </div>

        {/* Retention Rate */}
        <div 
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
              style={{ background: 'linear-gradient(135deg, #00C896, #B8F3D2)' }}
            >
              <Target size={22} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold">Retention Rate</h2>
              <p className="text-sm text-[--ink-soft]">Last 30 days</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-5xl font-black gradient-text-purple-pink">
              {(stats.metrics.retention_rate * 100).toFixed(0)}%
            </div>
            <div className="flex-1">
              <div className="h-3 rounded-full bg-[--whisper] overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${stats.metrics.retention_rate * 100}%`,
                    background: stats.metrics.retention_rate > 0.85 
                      ? 'linear-gradient(90deg, #00C896, #B8F3D2)'
                      : stats.metrics.retention_rate > 0.70
                      ? 'linear-gradient(90deg, #FFB627, #FFE9A8)'
                      : 'linear-gradient(90deg, #FF5C8A, #FFC1D8)'
                  }}
                ></div>
              </div>
              <p className="text-xs text-[--ink-soft] mt-2">
                {stats.metrics.retention_rate > 0.85 
                  ? '🚀 Excellent! Your brain is on fire'
                  : stats.metrics.retention_rate > 0.70
                  ? '👍 Good. Aim for 85%+'
                  : '💪 Keep going! Practice consistency'}
              </p>
            </div>
          </div>
        </div>

        {/* Daily Activity Heatmap */}
        <div 
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
              style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)' }}
            >
              <BarChart3 size={22} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold">Activity Heatmap</h2>
              <p className="text-sm text-[--ink-soft]">Last 30 days</p>
            </div>
          </div>
          
          <ActivityHeatmap activity={stats.daily_activity} />
        </div>

        {/* Word distribution */}
        <div 
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <h2 className="font-serif text-xl font-bold mb-4">📚 Word Distribution</h2>
          <div className="space-y-3">
            <DistributionBar 
              label="🌱 New" 
              count={stats.by_state.new} 
              total={stats.overview.total_words}
              color="#B8E8C9"
            />
            <DistributionBar 
              label="🌿 Learning" 
              count={stats.by_state.learning} 
              total={stats.overview.total_words}
              color="#FFD0E2"
            />
            <DistributionBar 
              label="🌳 Review" 
              count={stats.by_state.review} 
              total={stats.overview.total_words}
              color="#DCC9FF"
            />
            <DistributionBar 
              label="🔁 Relearning" 
              count={stats.by_state.relearning} 
              total={stats.overview.total_words}
              color="#FFE9A8"
            />
            <DistributionBar 
              label="🏆 Mastered" 
              count={stats.by_state.mastered} 
              total={stats.overview.total_words}
              color="#B8F3D2"
            />
          </div>
          
          {stats.metrics.avg_stability > 0 && (
            <div className="mt-6 pt-6 border-t border-[--line] grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[--ink-soft] mb-1">AVG STABILITY</div>
                <div className="font-bold text-lg">
                  {stats.metrics.avg_stability.toFixed(1)} days
                </div>
              </div>
              <div>
                <div className="text-xs text-[--ink-soft] mb-1">TOTAL REVIEWS (30D)</div>
                <div className="font-bold text-lg">
                  {stats.metrics.total_reviews_30d}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function StatCard({ icon, label, value, color, bgColor, description }) {
  return (
    <div 
      className="p-4 rounded-2xl border-2"
      style={{ background: bgColor, borderColor: bgColor }}
    >
      <div className="flex items-center justify-between mb-2">
        <div style={{ color }}>{icon}</div>
      </div>
      <div className="text-3xl font-black mb-1" style={{ color }}>
        {value}
      </div>
      <div className="text-xs font-semibold text-[--ink-soft]">{label}</div>
      {description && (
        <div className="text-[10px] text-[--ink-soft] opacity-60 mt-1">{description}</div>
      )}
    </div>
  );
}

function DistributionBar({ label, count, total, color }) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold mb-1">
        <span>{label}</span>
        <span className="text-[--ink-soft]">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-[--whisper] overflow-hidden">
        <div 
          className="h-full rounded-full transition-all"
          style={{ width: `${percent}%`, background: color }}
        ></div>
      </div>
    </div>
  );
}

function ActivityHeatmap({ activity }) {
  const days = [];
  const today = new Date();
  
  // Last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      day: date.getDate(),
      count: activity[dateStr]?.total || 0,
    });
  }
  
  const max = Math.max(...days.map(d => d.count), 1);
  
  const getColor = (count) => {
    if (count === 0) return '#F0EDFC';
    const intensity = count / max;
    if (intensity < 0.25) return '#DCC9FF';
    if (intensity < 0.5) return '#A98BFB';
    if (intensity < 0.75) return '#7A5BF3';
    return '#6C5CE7';
  };
  
  return (
    <div className="grid grid-cols-10 gap-1.5">
      {days.map((d, i) => (
        <div
          key={i}
          className="aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold transition-all hover:scale-110 cursor-default"
          style={{ 
            background: getColor(d.count),
            color: d.count > max * 0.5 ? 'white' : '#5D4B7B'
          }}
          title={`${d.date}: ${d.count} reviews`}
        >
          {d.day}
        </div>
      ))}
    </div>
  );
}
