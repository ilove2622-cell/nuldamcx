import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// 환경변수 로드
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { inquiryContent } = await req.json();

    if (!inquiryContent) {
      return NextResponse.json({ error: '문의 내용이 없습니다.' }, { status: 400 });
    }

    // 1. 고객 문의 내용을 벡터(숫자 배열)로 변환
    const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const embeddingResult = await embeddingModel.embedContent(inquiryContent);
    const queryEmbedding = embeddingResult.embedding.values.slice(0, 768);

    // 2. Supabase에서 유사도 검색 (match_scripts 함수 호출)
    // match_threshold: 0.5 (유사도 기준, 필요에 따라 조절), match_count: 2 (가장 비슷한 스크립트 2개)
    const { data: matchedScripts, error } = await supabase.rpc('match_scripts', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 2
    });

    if (error) throw error;

    // 3. AI에게 전달할 참고 스크립트 텍스트 조립
    let referenceText = '';
    if (matchedScripts && matchedScripts.length > 0) {
      referenceText = matchedScripts.map((script: any, index: number) => 
        `[참고 스크립트 ${index + 1}: ${script.title}]\n${script.content}`
      ).join('\n\n');
    } else {
      referenceText = '일치하는 안내 스크립트가 없습니다. 일반적인 CS 기준으로 친절하게 답변해주세요.';
    }

    // 4. 시스템 명령어(System Instructions) 세팅 - 커스텀 Gem 역할
    const systemInstruction = `
      너는 'Nuldam' 브랜드의 전문적이고 친절한 고객지원(CS) 상담원이야.
      반드시 제공된 [참고 스크립트]의 정책과 내용을 바탕으로 고객의 [문의 내용]에 대한 답변 초안을 작성해줘.
      답변은 고객에게 바로 보낼 수 있는 형태의 정중한 존댓말을 사용하고, 불필요한 서론은 생략해.
    `;

    // 5. Gemini 1.5 Flash 모델 호출 (답변 생성)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction 
    });

    const prompt = `
      [참고 스크립트]
      ${referenceText}

      [고객 문의 내용]
      ${inquiryContent}
    `;

    const aiResult = await model.generateContent(prompt);
    const draftText = aiResult.response.text();

    // 6. 결과 반환
    return NextResponse.json({ draft: draftText });

  } catch (error: any) {
    console.error('AI Draft Generation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}