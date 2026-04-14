'use client';

import { useState } from 'react';
import type { AnalysisResult, RiskLevel } from '@/types/voc';

interface Props {
  result: AnalysisResult;
  onChange?: (result: AnalysisResult) => void;
  onRegenerate?: (substanceTypeHint: string) => void;
  regenerating?: boolean;
}

const riskConfig: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: '낮음', className: 'bg-green-900/30 text-green-400 border-green-400/30' },
  medium: { label: '중간', className: 'bg-yellow-900/30 text-yellow-400 border-yellow-400/30' },
  high: { label: '높음', className: 'bg-red-900/30 text-red-400 border-red-400/30' },
};

const cardBorderColor: Record<RiskLevel, string> = {
  low: 'border-green-400/30',
  medium: 'border-yellow-400/30',
  high: 'border-red-400/30',
};

export default function AnalysisResult({ result, onChange, onRegenerate, regenerating }: Props) {
  const [editing, setEditing] = useState(false);
  const risk = riskConfig[result.riskLevel];
  const borderColor = cardBorderColor[result.riskLevel];

  const update = <K extends keyof AnalysisResult>(key: K, value: AnalysisResult[K]) => {
    onChange?.({ ...result, [key]: value });
  };

  const updateAction = (i: number, value: string) => {
    const next = [...result.recommendedActions];
    next[i] = value;
    update('recommendedActions', next);
  };

  const addAction = () => update('recommendedActions', [...result.recommendedActions, '']);
  const removeAction = (i: number) =>
    update('recommendedActions', result.recommendedActions.filter((_, idx) => idx !== i));

  return (
    <div className={`rounded-[12px] border ${borderColor} bg-[rgba(30,41,59,0.6)] backdrop-blur overflow-hidden`}>
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#f8fafc]">분석 결과</h2>
        <div className="flex items-center gap-2">
          {editing ? (
            <select
              value={result.riskLevel}
              onChange={(e) => update('riskLevel', e.target.value as RiskLevel)}
              className="text-sm border border-white/[0.1] rounded-lg px-2 py-1 bg-[rgba(15,23,42,0.5)] text-[#f8fafc]"
            >
              <option value="low">낮음</option>
              <option value="medium">중간</option>
              <option value="high">높음</option>
            </select>
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${risk.className}`}>
              {risk.label}
            </span>
          )}
          {onChange && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-xs px-2.5 py-1 rounded-lg border border-white/[0.1] hover:bg-[rgba(15,23,42,0.5)] text-[#cbd5e1]"
            >
              {editing ? '완료' : '✏️ 수정'}
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-[#94a3b8]">이물질 종류</p>
          {editing ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={result.substanceType}
                onChange={(e) => update('substanceType', e.target.value)}
                className="flex-1 px-2 py-1.5 border border-white/[0.1] rounded text-sm bg-[rgba(15,23,42,0.5)] text-[#f8fafc]"
              />
              {onRegenerate && (
                <button
                  onClick={() => onRegenerate(result.substanceType)}
                  disabled={regenerating || !result.substanceType.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {regenerating ? '재분석 중…' : '🔄 이 종류로 재분석'}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-[#f8fafc]">{result.substanceType}</p>
          )}
        </div>
        <Field label="외관 특징" value={result.characteristics} editing={editing} multiline
          onChange={(v) => update('characteristics', v)} />
        <Field label="위험도 근거" value={result.riskReason} editing={editing} multiline
          onChange={(v) => update('riskReason', v)} />
        <Field label="혼입 추정 원인" value={result.estimatedSource} editing={editing} multiline
          onChange={(v) => update('estimatedSource', v)} />

        <div>
          <p className="text-sm font-medium text-[#94a3b8] mb-2">권장 조치</p>
          <ul className="space-y-1.5">
            {result.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#cbd5e1]">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                {editing ? (
                  <>
                    <input
                      type="text"
                      value={action}
                      onChange={(e) => updateAction(i, e.target.value)}
                      className="flex-1 px-2 py-1 border border-white/[0.1] rounded text-sm bg-[rgba(15,23,42,0.5)] text-[#f8fafc]"
                    />
                    <button
                      onClick={() => removeAction(i)}
                      className="text-xs text-red-400 hover:text-red-300 px-1"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  action
                )}
              </li>
            ))}
          </ul>
          {editing && (
            <button
              onClick={addAction}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              + 항목 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  multiline,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  multiline?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-[#94a3b8]">{label}</p>
      {editing ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="mt-1 w-full px-2 py-1.5 border border-white/[0.1] rounded text-sm bg-[rgba(15,23,42,0.5)] text-[#f8fafc]"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 border border-white/[0.1] rounded text-sm bg-[rgba(15,23,42,0.5)] text-[#f8fafc]"
          />
        )
      ) : (
        <p className="mt-0.5 text-sm text-[#f8fafc] whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}
