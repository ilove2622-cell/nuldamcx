'use client';

import { useState } from 'react';
import type { SimilarCase } from '@/types/voc';

interface Props {
  cases: SimilarCase[];
}

const riskLabel: Record<string, { text: string; color: string; style?: React.CSSProperties }> = {
  low:    { text: '낮음', color: 'bg-green-900/30 text-green-400' },
  medium: { text: '보통', color: 'bg-yellow-900/30 text-yellow-400' },
  high:   { text: '높음', color: 'bg-red-900/30 text-red-400' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

// base64에 mime 프리픽스 자동 추가 (이미 있으면 그대로)
function toImgSrc(b64: string): string {
  if (b64.startsWith('data:')) return b64;
  // jpg/png 둘 다 브라우저가 자동 디코딩 — jpeg로 통일
  return `data:image/jpeg;base64,${b64}`;
}

export default function SimilarCases({ cases }: Props) {
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [zoomLoading, setZoomLoading] = useState(false);

  // 썸네일 클릭 → /api/voc/cases/[id]/image 에서 원본 가져와 확대
  const openZoom = async (caseId: number, fallbackThumb: string) => {
    setZoomSrc(fallbackThumb); // 즉시 썸네일이라도 띄움
    setZoomLoading(true);
    try {
      const res = await fetch(`/api/voc/cases/${caseId}/image`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.imageBase64) {
        setZoomSrc(toImgSrc(json.imageBase64));
      }
    } catch {
      /* 실패해도 썸네일은 떠있음 */
    } finally {
      setZoomLoading(false);
    }
  };

  if (!cases || cases.length === 0) return null;

  return (
    <>
      <div
        className="backdrop-blur rounded-[12px] border p-6 space-y-4"
        style={{ background: 'rgba(30,41,59,0.6)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: '#f8fafc' }}>
          📋 유사 과거 사례 {cases.length}건
        </h2>
        <div className="space-y-3">
          {cases.map((c) => {
            const risk = riskLabel[c.riskLevel] ?? { text: c.riskLevel, color: 'bg-slate-700/50', style: { color: '#cbd5e1' } };
            const thumbSrc = c.imageThumbnail ? toImgSrc(c.imageThumbnail) : null;
            return (
              <div
                key={c.id}
                className="border rounded-lg p-4 transition-colors flex gap-4"
                style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.5)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.7)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.5)'; }}
              >
                {/* 썸네일 */}
                {thumbSrc ? (
                  <button
                    type="button"
                    onClick={() => openZoom(c.id, thumbSrc)}
                    className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border bg-transparent p-0 cursor-zoom-in transition-transform hover:scale-105"
                    style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                    aria-label="사진 확대 보기"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc} alt={c.substanceType} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div
                    className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg border flex items-center justify-center text-xs"
                    style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.3)', color: '#64748b' }}
                  >
                    사진 없음
                  </div>
                )}

                {/* 본문 */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: '#f8fafc' }}>
                      {c.substanceType}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${risk.color}`}
                      style={risk.style}
                    >
                      위험도 {risk.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: '#94a3b8' }}>
                    <span>📅 {formatDate(c.createdAt)}</span>
                    {c.productName && <span>📦 {c.productName}</span>}
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: '#cbd5e1' }}>{c.characteristics}</p>
                  {c.csScript && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <p className="text-[11px] font-medium text-blue-400 mb-1">💬 CS 응대 스크립트</p>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap line-clamp-4" style={{ color: '#cbd5e1' }}>
                        {c.csScript}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 이미지 확대 모달 */}
      {zoomSrc && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomSrc(null)}
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4 cursor-zoom-out"
          style={{ background: 'rgba(0,0,0,0.85)' }}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomSrc}
              alt="확대 보기"
              className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
            />
            {zoomLoading && (
              <div
                className="absolute inset-0 flex items-center justify-center rounded-lg"
                style={{ background: 'rgba(0,0,0,0.4)' }}
              >
                <span className="text-white text-sm font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(15,23,42,0.8)' }}>
                  원본 불러오는 중…
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setZoomSrc(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold border"
            style={{ background: 'rgba(15,23,42,0.8)', borderColor: 'rgba(255,255,255,0.2)' }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
