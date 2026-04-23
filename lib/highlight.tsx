import React from 'react';

/**
 * 검색어와 매칭되는 텍스트를 <mark>로 래핑하여 하이라이팅
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} style={{ background: 'rgba(251,191,36,0.35)', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  );
}
