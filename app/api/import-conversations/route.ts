import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import {
  fetchUserChats,
  fetchMessages,
  extractQAPairs,
  type QAPair,
} from '@/lib/channeltalk-history';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean) as string[];

const BATCH_SIZE = 20;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST /api/import-conversations
 * { action: 'start' }              → 새 job 생성, 첫 배치 처리
 * { action: 'continue', jobId }    → 다음 배치 이어서 처리
 * { action: 'status', jobId }      → job 상태 조회
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, jobId } = body;

    if (action === 'status') {
      const { data: job } = await supabase
        .from('conversation_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      return NextResponse.json({ job });
    }

    if (action === 'start') {
      // 새 job 생성
      const { data: job, error } = await supabase
        .from('conversation_import_jobs')
        .insert({ status: 'running' })
        .select()
        .single();
      if (error) throw error;

      const result = await processBatch(job.id, undefined);
      return NextResponse.json(result);
    }

    if (action === 'continue') {
      if (!jobId) {
        return NextResponse.json({ error: 'jobId 필요' }, { status: 400 });
      }

      // job 조회
      const { data: job } = await supabase
        .from('conversation_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (!job || job.status !== 'running') {
        return NextResponse.json({ error: 'job이 없거나 완료됨', job }, { status: 400 });
      }

      const result = await processBatch(job.id, job.cursor || undefined);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'action: start | continue | status' }, { status: 400 });
  } catch (err: any) {
    console.error('import-conversations error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function processBatch(
  jobId: number,
  cursor?: string
): Promise<{
  jobId: number;
  processed: number;
  pairsInserted: number;
  hasMore: boolean;
  cursor?: string;
}> {
  let totalProcessed = 0;
  let totalPairs = 0;

  try {
    // 1. 채팅 목록 조회
    const { chats, next } = await fetchUserChats('closed', cursor, BATCH_SIZE);

    if (chats.length === 0) {
      await supabase
        .from('conversation_import_jobs')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', jobId);
      return { jobId, processed: 0, pairsInserted: 0, hasMore: false };
    }

    // 2. 각 채팅의 메시지 조회 → Q&A 추출 → 임베딩 → DB 저장
    const allPairs: QAPair[] = [];

    for (const chat of chats) {
      const userChatId = chat.id;
      const channelType = chat.channelType || null;
      const chatCreatedAt = chat.createdAt
        ? new Date(chat.createdAt).toISOString()
        : null;

      await delay(200);
      const messages = await fetchMessages(userChatId);
      const pairs = extractQAPairs(messages, userChatId, channelType, chatCreatedAt);
      allPairs.push(...pairs);
      totalProcessed++;
    }

    // 3. 임베딩 생성 + DB 저장
    if (allPairs.length > 0 && API_KEYS.length > 0) {
      const genAI = new GoogleGenerativeAI(API_KEYS[0]);
      const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

      for (const pair of allPairs) {
        try {
          const embeddingResult = await embeddingModel.embedContent(pair.customerText);
          const embedding = embeddingResult.embedding.values.slice(0, 768);

          const { error } = await supabase.from('conversation_pairs').upsert(
            {
              user_chat_id: pair.userChatId,
              customer_text: pair.customerText,
              manager_response: pair.managerResponse,
              channel_type: pair.channelType,
              embedding,
              chat_created_at: pair.chatCreatedAt,
            },
            { onConflict: 'user_chat_id,md5(customer_text)', ignoreDuplicates: true }
          );

          if (!error) totalPairs++;
          await delay(100);
        } catch (embErr: any) {
          // 임베딩 실패 시 embedding 없이 저장
          console.warn('embedding failed, saving without:', embErr.message);
          await supabase.from('conversation_pairs').upsert(
            {
              user_chat_id: pair.userChatId,
              customer_text: pair.customerText,
              manager_response: pair.managerResponse,
              channel_type: pair.channelType,
              chat_created_at: pair.chatCreatedAt,
            },
            { onConflict: 'user_chat_id,md5(customer_text)', ignoreDuplicates: true }
          );
        }
      }
    }

    // 4. job 상태 업데이트
    const hasMore = !!next;
    const updateData: any = {
      processed_chats: totalProcessed,
      total_pairs: totalPairs,
      updated_at: new Date().toISOString(),
    };

    if (hasMore) {
      updateData.cursor = next;
    } else {
      updateData.status = 'completed';
      updateData.cursor = null;
    }

    // incremental update
    const { data: currentJob } = await supabase
      .from('conversation_import_jobs')
      .select('processed_chats, total_pairs')
      .eq('id', jobId)
      .single();

    if (currentJob) {
      updateData.processed_chats = (currentJob.processed_chats || 0) + totalProcessed;
      updateData.total_pairs = (currentJob.total_pairs || 0) + totalPairs;
    }

    await supabase
      .from('conversation_import_jobs')
      .update(updateData)
      .eq('id', jobId);

    return {
      jobId,
      processed: totalProcessed,
      pairsInserted: totalPairs,
      hasMore,
      cursor: next,
    };
  } catch (err: any) {
    await supabase
      .from('conversation_import_jobs')
      .update({
        status: 'failed',
        error: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    throw err;
  }
}
