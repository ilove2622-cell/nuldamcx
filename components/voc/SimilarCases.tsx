'use client';

import type { SimilarCase } from '@/types/voc';

interface Props {
  cases: SimilarCase[];
}

const riskLabel: Record<string, { text: string; color: string }> = {
  low:    { text: '낮음', color: 'bg-green-900/30 text-green-400' },
  medium: { text: '보통', color: 'bg-yellow-900/30 text-yellow-400' },
  high:   { text: '높음', color: 'bg-red-900/30 text-red-400' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

export default function SimilarCases({ cases }: Props) {
  if (!cases || cases.length === 0) return null;

  return (
    <div className="bg-[rgba(30,41,59,0.6)] backdrop-blur rounded-[12px] border border-white/[0.08] p-6 space-y-4">
      <h2 className="text-base font-semibold text-[#f8fafc]">
        📋 유사 과거 사례 {cases.length}건
      </h2>
      <div className="space-y-3">
        {cases.map((c) => {
          const risk = riskLabel[c.riskLevel] ?? { text: c.riskLevel, color: 'bg-slate-700/50 text-[#cbd5e1]' };
          return (
            <div key={c.id} className="border border-white/[0.08] rounded-lg p-4 space-y-2 bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(15,23,42,0.7)] transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#f8fafc]">
                  {c.substanceType}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${risk.color}`}>
                  위험도 {risk.text}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#94a3b8]">
                <span>📅 {formatDate(c.createdAt)}</span>
                {c.productName && <span>📦 {c.productName}</span>}
              </div>
              <p className="text-xs text-[#cbd5e1] line-clamp-2">{c.characteristics}</p>
              {c.csScript && (
                <div className="mt-2 pt-2 border-t border-white/[0.08]">
                  <p className="text-[11px] font-medium text-blue-400 mb-1">💬 CS 응대 스크립트</p>
                  <p className="text-xs text-[#cbd5e1] leading-relaxed whitespace-pre-wrap">
                    {c.csScript}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
