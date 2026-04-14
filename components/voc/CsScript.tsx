'use client';

import { useState } from 'react';

interface Props {
  script: string;
  onChange?: (script: string) => void;
}

export default function CsScript({ script, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = script;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-[12px] border border-blue-500/30 bg-[rgba(30,41,59,0.6)] backdrop-blur overflow-hidden">
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#f8fafc]">CS 응대 스크립트</h2>
        <div className="flex items-center gap-2">
        {onChange && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-lg border border-white/[0.1] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(15,23,42,0.7)] text-[#cbd5e1]"
          >
            {editing ? '완료' : '✏️ 수정'}
          </button>
        )}
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${copied
              ? 'bg-green-900/30 text-green-400 border border-green-400/30'
              : 'bg-[rgba(15,23,42,0.5)] text-[#cbd5e1] border border-white/[0.1] hover:bg-[rgba(15,23,42,0.7)]'
            }`}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              복사됨
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              복사
            </>
          )}
        </button>
        </div>
      </div>
      <div className="p-5">
        {editing ? (
          <textarea
            value={script}
            onChange={(e) => onChange?.(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-white/[0.1] rounded-lg text-sm leading-relaxed bg-[rgba(15,23,42,0.5)] text-[#f8fafc]"
          />
        ) : (
          <p className="text-sm text-[#f8fafc] leading-relaxed whitespace-pre-wrap">{script}</p>
        )}
      </div>
    </div>
  );
}
