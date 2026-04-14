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
    <div className="rounded-[12px] border border-blue-500/30 backdrop-blur overflow-hidden" style={{ background: 'rgba(30,41,59,0.6)' }}>
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2 className="text-lg font-semibold" style={{ color: '#f8fafc' }}>CS 응대 스크립트</h2>
        <div className="flex items-center gap-2">
        {onChange && (
          <button
            onClick={() => setEditing((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-lg border"
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.5)', color: '#cbd5e1' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.7)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.5)'; }}
          >
            {editing ? '완료' : '✏️ 수정'}
          </button>
        )}
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border
            ${copied
              ? 'bg-green-900/30 text-green-400 border-green-400/30'
              : ''
            }`}
          style={copied ? undefined : { background: 'rgba(15,23,42,0.5)', color: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)' }}
          onMouseEnter={copied ? undefined : (e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.7)'; }}
          onMouseLeave={copied ? undefined : (e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.5)'; }}
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
            rows={5}
            className="w-full px-3 py-2.5 border rounded-lg text-[15px] leading-8"
            style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(15,23,42,0.5)', color: '#ffffff' }}
          />
        ) : (
          <p className="text-[15px] leading-8 whitespace-pre-wrap" style={{ color: '#ffffff' }}>{script}</p>
        )}
      </div>
    </div>
  );
}
