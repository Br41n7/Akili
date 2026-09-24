-- ═══════════════════════════════════════════════════════════════
-- SHARED SCHEMA — Powers both PastQ and Akili
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Profiles (auto-created on signup) ────────────────────────
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'vendor', 'admin')),
  school TEXT,
  phone TEXT,
  paystack_subaccount TEXT,           -- vendor Paystack subaccount code
  total_earnings NUMERIC DEFAULT 0,   -- vendor lifetime earnings
  total_paid_out NUMERIC DEFAULT 0,   -- manually paid out so far
  pending_payout NUMERIC DEFAULT 0,   -- owed but not yet paid
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Question Banks (PastQ marketplace listings) ───────────────
CREATE TABLE question_banks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('WAEC','JAMB','NECO','KCSE','WASSCE','BECE','UTME','POST-UTME','OTHER')),
  year_start INTEGER,
  year_end INTEGER,
  school TEXT,
  country TEXT DEFAULT 'Nigeria',
  question_count INTEGER DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,   -- in kobo (smallest unit) for Paystack
  preview_count INTEGER DEFAULT 5,    -- how many questions visible before purchase
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','live','rejected')),
  total_sales INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Questions (individual questions inside a bank) ────────────
CREATE TABLE questions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bank_id UUID REFERENCES question_banks(id) ON DELETE CASCADE NOT NULL,
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  question_number INTEGER NOT NULL,
  year INTEGER,
  question_text TEXT NOT NULL,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  option_e TEXT,
  correct_answer TEXT NOT NULL,       -- 'A', 'B', 'C', 'D', or 'E'
  explanation TEXT,
  topic TEXT,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  is_preview BOOLEAN DEFAULT FALSE,   -- visible without purchase
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Purchases / Unlocks ───────────────────────────────────────
CREATE TABLE purchases (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bank_id UUID REFERENCES question_banks(id) ON DELETE CASCADE NOT NULL,
  amount_paid NUMERIC NOT NULL,       -- in kobo
  paystack_reference TEXT UNIQUE NOT NULL,
  paystack_status TEXT DEFAULT 'pending' CHECK (paystack_status IN ('pending','success','failed')),
  vendor_share NUMERIC,               -- 70% of amount_paid
  platform_share NUMERIC,             -- 30% of amount_paid
  imported_to_akili BOOLEAN DEFAULT FALSE,
  akili_project_id UUID,              -- if imported, which project
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Reviews / Ratings ─────────────────────────────────────────
CREATE TABLE reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bank_id UUID REFERENCES question_banks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank_id, user_id)
);

-- ── Payout Requests (manual process) ─────────────────────────
CREATE TABLE payout_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','rejected')),
  admin_note TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ════════════════════════════════════════════════════════════════
-- AKILI TABLES
-- ════════════════════════════════════════════════════════════════

-- ── Projects (study workspaces) ───────────────────────────────
CREATE TABLE projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  exam_type TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual','pastq','upload')),
  source_bank_id UUID REFERENCES question_banks(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Project Documents ─────────────────────────────────────────
CREATE TABLE documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  content TEXT,
  chunks TEXT[],
  source_type TEXT DEFAULT 'upload',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Generated Courses ─────────────────────────────────────────
CREATE TABLE courses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  exam_type TEXT,
  modules JSONB NOT NULL DEFAULT '[]',
  topic_frequency JSONB DEFAULT '[]',   -- analysis from PastQ questions
  predicted_topics JSONB DEFAULT '[]',  -- AI exam predictions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Course Progress ───────────────────────────────────────────
CREATE TABLE course_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  completed_lessons TEXT[] DEFAULT '{}',
  quiz_scores JSONB DEFAULT '{}',
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, user_id)
);

-- ── Quiz / Exam Attempts ──────────────────────────────────────
CREATE TABLE exam_attempts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT DEFAULT 'quiz' CHECK (type IN ('quiz','exam','practice')),
  questions JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER,
  total INTEGER,
  analysis JSONB,
  time_taken_seconds INTEGER,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Flashcards ────────────────────────────────────────────────
CREATE TABLE flashcards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  concept TEXT NOT NULL,
  mnemonic TEXT,
  explanation TEXT,
  style TEXT DEFAULT 'story',
  review_count INTEGER DEFAULT 0,
  next_review_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── AI Usage Quota ────────────────────────────────────────────
CREATE TABLE ai_usage (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,
  UNIQUE(user_id, usage_date)
);

-- ════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_read_public" ON profiles FOR SELECT USING (true);

-- Question Banks — vendors manage, students see approved ones
CREATE POLICY "banks_vendor_all" ON question_banks FOR ALL USING (auth.uid() = vendor_id);
CREATE POLICY "banks_student_read" ON question_banks FOR SELECT USING (status = 'live');

-- Questions — preview visible to all, full content only to purchasers
CREATE POLICY "questions_vendor" ON questions FOR ALL USING (auth.uid() = vendor_id);
CREATE POLICY "questions_preview" ON questions FOR SELECT USING (is_preview = true);
CREATE POLICY "questions_purchased" ON questions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM purchases p
    WHERE p.bank_id = questions.bank_id
    AND p.user_id = auth.uid()
    AND p.paystack_status = 'success'
  )
);

-- Purchases
CREATE POLICY "purchases_own" ON purchases FOR ALL USING (auth.uid() = user_id);

-- Reviews
CREATE POLICY "reviews_read" ON reviews FOR SELECT USING (true);
CREATE POLICY "reviews_own" ON reviews FOR ALL USING (auth.uid() = user_id);

-- Payouts
CREATE POLICY "payouts_vendor" ON payout_requests FOR ALL USING (auth.uid() = vendor_id);

-- Akili tables — user owns their own data
CREATE POLICY "projects_own" ON projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "documents_own" ON documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "courses_own" ON courses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "progress_own" ON course_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "attempts_own" ON exam_attempts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "flashcards_own" ON flashcards FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "usage_own" ON ai_usage FOR ALL USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update question bank rating when review added
CREATE OR REPLACE FUNCTION update_bank_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE question_banks SET
    rating = (SELECT AVG(rating) FROM reviews WHERE bank_id = NEW.bank_id),
    rating_count = (SELECT COUNT(*) FROM reviews WHERE bank_id = NEW.bank_id)
  WHERE id = NEW.bank_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_review_added
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_bank_rating();

-- Update vendor earnings on successful purchase
CREATE OR REPLACE FUNCTION handle_successful_purchase()
RETURNS TRIGGER AS $$
DECLARE
  vendor UUID;
  vendor_amount NUMERIC;
BEGIN
  IF NEW.paystack_status = 'success' AND OLD.paystack_status = 'pending' THEN
    SELECT vendor_id INTO vendor FROM question_banks WHERE id = NEW.bank_id;
    vendor_amount := NEW.amount_paid * 0.70;

    UPDATE profiles SET
      total_earnings = total_earnings + vendor_amount,
      pending_payout = pending_payout + vendor_amount
    WHERE id = vendor;

    UPDATE question_banks SET total_sales = total_sales + 1 WHERE id = NEW.bank_id;

    NEW.vendor_share := vendor_amount;
    NEW.platform_share := NEW.amount_paid * 0.30;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_purchase_success
  BEFORE UPDATE ON purchases
  FOR EACH ROW EXECUTE FUNCTION handle_successful_purchase();

-- ════════════════════════════════════════════════════════════════
-- SUPABASE STORAGE
-- ════════════════════════════════════════════════════════════════

-- Run in Supabase Dashboard → Storage → Create buckets:
-- 1. "question-banks" (private) — vendor uploaded PDFs/docs
-- 2. "akili-documents" (private) — student uploaded study materials
-- 3. "thumbnails" (public) — bank preview images

-- Storage policies (run in SQL Editor):
INSERT INTO storage.buckets (id, name, public) VALUES
  ('question-banks', 'question-banks', false),
  ('akili-documents', 'akili-documents', false),
  ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "vendors_upload_banks" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'question-banks'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "vendors_read_banks" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'question-banks'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "students_read_purchased" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'question-banks'
    AND EXISTS (
      SELECT 1 FROM purchases p
      JOIN question_banks b ON b.id = p.bank_id
      WHERE p.user_id = auth.uid()
      AND p.paystack_status = 'success'
      AND (storage.foldername(name))[1] = b.vendor_id::text
    )
  );

CREATE POLICY "akili_docs_own" ON storage.objects
  FOR ALL USING (
    bucket_id = 'akili-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "thumbnails_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "vendors_upload_thumbnails" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'thumbnails'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
