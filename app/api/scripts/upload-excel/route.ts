import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx'; // 💡 엑셀 파싱 라이브러리

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    // 1. JSON 대신 FormData로 파일 수신
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '업로드된 파일이 없습니다.' }, { status: 400 });
    }

    // 2. 파일을 Buffer로 변환하여 엑셀(또는 CSV) 데이터 읽기
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // 첫 번째 시트 선택
    const worksheet = workbook.Sheets[sheetName];

    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: '엑셀 파일에 유효한 데이터가 없습니다.' }, { status: 400 });
    }

    // 4. 최신 임베딩 모델 세팅
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    // 5. 파싱된 데이터로 임베딩 및 DB 저장 진행
    const results = await Promise.all(data.map(async (row: any) => {
      const title = row.title || row.제목; 
      const content = row.content || row.내용;

      if (!title || !content) return null;

      // 임베딩 추출
      const embeddingResult = await embeddingModel.embedContent(String(content));
      const embedding = embeddingResult.embedding.values.slice(0, 768);

      // Supabase 저장
      const { error } = await supabase
        .from('scripts')
        .insert([{ title, content, embedding }]);

      if (error) throw error;
      return { title, status: 'success' };
    }));

    // null 값(빈 줄) 제거
    const validResults = results.filter(r => r !== null);

    return NextResponse.json({ success: true, message: '업로드 완료', results: validResults });

  } catch (error: any) {
    console.error('엑셀 처리 에러:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}