import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runAIWithRetry, stripFences } from '@/lib/ai';
import { buildCulturalBlock } from '@/lib/cultural';
import { isFreeBank, resolveAccess } from '@/lib/pastq-access';

// Import runs two AI steps; the platform default time limit is far too short for that.
export const maxDuration = 120;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fail = (error: string, status: number, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

/** An earlier import of this bank by this user (free banks have no purchase row to mark). */
async function findImportedProject(userId: string, bankId: string): Promise<string | null> {
  const { data: project } = await supabaseAdmin.from('projects').select('id').eq('user_id', userId).eq('source_bank_id', bankId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!project) return null;
  // A project whose questions never arrived is a failed import, not a finished one.
  const { data: doc } = await supabaseAdmin.from('documents').select('id').eq('project_id', project.id).eq('source_type', 'pastq').limit(1).maybeSingle();
  return doc ? (project.id as string) : null;
}

/** Map a PastQ exam type onto the exam boards Akili knows about. */
function pastqBoard(examType?: string | null): string {
  switch ((examType || '').toUpperCase()) {
    case 'WAEC': case 'WASSCE': return 'WAEC';
    case 'NECO': return 'NECO';
    case 'JAMB': case 'UTME': case 'POST-UTME': return 'JAMB';
    case 'KCSE': return 'KCSE';
    default: return 'SCHOOL';
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    let body: any;
    try { body = await req.json(); } catch { return fail('That request could not be read.', 400); }
    const { bank_id, project_name } = body || {};
    if (!bank_id || typeof bank_id !== 'string') return fail('bank_id required', 400);

    const { data: bank } = await supabaseAdmin.from('question_banks').select('*').eq('id', bank_id).maybeSingle();
    if (!bank) return fail('That question bank was not found.', 404, 'BANK_NOT_FOUND');

    const { data: purchase } = await supabaseAdmin
      .from('purchases').select('*').eq('user_id', user.id).eq('bank_id', bank_id).eq('paystack_status', 'success').order('created_at', { ascending: true }).limit(1).maybeSingle();

    // Paid banks need a completed purchase. Free, live banks can be imported by anyone signed in.
    const access = resolveAccess(bank, purchase);
    if (!access.ok) return fail(access.message, 403, access.code);

    // Already imported: open the existing project instead of building a second one.
    const existingId = purchase?.imported_to_akili && purchase.akili_project_id ? (purchase.akili_project_id as string) : await findImportedProject(user.id, bank_id);
    if (existingId) {
      return NextResponse.json({ success: true, project_id: existingId, message: 'Already imported — opening existing project', already_imported: true });
    }

    const { data: questions } = await supabaseAdmin.from('questions').select('*').eq('bank_id', bank_id).order('question_number');
    if (!questions?.length) return fail('This question bank has no questions yet.', 404, 'BANK_EMPTY');

    // Create Akili project for this bank
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        name: project_name || bank.title,
        description: `Imported from PastQ — ${bank.exam_type} ${bank.subject} (${bank.year_start || ''}–${bank.year_end || ''})`,
        subject: bank.subject,
        exam_type: bank.exam_type,
        // PastQ banks are exam past questions, so they are secondary / exam-board projects.
        education_level: 'secondary',
        exam_board: pastqBoard(bank.exam_type),
        study_goal: 'exam_prep',
        source: 'pastq',
        source_bank_id: bank_id,
      })
      .select().single();

    if (projectError || !project) throw projectError || new Error('Failed to create project');

    // Format questions as a study document
    const questionText = questions.map(q =>
      `Q${q.question_number}${q.year ? ` (${q.year})` : ''}${q.topic ? ` [${q.topic}]` : ''}: ${q.question_text}\n` +
      `A) ${q.option_a}  B) ${q.option_b}${q.option_c ? `  C) ${q.option_c}` : ''}${q.option_d ? `  D) ${q.option_d}` : ''}${q.option_e ? `  E) ${q.option_e}` : ''}\n` +
      `Answer: ${q.correct_answer}${q.explanation ? `\nExplanation: ${q.explanation}` : ''}`
    ).join('\n\n');

    // Store as document in Akili
    await supabaseAdmin.from('documents').insert({
      project_id: project.id,
      user_id: user.id,
      name: `${bank.title} — ${questions.length} Questions`,
      content: questionText.slice(0, 12000),
      source_type: 'pastq',
    });

    // Run AI topic frequency analysis
const profile = await supabaseAdmin
  .from('profiles')
  .select('region, region_context')
  .eq('id', user.id)
  .single();

    const profileData = profile.data as {
  region?: string | null;
  region_context?: Record<string, unknown> | null;
} | null;

    const region = profileData?.region ?? '';
const regionContext = profileData?.region_context ?? {};

    const topicPrompt = `Analyze these ${bank.exam_type} ${bank.subject} past questions and identify:
1. Topic frequency (how many times each topic appears)
2. The top 10 most tested topics ranked by frequency
3. Topics that haven't appeared recently (potential exam predictions)
4. Difficulty distribution

Questions:
${questionText.slice(0, 8000)}

Return JSON:
{
  "topic_frequency": [{ "topic": string, "count": number, "percentage": number, "years": number[] }],
  "top_topics": [string],
  "predicted_topics": [{ "topic": string, "reason": string, "confidence": "high"|"medium"|"low" }],
  "difficulty_breakdown": { "easy": number, "medium": number, "hard": number },
  "exam_insights": string
}`;

    const analysisRun = async () => {
    try {
      const analysisResult = await runAIWithRetry({
        task: 'topic_analysis',
        prompt: topicPrompt,
        system: buildCulturalBlock(region, regionContext),
        format: 'json',
      });
      return JSON.parse(stripFences(analysisResult));
    } catch (e) {
      console.warn('[Import] Topic analysis failed:', e);
      return null;
    }
    };


    // Now generate a full structured course using Groq+Llama
    const coursePrompt = `Create a structured ${bank.exam_type} ${bank.subject} course based on these ${questions.length} past questions.
Format like a Coursera/Udemy course — detailed lessons, worked examples from the actual questions, practice problems.

Questions corpus:
${questionText.slice(0, 6000)}

Return JSON:
{
  "title": "${bank.exam_type} ${bank.subject} Mastery Course",
  "description": string,
  "estimated_duration": string,
  "modules": [
    {
      "id": string,
      "module_number": number,
      "title": string,
      "estimated_time": string,
      "lessons": [
        {
          "id": string,
          "lesson_number": number,
          "title": string,
          "learning_objectives": [string],
          "content": "detailed markdown (min 300 words)",
          "key_concepts": [string],
          "worked_example": { "problem": string, "solution_steps": [string], "answer": string },
          "common_mistakes": [string],
          "practice_questions": [
            { "id": string, "question": string, "options": [string], "correct_answer": string, "explanation": string }
          ]
        }
      ]
    }
  ]
}`;

    const courseRun = async () => {
    try {
      const courseResult = await runAIWithRetry({
        task: 'course_builder',
        prompt: coursePrompt,
        system: `You are an expert ${bank.exam_type} tutor. Build a comprehensive course.\n${buildCulturalBlock(region, regionContext)}`,
        format: 'json',
      });
      return JSON.parse(stripFences(courseResult));
    } catch (e) {
      console.warn('[Import] Course generation failed:', e);
      return null;
    }
    };

    // The two steps do not depend on each other, so they run together (half the waiting).
    const [topicAnalysis, courseData] = await Promise.all([analysisRun(), courseRun()]);

    if (courseData) {
      await supabaseAdmin.from('courses').insert({
        project_id: project.id,
        user_id: user.id,
        title: courseData.title,
        description: courseData.description,
        subject: bank.subject,
        exam_type: bank.exam_type,
        modules: courseData.modules || [],
        topic_frequency: topicAnalysis?.topic_frequency || [],
        predicted_topics: topicAnalysis?.predicted_topics || [],
      });
    }

    // Paid banks record the import on the purchase. Free banks have none; the project's source_bank_id marks them.
    if (purchase) {
      await supabaseAdmin.from('purchases').update({ imported_to_akili: true, akili_project_id: project.id }).eq('id', purchase.id);
    }

    return NextResponse.json({
      success: true,
      project_id: project.id,
      course_generated: !!courseData,
      topic_analysis: topicAnalysis,
      question_count: questions.length,
      access: access.kind,
    });
  } catch (err: any) {
    console.error('[PastQ Import]', err?.message || err);
    return fail('The import could not be completed. Please try again.', 500, 'IMPORT_FAILED');
  }
}

// GET — check if a bank has been imported already
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const bank_id = req.nextUrl.searchParams.get('bank_id');
    if (!bank_id) return NextResponse.json({ imported: false });

    const { data: bank } = await supabaseAdmin.from('question_banks').select('id, price, status').eq('id', bank_id).maybeSingle();
    const { data: purchase } = await supabaseAdmin
      .from('purchases').select('imported_to_akili, akili_project_id').eq('user_id', user.id).eq('bank_id', bank_id).eq('paystack_status', 'success').order('created_at', { ascending: true }).limit(1).maybeSingle();

    const projectId = purchase?.imported_to_akili && purchase.akili_project_id ? (purchase.akili_project_id as string) : await findImportedProject(user.id, bank_id);
    return NextResponse.json({
      imported: !!projectId,
      project_id: projectId,
      free: bank ? isFreeBank(bank) : false,
    });
  } catch {
    return NextResponse.json({ imported: false });
  }
}
