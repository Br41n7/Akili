import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runAIWithRetry, stripFences } from '@/lib/ai';
import { buildCulturalBlock } from '@/lib/cultural';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { bank_id, paystack_reference, project_name } = await req.json();
    if (!bank_id) return NextResponse.json({ error: 'bank_id required' }, { status: 400 });

    // Verify purchase in shared Supabase DB
    const { data: purchase } = await supabaseAdmin
      .from('purchases')
      .select('*')
      .eq('user_id', user.id)
      .eq('bank_id', bank_id)
      .eq('paystack_status', 'success')
      .single();

    if (!purchase) {
      return NextResponse.json({ error: 'No valid purchase found for this question bank.' }, { status: 403 });
    }

    // Fetch bank info and all questions
    const [{ data: bank }, { data: questions }] = await Promise.all([
      supabaseAdmin.from('question_banks').select('*').eq('id', bank_id).single(),
      supabaseAdmin.from('questions').select('*').eq('bank_id', bank_id).order('question_number'),
    ]);

    if (!bank || !questions?.length) {
      return NextResponse.json({ error: 'Question bank data not found' }, { status: 404 });
    }

    // Check if already imported for this user
    if (purchase.imported_to_akili && purchase.akili_project_id) {
      return NextResponse.json({
        success: true,
        project_id: purchase.akili_project_id,
        message: 'Already imported — opening existing project',
        already_imported: true,
      });
    }

    // Create Akili project for this bank
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: user.id,
        name: project_name || bank.title,
        description: `Imported from PastQ — ${bank.exam_type} ${bank.subject} (${bank.year_start || ''}–${bank.year_end || ''})`,
        subject: bank.subject,
        exam_type: bank.exam_type,
        source: 'pastq',
        source_bank_id: bank_id,
      })
      .select().single();

    if (projectError || !project) throw projectError || new Error('Failed to create project');

    // Format questions as a study document
    const questionText = questions.map(q =>
      `Q${q.question_number}${q.year ? ` (${q.year})` : ''}${q.topic ? ` [${q.topic}]` : ''}: ${q.question_text}\n` +
      `A) ${q.option_a}  B) ${q.option_b}${q.option_c ? `  C) ${q.option_c}` : ''}${q.option_d ? `  D) ${q.option_d}` : ''}\n` +
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

    let topicAnalysis = null;
    try {
      const analysisResult = await runAIWithRetry({
        task: 'topic_analysis',
        prompt: topicPrompt,
        system: buildCulturalBlock(region, regionContext),
        format: 'json',
      });
      topicAnalysis = JSON.parse(stripFences(analysisResult));
    } catch (e) {
      console.warn('[Import] Topic analysis failed:', e);
    }

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

    let courseData = null;
    try {
      const courseResult = await runAIWithRetry({
        task: 'course_builder',
        prompt: coursePrompt,
        system: `You are an expert ${bank.exam_type} tutor. Build a comprehensive course.\n${buildCulturalBlock(region, regionContext)}`,
        format: 'json',
      });
      courseData = JSON.parse(stripFences(courseResult));
    } catch (e) {
      console.warn('[Import] Course generation failed:', e);
    }

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

    // Mark purchase as imported
    await supabaseAdmin.from('purchases').update({
      imported_to_akili: true,
      akili_project_id: project.id,
    }).eq('id', purchase.id);

    return NextResponse.json({
      success: true,
      project_id: project.id,
      course_generated: !!courseData,
      topic_analysis: topicAnalysis,
      question_count: questions.length,
    });
  } catch (err: any) {
    console.error('[PastQ Import]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
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

    const { data: purchase } = await supabaseAdmin
      .from('purchases')
      .select('imported_to_akili, akili_project_id')
      .eq('user_id', user.id)
      .eq('bank_id', bank_id)
      .eq('paystack_status', 'success')
      .single();

    return NextResponse.json({
      imported: purchase?.imported_to_akili || false,
      project_id: purchase?.akili_project_id || null,
    });
  } catch {
    return NextResponse.json({ imported: false });
  }
}
