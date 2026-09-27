# Akili — AI Study Copilot for African Students

Upload notes, import PastQ question banks, get AI-built courses tailored to your environment.

## Stack
- Next.js 15 (App Router) + TypeScript
- Supabase (Auth + PostgreSQL — shared with PastQ)
- Gemini 2.0 Flash (vision, reasoning, quiz, exam)
- Groq + Llama 3.3 70B (course builder, long content — 14k free req/day)
- Tailwind CSS

## Setup

### 1. Supabase
**Use the same Supabase project as PastQ.**
The schema is already set up if you ran `supabase-schema.sql` for PastQ.

### 2. AI Keys
- **Gemini**: aistudio.google.com → Get API Key (free)
- **Groq**: console.groq.com → Create API Key (free, 14,400 req/day)

### 3. Environment Variables
```bash
cp .env.example .env.local
# Fill in all values — use same Supabase URL/keys as PastQ
```

### 4. Install & Run
```bash
npm install
npm run dev     # development (port 3000)
npm run build   # production build
npm start       # production server
```

## Deploy to Vercel
1. Push to GitHub (separate repo from PastQ)
2. Import repo in Vercel
3. Add all env vars
4. Set `NEXT_PUBLIC_PASTQ_URL` to your PastQ Vercel URL

## PastQ Integration
When a student buys a question bank on PastQ:
1. PastQ redirects to: `https://your-akili-url.com/import?bank={id}&ref={paystack_ref}`
2. Akili verifies the purchase in the shared Supabase DB
3. AI analyses topic frequency from all questions
4. AI generates a structured course (Groq + Llama 3.3 70B)
5. Student gets a full study system from their purchased questions

## AI Daily Limits
- Free users: 20 AI calls/day (tracked in `ai_usage` table)
- Users with own Groq key: unlimited (key sent per-request, never stored)
- Add Groq key in Settings to bypass quota

## Cultural Grounding
AI responses automatically use culturally relevant analogies based on user's region:
- Nigeria: jollof rice, danfo, NEPA, WAEC/JAMB
- Ghana: waakye, trotro, WASSCE
- Kenya: ugali, matatu, KCSE
- South Africa: pap, minibus taxi, Matric
- India: roti, auto rickshaw, JEE/NEET

Never pizza, hot dogs, basements, or yellow school buses.
