"use client";

export default function StatsBar({ streak, learned, todayNum, emailEnabled }) {
  const stats = [
    { 
      key: 'streak',
      icon: '🔥', 
      value: streak, 
      label: 'Ngày liên tiếp',
      iconBg: 'linear-gradient(135deg, #FFD8C9, #FFB4A8)',
      blobColor: '#FFD8C9',
      valueColor: 'text-[--tomato]'
    },
    { 
      key: 'learned',
      icon: '📚', 
      value: learned, 
      label: 'Đã học',
      iconBg: 'linear-gradient(135deg, #DCC9FF, #6C5CE7)',
      blobColor: '#DCC9FF',
      valueColor: 'text-[--electric]'
    },
    { 
      key: 'today',
      icon: '⭐', 
      value: todayNum, 
      label: 'Hôm nay',
      iconBg: 'linear-gradient(135deg, #B8F3D2, #00C896)',
      blobColor: '#B8F3D2',
      valueColor: 'text-[--grass]'
    },
    { 
      key: 'email',
      icon: '✉️', 
      value: emailEnabled ? 'ON' : 'OFF', 
      label: 'Email',
      iconBg: 'linear-gradient(135deg, #FFE9A8, #FFB627)',
      blobColor: '#FFE9A8',
      valueColor: 'text-[--sunshine]',
      smaller: true
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((s) => (
        <div 
          key={s.key}
          className="bg-white p-5 rounded-3xl border-2 border-white relative overflow-hidden transition-all hover:-translate-y-1"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <div 
            className="absolute -top-5 -right-5 w-20 h-20 rounded-full opacity-50"
            style={{ background: s.blobColor }}
          />
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 relative z-10"
            style={{ background: s.iconBg }}
          >
            {s.icon}
          </div>
          <div 
            className={`font-serif font-black leading-none mb-1 relative z-10 ${s.valueColor} ${s.smaller ? 'text-2xl pt-1.5' : 'text-3xl'}`}
          >
            {s.value}
          </div>
          <div className="text-xs font-semibold text-[--ink-soft] relative z-10">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
