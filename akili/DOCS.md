# Akili — Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [AI System](#ai-system)
4. [Features](#features)
5. [API Reference](#api-reference)
6. [Cultural Context Engine](#cultural-context-engine)
7. [PastQ Integration](#pastq-integration)
8. [Deployment Guide](#deployment-guide)
9. [Environment Variables](#environment-variables)

---

## Overview

Akili is an AI study copilot built specifically for African students.
Students upload their own notes or import question banks from PastQ,
and AI builds a complete structured study system from that content.

Every AI response is culturally grounded — analogies and examples
use things familiar to the student's actual environment (jollof rice,
danfo buses, NEPA, WAEC mark schemes) rather than Western defaults.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  VERCEL                         │
│                                                 │
│  Next.js 15 App (Akili)                        │
│  ├── /app/api/ai/generate    → main AI route   │
│  ├── /app/api/import-pastq   → PastQ bridge    │
│  ├── /app/api/documents      → file upload     │
│  ├── /app/api/profiles       → user settings   │
│  └── /app/projects/[id]      → workspace       │
└──────────────┬──────────────────────────────────┘
               │
   ┌───────────┼───────────────┐
   │           │               │
   ▼           ▼               ▼
SUPABASE    GEMINI 2.0      GROQ
(shared     FLASH           LLAMA 3.3
 with       Vision +        70B
 PastQ)     Reasoning       Course Builder
            Free tier       14,400 req/day free
```

---

## AI System

### Two-Provider Strategy

Akili uses two AI providers, each for what they do best:

**Gemini 2.0 Flash** (your server key, free tier)
- Vision tasks: Snap & Solve (photo of a question)
- Living Concept (photo of student's environment)
- Quiz generation
- Exam simulation with concept traps
- Research / theory validation
- Concept battle comparisons
- Notebook chat (Q&A with uploaded materials)

**Groq + Llama 3.3 70B** (your server key, 14,400 free req/day)
- Course Builder (long structured output — modules, lessons, examples)
- Study Guide generation
- Slide deck creation
- Flashcard / mnemonic generation
- Shortcut / trick teaching

**Why two providers?**
Gemini's free tier limits tokens per day. Groq's free tier allows
14,400 requests per day with no token cap on Llama 3.3 70B — making
it ideal for the heavy course generation work that produces thousands
of tokens per call.

### Fallback Chain
If Gemini fails → try Groq (except vision tasks)
If Groq fails → try Gemini
All failures logged, user sees a clear error message.

### Anti-Hallucination Pipeline
Every structured AI response (JSON) goes through:
1. Strip markdown fences (```json ... ```)
2. JSON.parse validation
3. Content relevance check (keyword overlap with original prompt)
4. If fails: retry once with stricter prompt
5. If still fails: return error — never return invalid data silently

### Daily Quota
- Free users: 20 AI calls/day (tracked in `ai_usage` Supabase table)
- Users with own Groq key: unlimited (key sent per-request in header,
  never stored in DB)
- Quota check happens server-side — cannot be bypassed from client

---

## Features

### Materials Tab
Upload PDFs and TXT files (max 15MB). Import Google Docs via URL.
Text is extracted, sanitized, and chunked into 2000-char segments.
All AI features use this content as context.

**Supported sources:**
- PDF files (text-searchable, not scanned images)
- TXT files
- Google Docs (must have "Anyone with link can view" sharing)
- PastQ question banks (imported via the bridge)

### Course Tab
AI reads all uploaded materials and generates a Coursera/Udemy-style
structured course:
- Modules → Lessons hierarchy
- Each lesson: 300+ word content in Markdown
- Learning objectives per lesson
- Worked examples with step-by-step solutions
- Common mistakes section
- 3 practice questions per lesson with explanations
- Progress tracking (completed lessons saved to Supabase)

Course generation uses Groq + Llama 3.3 70B for high-quality
long-form structured output.

### Topic Analysis Tab
Only available for projects imported from PastQ. Shows:
- Topic frequency chart (which topics appear most across all years)
- Years each topic appeared
- AI exam predictions (topics overdue based on pattern gaps)
- Confidence levels on predictions (high/medium/low)

### Quiz Tab
Generates 5 questions on demand. Configurable:
- Topic (specific or blank for general review)
- Difficulty (easy/medium/hard)
Immediate answer checking with explanations.
Attempts saved to `exam_attempts` table.

### Exam Mode Tab
Full timed exam simulation:
- 45-minute countdown timer
- 10 questions: multiple choice, true/false, concept traps
- Concept traps test deep understanding vs surface memorization
- Post-exam AI analysis: weak concepts, strong concepts,
  recommendations (stored in Supabase for progress tracking)

### Flashcards Tab
AI generates mnemonics in 5 styles:
- **Story**: narrative that encodes the concept
- **Acronym**: first letters spell a memorable word
- **Funny**: absurd scenario that sticks
- **Academic**: formal but memorable
- **African-themed**: uses local cultural references

All cards use culturally grounded examples per the user's region.
Flip animation reveals concept/explanation.

### Ask AI Tab
Chat interface backed by the student's uploaded materials.
AI reads all project documents as context before each response.
Maintains conversation history within the session.
Responds in the student's chosen persona style.

---

## API Reference

### POST /api/ai/generate
Main AI endpoint. All AI features route through here.
**Auth required:** Yes

Request:
```json
{
  "task": "course_builder",
  "prompt": "Create a course from...",
  "region": "Nigeria",
  "persona": "friendly",
  "format": "json",
  "userGroqKey": "gsk_..."
}
```

**task values and their routing:**
| Task | Provider | Use |
|---|---|---|
| course_builder | Groq | Generate full course |
| study_guide | Groq | Markdown study guide |
| mnemonic | Groq | Flashcard mnemonic |
| quiz | Gemini | 5-question quiz |
| exam | Gemini | Timed exam + analysis |
| concept_battle | Gemini | Head-to-head comparison |
| living_concept | Gemini | Environment-based explanation |
| snap_solve | Gemini | Solve from photo |
| topic_analysis | Gemini | Exam pattern analysis |
| notebook | Gemini | Document Q&A chat |

**persona values:**
| Value | Behaviour |
|---|---|
| friendly | Explain like to a curious 12-year-old (DEFAULT) |
| strict | Rigorous academic language |
| socratic | Never gives answers directly, asks guiding questions |
| exam | Mark-scheme language, exam technique focus |
| research | Peer-reviewer mode, challenges assumptions |

Response:
```json
{ "result": "string or JSON string" }
```

Error responses:
- `401` Not authenticated
- `429` Daily limit reached or rate limited
- `500` All AI providers failed

### POST /api/import-pastq
Imports a PastQ question bank into an Akili project.
**Auth required:** Yes

Request:
```json
{
  "bank_id": "uuid",
  "paystack_reference": "PQ_xxx",
  "project_name": "WAEC Chemistry 2015-2024"
}
```

Process (runs server-side, takes 30-60 seconds):
1. Verify purchase exists in shared Supabase DB
2. Fetch all questions from `questions` table
3. Create Akili project
4. Store questions as document
5. Run topic frequency analysis (Gemini)
6. Generate structured course (Groq + Llama)
7. Mark purchase as imported in PastQ `purchases` table

Response:
```json
{
  "success": true,
  "project_id": "uuid",
  "course_generated": true,
  "question_count": 120,
  "topic_analysis": {
    "topic_frequency": [...],
    "top_topics": [...],
    "predicted_topics": [...]
  }
}
```

### GET /api/import-pastq?bank_id={uuid}
Check if a bank has already been imported.

Response:
```json
{ "imported": true, "project_id": "uuid" }
```

### POST /api/documents/upload
Upload PDF or TXT file.
**Auth required:** Yes
**Content-Type:** multipart/form-data

Form fields: `file` (File), `project_id` (string)

Response:
```json
{
  "name": "Chemistry Notes.pdf",
  "content": "first 12000 chars...",
  "chunks": ["chunk 1...", "chunk 2..."],
  "source_type": "pdf"
}
```

### POST /api/documents/import-url
Import from Google Docs or webpage URL.
**Auth required:** Yes

Request: `{ "url": "https://docs.google.com/..." }`
Response: `{ "title": "...", "content": "...", "source_type": "gdoc" }`

### GET /api/profiles
Get current user profile + today's AI usage.
**Auth required:** Yes

Response:
```json
{
  "id": "uuid",
  "full_name": "Ade Okafor",
  "region": "Nigeria",
  "persona": "friendly",
  "ai_calls_today": 7,
  "ai_limit": 20
}
```

### PUT /api/profiles
Update user preferences.
**Auth required:** Yes

Allowed fields: `region`, `persona`, `custom_agent_prompt`, `preferred_model`

### GET /api/health
No auth. Returns AI provider status.

Response:
```json
{
  "status": "ok",
  "gemini": true,
  "groq": true,
  "ts": "2026-09-15T12:00:00.000Z"
}
```

---

## Cultural Context Engine

Located in `lib/cultural.ts`.

Every AI call injects a cultural grounding block based on `region`:

```
CULTURAL GROUNDING — MANDATORY:
Student is in Nigeria. Use ONLY these familiar references:
  Foods: Jollof rice, Eba, Garri, Suya, Puff puff, Akara...
  Transport: Danfo bus, Keke Napep, Okada, BRT bus...
  Objects: Generator, NEPA light, Naira, Kerosene stove...
  Exam system: WAEC, JAMB, NECO, UTME, Post-UTME
FORBIDDEN: pizza, hot dog, basement, yard sale, yellow school bus,
snow, Thanksgiving, dollar bill, 401k, Subway sandwich
```

**Adding a new region:**
Edit `lib/cultural.ts` → add to the `PROFILES` object:
```typescript
'Rwanda': {
  country: 'Rwanda',
  foods: ['Ugali', 'Isombe', 'Matoke', 'Akabenz'],
  transport: ['Moto taxi', 'Bus', 'Tap-tap'],
  objects: ['Akagera', 'Franc notes', 'Mobile money'],
  exams: ['REB', 'National Exam'],
  forbidden: ['pizza', 'hot dog', 'basement', 'snow'],
}
```

---

## PastQ Integration

### Flow Overview
```
PastQ (student buys question bank)
        ↓
Redirect to Akili:
  /import?bank={bank_id}&ref={paystack_reference}
        ↓
Akili verifies purchase in shared Supabase DB
        ↓
Akili fetches all questions (same Supabase DB)
        ↓
AI analysis + course generation (30-60 seconds)
        ↓
Student lands on project workspace with:
  - All questions imported as a document
  - Topic frequency chart
  - Exam predictions
  - Full generated course ready to study
```

### Shared Database
Both apps point to the same Supabase project.
Akili reads from `question_banks`, `questions`, `purchases` tables
that PastQ writes to.

No API between the apps. No tokens exchanged.
Supabase RLS enforces that Akili can only read a bank's questions
if the requesting user has a matching successful purchase.

### If student has no Akili account
They are redirected to `/auth/signup?bank={id}&ref={ref}`.
After account creation, they're automatically redirected back
to `/import?bank={id}&ref={ref}` to complete the import.

---

## Deployment Guide

### Prerequisites
- Supabase project (same one as PastQ)
- Gemini API key (free — aistudio.google.com)
- Groq API key (free — console.groq.com)
- GitHub account + Vercel account

### Step 1 — Get Your API Keys

**Gemini:**
1. Go to aistudio.google.com
2. Click "Get API Key" → Create API Key
3. Copy the key (starts with `AIza...`)

**Groq:**
1. Go to console.groq.com → Sign up
2. API Keys → Create New Secret Key
3. Copy the key (starts with `gsk_...`)
4. Free tier: 14,400 requests/day, 6000 tokens/min on Llama 3.3 70B

### Step 2 — Vercel Deployment

1. Push Akili to its own GitHub repository
   ```bash
   cd akili
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/akili.git
   git push -u origin main
   ```

2. Go to vercel.com → Add New Project
3. Import the Akili GitHub repo
4. Framework: Next.js (auto-detected)
5. Add Environment Variables (one by one):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase Anon Key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase Service Role Key |
   | `GEMINI_API_KEY` | Your Gemini API Key |
   | `GROQ_API_KEY` | Your Groq API Key |
   | `NEXT_PUBLIC_PASTQ_URL` | Your PastQ Vercel URL |

6. Click Deploy
7. Note your Akili URL (e.g. `https://akili.vercel.app`)

### Step 3 — Connect PastQ to Akili

In PastQ's Vercel environment variables:
```
NEXT_PUBLIC_AKILI_URL=https://akili.vercel.app
```

Redeploy PastQ after adding this variable.

### Step 4 — Test the Full Flow

1. Sign up on PastQ as a vendor, upload a question bank
2. Approve the bank in Supabase (change status → 'live')
3. Sign up on PastQ as a student, purchase the bank (test mode)
4. Click "Import to Akili"
5. Verify: project created, course generated, topic analysis visible

---

## Environment Variables

```bash
# .env.local — NEVER commit this file

# Supabase (same project as PastQ)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# AI Keys (server-side only — never exposed to browser)
GEMINI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...

# Cross-app URLs
NEXT_PUBLIC_PASTQ_URL=https://pastq.vercel.app
```

## Cost Breakdown (Monthly — MVP scale)

| Service | Free Tier | What you get |
|---|---|---|
| Vercel (Akili) | Free | Unlimited deploys, 100GB bandwidth |
| Vercel (PastQ) | Free | Unlimited deploys, 100GB bandwidth |
| Supabase | Free | 500MB DB, 1GB storage, 50k MAU |
| Gemini API | Free | 1,500 req/day, 1M tokens/day |
| Groq API | Free | 14,400 req/day on Llama 3.3 70B |
| Paystack | 1.5% + ₦100 per txn | No monthly fee |
| **Total fixed cost** | **₦0 / $0** | Until ~500 DAU |
