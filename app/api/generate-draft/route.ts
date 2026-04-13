import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);


const API_KEYS = [
  process.env.GEMINI_API_KEY,     
  process.env.GEMINI_API_KEY_2,   
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5
].filter(Boolean) as string[];

export async function POST(req: Request) {
  try {
    const { inquiryContent } = await req.json();

    if (!inquiryContent) {
      return NextResponse.json({ error: '문의 내용이 없습니다.' }, { status: 400 });
    }

    if (API_KEYS.length === 0) {
      return NextResponse.json({ error: '등록된 API 키가 없습니다.' }, { status: 500 });
    }

    let draftText = '';
    let isSuccess = false;
    let lastError: any = null;

    for (let i = 0; i < API_KEYS.length; i++) {
      const currentKey = API_KEYS[i];
      const genAI = new GoogleGenerativeAI(currentKey);

      try {
        console.log(`\n🔄 [API 시도] ${i + 1}번째 키로 생성을 시작합니다...`);

        const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const embeddingResult = await embeddingModel.embedContent(inquiryContent);
        const queryEmbedding = embeddingResult.embedding.values.slice(0, 768);

        const { data: matchedScripts, error } = await supabase.rpc('match_scripts', {
          query_embedding: queryEmbedding,
          match_threshold: 0.3,
          match_count: 2
        });

        if (error) throw error;

        let referenceText = '';
        if (matchedScripts && matchedScripts.length > 0) {
          referenceText = matchedScripts.map((script: any, index: number) => 
            `[참고 스크립트 ${index + 1}: ${script.title}]\n${script.content}`
          ).join('\n\n');
          console.log(`🔍 DB 검색 결과: ${matchedScripts.length}개의 스크립트 발견!`);
        } else {
          referenceText = '일치하는 안내 스크립트가 없습니다. 일반적인 CS 기준으로 친절하게 답변해주세요.';
          console.log(`🔍 DB 검색 결과: 일치하는 스크립트 없음.`);
        }

        const systemInstruction = `
          너는 'Nuldam' 브랜드의 전문적이고 친절한 고객지원(CX) 상담원이야.
          반드시 제공된 [참고 스크립트]의 정책과 내용을 바탕으로 고객의 [문의 내용]에 대한 답변 초안을 작성해줘.
          답변은 고객에게 바로 보낼 수 있는 형태의 정중한 존댓말을 사용하고, 불필요한 서론은 생략해.
          인사말은 "안녕하세요, Suggest the better 널 담입니다." 로 시작해야해.
        `;

        const model = genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash',
          systemInstruction: systemInstruction 
        });

        const prompt = `
          [참고 스크립트]
          ${referenceText}

          [고객 문의 내용]
          ${inquiryContent}
        `;

        const aiResult = await model.generateContent(prompt);
        draftText = aiResult.response.text();

        isSuccess = true;
        console.log(`✅ ${i + 1}번째 키로 답변 생성 완료!`);
        break;

      } catch (err: any) {
        lastError = err;
        const errorMessage = err.message?.toLowerCase() || '';

        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('exceeded')) {
          console.warn(`⚠️ [경고] ${i + 1}번째 키 한도 초과! 다음 예비 키로 넘어갑니다.`);
          continue; 
        } else {
          throw err;
        }
      }
    }

    if (!isSuccess) {
      throw new Error(`등록된 모든 API 키의 한도가 초과되었습니다. 😭 마지막 에러: ${lastError?.message}`);
    }

    return NextResponse.json({ draft: draftText });

  } catch (error: any) {
    console.error('AI Draft Generation Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}