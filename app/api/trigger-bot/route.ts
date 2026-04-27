import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .update({ status: '전송요청' })
      .eq('status', '답변저장')
      .select();

    if (error) {
      console.error("Supabase 상태 변경 에러:", error);
      throw new Error(`DB 업데이트 실패: ${error.message}`);
    }

    console.log(`✅ [송신 요청 완료] ${data.length}건을 '전송요청' 상태로 변경했습니다.`);

    return NextResponse.json({ 
      status: 'success', 
      message: `${data.length}건의 송신 요청이 로컬 PC로 전달되었습니다! (DB 감시 대기 중)`,
      count: data.length
    });

  } catch (error: any) {
    console.error('봇 호출(DB 업데이트) 실패:', error);
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}