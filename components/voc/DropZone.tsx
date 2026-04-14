'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
}

export default function DropZone({ onFileSelect }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    onFileSelect(file);
  }, [onFileSelect]);

  // 붙여넣기 이벤트
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-[12px] p-10 text-center cursor-pointer transition-colors
        ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'hover:border-blue-500/50 hover:bg-blue-500/5'}`}
      style={isDragging ? undefined : { borderColor: 'rgba(255,255,255,0.12)' }}
    >
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} className="hidden" />
      {preview ? (
        <img src={preview} alt="preview" className="max-h-64 mx-auto rounded-lg object-contain" />
      ) : (
        <div style={{ color: '#94a3b8' }}>
          <p className="text-lg font-medium">이미지를 드래그하거나 클릭해서 업로드</p>
          <p className="text-sm mt-1">또는 <span className="text-blue-500 font-semibold">Ctrl+V</span> 로 붙여넣기</p>
          <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>PNG, JPG, WEBP 지원</p>
        </div>
      )}
    </div>
  );
}
