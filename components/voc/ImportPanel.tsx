'use client';

import { useState, useRef } from 'react';

interface ImportResult {
  success: boolean;
  inserted?: number;
  withImage?: number;
  error?: string;
  diagnostics?: {
    headers?: string[];
    firstRowSample?: Record<string, string> | null;
    totalRows?: number;
    recognizedRows?: number;
    requiredColumns?: string[];
    message?: string;
  };
}

export default function ImportPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/voc/import', { method: 'POST', body: fd });
      const json: ImportResult = await res.json();
      setResult(json);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : '업로드 실패',
      });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      className="backdrop-blur rounded-[12px] border px-7 py-6 space-y-3"
      style={{ background: 'rgba(30,41,59,0.6)', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
        style={{ color: '#ffffff' }}
      >
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2" style={{ color: '#ffffff' }}>
          <span
            className="inline-block w-1 h-5 rounded-sm"
            style={{ background: '#60a5fa' }}
            aria-hidden
          />
          📥 과거 사례 일괄 등록 (CSV/Excel)
        </h2>
        <span className="text-sm font-medium" style={{ color: '#cbd5e1' }}>{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="space-y-4 pt-4 mt-2 border-t pl-3" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
          <div className="text-[13px] leading-7 space-y-1.5" style={{ color: '#e2e8f0' }}>
            <p>CSV 또는 Excel(.xlsx) 파일을 업로드하면 DB에 일괄 등록됩니다.</p>
            <p>
              <strong style={{ color: '#ffffff' }}>필수 컬럼:</strong> 이물질종류, 특징, CS스크립트
            </p>
            <p>
              <strong style={{ color: '#ffffff' }}>선택 컬럼:</strong> 제품명, 위험도(low/medium/high 또는 낮음/보통/높음),
              위험근거, 추정원인, 권장조치(줄바꿈/세미콜론/| 구분)
            </p>
            <p>
              <strong style={{ color: '#ffffff' }}>📷 이미지:</strong> Excel(.xlsx)의 경우 셀에 직접 삽입한 사진이 해당 행과 자동 매칭됩니다.
            </p>
          </div>

          <a
            href="/sample-import.csv"
            download
            className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            style={{ color: '#60a5fa' }}
          >
            ⬇️ 샘플 파일 다운로드 (sample-import.csv)
          </a>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={loading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
            className="block w-full text-sm font-medium
              file:mr-3 file:py-2.5 file:px-5 file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-500 file:text-white
              hover:file:bg-blue-600 file:cursor-pointer
              disabled:opacity-50"
            style={{ color: '#f1f5f9' }}
          />

          {loading && (
            <p className="text-sm" style={{ color: '#94a3b8' }}>⏳ 업로드 처리 중…</p>
          )}

          {result && result.success && (
            <div
              className={`border rounded-lg p-3 text-sm ${
                result.inserted! > 0
                  ? 'bg-green-500/10 border-green-400/30'
                  : 'bg-yellow-500/10 border-yellow-400/30'
              }`}
            >
              <p
                className={`font-medium ${
                  result.inserted! > 0 ? 'text-green-400' : 'text-yellow-400'
                }`}
              >
                {result.inserted! > 0 ? '✅' : '⚠️'} 등록 완료: {result.inserted}건
              </p>
              {result.withImage! > 0 && (
                <p className="text-xs text-green-400 mt-1">
                  이미지 첨부: {result.withImage}건
                </p>
              )}
              {result.diagnostics?.message && (
                <p className="text-xs text-yellow-400 mt-2">{result.diagnostics.message}</p>
              )}
              {result.diagnostics && result.inserted === 0 && (
                <div
                  className="mt-3 space-y-2 text-xs rounded p-2 border"
                  style={{ color: '#cbd5e1', background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <div>
                    <strong>감지된 헤더 ({result.diagnostics.headers?.length ?? 0}개):</strong>
                    <div className="font-mono mt-1 break-all">
                      {result.diagnostics.headers?.join(' | ') || '(없음)'}
                    </div>
                  </div>
                  <div>
                    <strong>전체 행 수:</strong> {result.diagnostics.totalRows} /
                    <strong> 인식된 행:</strong> {result.diagnostics.recognizedRows}
                  </div>
                  {result.diagnostics.firstRowSample && (
                    <div>
                      <strong>첫 행 샘플:</strong>
                      <pre className="font-mono text-[10px] mt-1 whitespace-pre-wrap break-all">
                        {JSON.stringify(result.diagnostics.firstRowSample, null, 2)}
                      </pre>
                    </div>
                  )}
                  <div className="text-red-400">
                    <strong>필수 컬럼:</strong> 이물질종류, 특징, CS스크립트
                  </div>
                </div>
              )}
            </div>
          )}

          {result && !result.success && (
            <div className="bg-red-500/10 border border-red-400/30 rounded-lg p-3 text-sm">
              <p className="font-medium text-red-400">❌ 업로드 실패</p>
              <p className="text-xs text-red-400 mt-1">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
