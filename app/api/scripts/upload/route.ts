import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { data } = await req.json();

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: '데이터 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

    const results = await Promise.all(data.map(async (row: any) => {
      const { title, content } = row;

      if (!title || !content) return null;

      const embeddingResult = await embeddingModel.embedContent(content);
      const embedding = embeddingResult.embedding.values;

      const { error } = await supabase
        .from('scripts')
        .insert([{ title, content, embedding }]);

      if (error) throw error;
      return { title, status: 'success' };
    }));

    return NextResponse.json({ message: '업로드 완료', results });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}