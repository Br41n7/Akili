import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase';
import { runAIWithRetry } from '@/lib/ai';
import { buildCulturalBlock } from '@/lib/cultural';

const FREE_DAILY_LIMIT = 20;
const RATE_STORE = new Map<string, { count: number; reset: number }>();

const PERSONAS: Record<string, string> = {
  friendly: "Explain like a curious 12-year-old. Simple words, real examples, warm tone.",
  strict: "Rigorous, formal, precise academic language. Depth and accuracy over simplicity.",
  socratic: "Never give the direct answer. Guide through questions. Challenge assumptions.",
  exam: "Focus on mark-scheme language, exam technique, and maximizing marks per question.",
  research: "Peer-reviewer mode. Challenge assumptions. Reference principles. Be critical.",
};

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Rate limit (20 req/min per user)
    const now = Date.now();
    const rate = RATE_STORE.get(user.id);
    if (rate && now < rate.reset) {
      if (rate.count >= 20) return NextResponse.json({ error: 'Too many requests. Wait a moment.' }, { status: 429 });
      rate.count++;
    } else {
      RATE_STORE.set(user.id, { count: 1, reset: now + 60000 });
    }

    const body = await req.json();
    const {
      task, prompt, systemInstruction = '', format = 'text',
      persona = 'friendly', region = 'Nigeria',
      image, userGroqKey, validationType,
    } = body;

    if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

    // Credit check — bypass if user has own Groq key
    if (!userGroqKey) {
      const today = new Date().toISOString().split('T')[0];
      const { data: usage } = await supabaseAdmin
        .from('ai_usage')
        .select('count')
        .eq('user_id', user.id)
        .eq('usage_date', today)
        .single();

      const count = usage?.count ?? 0;
      if (count >= FREE_DAILY_LIMIT) {
        return NextResponse.json({
          error: `Daily limit of ${FREE_DAILY_LIMIT} AI requests reached. Add your Groq API key in Settings for unlimited access. Resets at midnight.`
        }, { status: 429 });
      }

      await supabaseAdmin.from('ai_usage').upsert(
        { user_id: user.id, usage_date: today, count: count + 1 },
        { onConflict: 'user_id,usage_date' }
      );
    }

    // Build system prompt
    const personaText = PERSONAS[persona] || persona;
    const culturalText = buildCulturalBlock(region);
    const system = [personaText, culturalText, systemInstruction].filter(Boolean).join('\n\n');

    const result = await runAIWithRetry(
      { task, prompt, system, format, image, userGroqKey },
      format === 'json' ? (text) => {
        try { JSON.parse(text); return { ok: true }; }
        catch (e: any) { return { ok: false, error: e.message }; }
      } : undefined
    );

    return NextResponse.json({ result });
  } catch (err: any) {
    console.error('[AI Generate]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
