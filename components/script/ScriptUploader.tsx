'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';

export default function ScriptUploader() {
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      
      const data = XLSX.utils.sheet_to_json(ws);

      const response = await fetch('/api/scripts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });

      if (response.ok) {
        alert('모든 스크립트가 벡터화되어 저장되었습니다!');
      } else {
        alert('업로드 중 오류가 발생했습니다.');
      }
      setLoading(false);
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h2 className="text-lg font-bold mb-4">스크립트 엑셀 대량 등록</h2>
      <input 
        type="file" 
        accept=".xlsx, .xls" 
        onChange={handleFileUpload}
        disabled={loading}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      {loading && <p className="mt-2 text-blue-500 text-sm">AI가 벡터 변환 중입니다. 잠시만 기다려주세요...</p>}
    </div>
  );
}