'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import DropZone from '@/components/voc/DropZone';
import AnalysisResultCard from '@/components/voc/AnalysisResult';
import CsScript from '@/components/voc/CsScript';
import SimilarCases from '@/components/voc/SimilarCases';
import ImportPanel from '@/components/voc/ImportPanel';
import type { AnalysisResult, SimilarCase } from '@/types/voc';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function VocPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'>('image/jpeg');
  const [productName, setProductName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [similarCases, setSimilarCases] = useState<SimilarCase[]>([]);
  const [savedCaseId, setSavedCaseId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  // 인증 체크
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const allowedEmails = ['cx@joinandjoin.com', 'ilove2622@nuldam.com'];
      if (!session || !allowedEmails.includes(session.user.email || '')) {
        router.replace('/login');
      } else {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const mime = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      setImageBase64(base64);
      setMimeType(mime);
      setResult(null);
      setSimilarCases([]);
      setSavedCaseId(null);
      setSaveMessage(null);
      setError(null);
      setStatus('idle');
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imageBase64) return;
    setStatus('loading');
    setError(null);
    setResult(null);
    setSimilarCases([]);
    setSavedCaseId(null);
    setSaveMessage(null);

    try {
      const res = await fetch('/api/voc/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, productName: productName.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '분석에 실패했습니다.');
      setResult(json.data);
      setSimilarCases(json.similarCases ?? []);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setStatus('error');
    }
  };

  const handleRegenerate = async (substanceTypeHint: string) => {
    if (!imageBase64) return;
    setRegenerating(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/voc/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType, productName: productName.trim() || undefined, substanceTypeHint }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '재분석 실패');
      setResult(json.data);
      setSimilarCases(json.similarCases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '재분석 실패');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const isUpdate = savedCaseId !== null;
      const url = isUpdate ? `/api/voc/cases/${savedCaseId}` : '/api/voc/cases';
      const method = isUpdate ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: productName.trim() || undefined, result, imageBase64: isUpdate ? undefined : imageBase64 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || '저장 실패');
      if (!isUpdate && json.id) setSavedCaseId(json.id);
      setSaveMessage(isUpdate ? '✅ 수정 저장 완료' : '✅ DB에 저장 완료');
    } catch (err) {
      setSaveMessage(`❌ ${err instanceof Error ? err.message : '저장 실패'}`);
    } finally {
      setSaving(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc]">
      {/* 헤더 */}
      <header className="bg-[rgba(15,23,42,0.8)] backdrop-blur-lg border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-[#94a3b8] hover:text-[#f8fafc] text-sm">
              ← 돌아가기
            </button>
            <div className="w-px h-5 bg-white/10" />
            <div>
              <h1 className="text-base font-bold text-[#f8fafc]">이물질 분석 시스템</h1>
              <p className="text-[10px] text-[#64748b]">AI 기반 식품 이물질 분석 및 CS 응대 스크립트 자동 생성</p>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <ImportPanel />

        {/* 업로드 카드 */}
        <div className="bg-slate-800/40 rounded-xl border border-white/5 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-[#f8fafc]">이물질 사진 업로드</h2>

          <DropZone onFileSelect={handleFileSelect} />

          <div>
            <label htmlFor="product-name" className="block text-xs font-medium text-[#94a3b8] mb-1">
              제품명 <span className="text-[#64748b] font-normal">(선택)</span>
            </label>
            <input
              id="product-name"
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="예: 삼다수 2L, 신라면 봉지면 등"
              className="w-full px-3 py-2 bg-[rgba(15,23,42,0.5)] border border-white/10 rounded-lg text-sm text-[#f8fafc] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-[#64748b]"
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!imageBase64 || status === 'loading'}
            className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors
              ${!imageBase64 || status === 'loading'
                ? 'bg-slate-700/50 text-[#64748b] cursor-not-allowed'
                : 'bg-[#3b82f6] text-white hover:bg-[#2563eb] active:bg-blue-800'
              }`}
          >
            {status === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI 분석 중...
              </span>
            ) : 'AI 분석 시작'}
          </button>
        </div>

        {/* 에러 */}
        {status === 'error' && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-400">분석 실패</p>
              <p className="text-sm text-red-300 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* 결과 */}
        {status === 'success' && result && (
          <>
            <AnalysisResultCard
              result={result}
              onChange={setResult}
              onRegenerate={handleRegenerate}
              regenerating={regenerating}
            />
            <SimilarCases cases={similarCases} />
            <CsScript
              script={result.csScript}
              onChange={(s) => setResult({ ...result, csScript: s })}
            />

            {/* 저장 */}
            <div className="bg-slate-800/40 rounded-xl border border-white/5 p-4 flex items-center justify-between gap-3">
              <div className="text-sm">
                {saveMessage ? (
                  <span className={saveMessage.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
                    {saveMessage}
                  </span>
                ) : savedCaseId ? (
                  <span className="text-[#94a3b8]">저장됨 (ID: {savedCaseId}). 수정 후 다시 저장 가능합니다.</span>
                ) : (
                  <span className="text-[#94a3b8]">검토 후 DB에 저장하세요.</span>
                )}
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                  ${saving
                    ? 'bg-slate-700/50 text-[#64748b] cursor-not-allowed'
                    : 'bg-[#3b82f6] text-white hover:bg-[#2563eb]'
                  }`}
              >
                {saving ? '저장 중...' : savedCaseId ? '수정 저장' : 'DB에 저장'}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
