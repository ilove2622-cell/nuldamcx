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
    <div className="bg-[rgba(30,41,59,0.6)] backdrop-blur rounded-[12px] border border-white/[0.08] p-6 space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-base font-semibold text-[#f8fafc]">
          📥 과거 사례 일괄 등록 (CSV/Excel)
        </h2>
        <span className="text-[#94a3b8] text-sm">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="space-y-3 pt-2 border-t border-white/[0.08]">
          <p className="text-xs text-[#94a3b8] leading-relaxed">
            CSV 또는 Excel(.xlsx) 파일을 업로드하면 DB에 일괄 등록됩니다.
            <br />
            <strong>필수 컬럼:</strong> 이물질종류, 특징, CS스크립트
            <br />
            <strong>선택 컬럼:</strong> 제품명, 위험도(low/medium/high 또는 낮음/보통/높음),
            위험근거, 추정원인, 권장조치(줄바꿈/세미콜론/| 구분)
            <br />
            <strong>📷 이미지:</strong> Excel(.xlsx)의 경우 셀에 직접 삽입한 사진이 해당 행과 자동 매칭됩니다.
          </p>

          <a
            href="/sample-import.csv"
            download
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline"
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
            className="block w-full text-sm text-[#cbd5e1]
              file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-medium
              file:bg-blue-500/10 file:text-blue-400
              hover:file:bg-blue-500/20 disabled:opacity-50"
          />

          {loading && (
            <p className="text-sm text-[#94a3b8]">⏳ 업로드 처리 중…</p>
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
                <div className="mt-3 space-y-2 text-xs text-[#cbd5e1] bg-[rgba(15,23,42,0.5)] rounded p-2 border border-white/[0.08]">
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
