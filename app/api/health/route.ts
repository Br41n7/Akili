import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    ts: new Date().toISOString(),
  });
}
