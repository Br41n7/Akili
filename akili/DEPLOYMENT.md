# PastQ + Akili — Full Deployment Guide

This guide sets up both apps from zero to live in under 2 hours.

---

## What You Need

- Email address (for Supabase + Vercel accounts)
- GitHub account (free)
- Paystack account (free — business verification takes 1-3 days)
- Phone for Paystack verification

---

## Step 1 — Supabase (15 minutes)

Both apps share **one Supabase project**. Do this once.

### Create Project
1. Go to [supabase.com](https://supabase.com) → Sign up → New Project
2. Give it a name: `pastq-akili`
3. Set a database password (save it somewhere safe)
4. Choose region: `eu-west-1` (London) — closest to Nigeria/Africa
5. Wait 2 minutes for project to provision

### Run the Schema
1. In your Supabase project → SQL Editor → New Query
2. Open `supabase-schema.sql` from either repo (they're identical)
3. Paste the full content → Click Run
4. You should see "Success. No rows returned" — that's correct

### Create Storage Bucket
1. Supabase Dashboard → Storage → New Bucket
2. Name: `question-banks`
3. Public bucket: OFF (leave unchecked)
4. Click Create

### Get Your Keys
Go to Project Settings → API:
```
Project URL:         https://xxxx.supabase.co
Anon/Public Key:     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Service Role Key:    eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
Copy all three. You'll need them for both apps.

---

## Step 2 — Paystack (10 minutes setup, 1-3 days verification)

### Create Account
1. Go to [paystack.com](https://paystack.com) → Create Account
2. Choose: Business account
3. Complete business verification (ID + business details)
4. Verification takes 1-3 business days

### Get API Keys
While waiting for verification, you can use **test mode**:
1. Dashboard → Settings → API Keys
2. Copy your Test Secret Key: `sk_test_xxx`
3. Copy your Test Public Key: `pk_test_xxx`

**Test card for payments:**
- Card: `4084 0840 8408 4081`
- CVV: `408`
- Expiry: Any future date (e.g. 12/30)
- OTP: `123456`

Switch to Live keys after business verification is complete.

---

## Step 3 — Get AI Keys (5 minutes)

### Gemini (for Akili)
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with Google
3. Get API Key → Create API Key in new project
4. Copy key (starts with `AIza`)
5. Free tier: 1,500 requests/day — enough for MVP

### Groq (for Akili course builder)
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up → API Keys → Create New Secret Key
3. Copy key (starts with `gsk_`)
4. Free tier: 14,400 requests/day — very generous

---

## Step 4 — Deploy PastQ (20 minutes)

### Push to GitHub
```bash
# On your computer
cd pastq
git init
git add .
git commit -m "PastQ MVP — initial deploy"

# Create repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/pastq.git
git push -u origin main
```

### Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. New Project → Import `pastq` repo
3. Framework Preset: Next.js (auto-detected)
4. Click "Environment Variables" and add:

```
NEXT_PUBLIC_SUPABASE_URL          = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY         = eyJhbGci...
PAYSTACK_SECRET_KEY               = sk_test_xxx
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY   = pk_test_xxx
NEXT_PUBLIC_AKILI_URL             = https://akili.vercel.app
```

Note: Set `NEXT_PUBLIC_AKILI_URL` to your expected Akili URL.
You can update it after deploying Akili.

5. Click Deploy
6. Wait ~2 minutes
7. Copy your PastQ URL: e.g. `https://pastq-abc123.vercel.app`

### Add Custom Domain (optional)
Vercel Dashboard → Your Project → Settings → Domains
Add `pastq.co` or whatever domain you own.
Follow DNS instructions for your domain registrar.

---

## Step 5 — Deploy Akili (20 minutes)

### Push to GitHub
```bash
cd akili
git init
git add .
git commit -m "Akili MVP — initial deploy"

git remote add origin https://github.com/YOUR_USERNAME/akili.git
git push -u origin main
```

### Deploy on Vercel
1. Vercel → New Project → Import `akili` repo
2. Framework: Next.js
3. Add Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL          = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY         = eyJhbGci...
GEMINI_API_KEY                    = AIzaSy...
GROQ_API_KEY                      = gsk_...
NEXT_PUBLIC_PASTQ_URL             = https://pastq-abc123.vercel.app
```

4. Click Deploy
5. Copy your Akili URL: e.g. `https://akili-xyz456.vercel.app`

### Update PastQ with Akili URL
1. Vercel → PastQ project → Settings → Environment Variables
2. Update `NEXT_PUBLIC_AKILI_URL` = `https://akili-xyz456.vercel.app`
3. Vercel → PastQ → Deployments → Redeploy

---

## Step 6 — Test Everything (30 minutes)

### Test 1: Vendor signup and upload
1. Go to your PastQ URL → Sign up as Vendor
2. Go to Vendor Dashboard → Upload Questions
3. Fill in bank info, add 5+ questions
4. Submit
5. Go to Supabase → Table Editor → question_banks
6. Find your bank → change `status` from `pending` to `live`
7. Save

### Test 2: Student purchase
1. Open PastQ in incognito → Sign up as Student
2. Browse → find your question bank
3. Click Buy Now
4. Complete payment with test card
5. Verify you can now see all questions + answers

### Test 3: Import to Akili
1. On the bank page (after purchase) → click "Import to Akili"
2. Create Akili account (or sign in if already have one)
3. Watch the import process (30-60 seconds)
4. Verify: Course generated, Topic Analysis visible

### Test 4: AI features
1. In your Akili project → Quiz tab → Generate quiz
2. Exam Mode → Start exam
3. Ask AI → ask a question about your material
4. Check daily limit is tracked (Supabase → ai_usage table)

### Test 5: Vendor payout flow
1. Make a test purchase as student
2. Log in as vendor → Dashboard
3. Request payout → fill in bank details
4. Check Supabase → payout_requests table → row appears with status 'pending'

---

## Step 7 — Go Live Checklist

Before accepting real payments:

- [ ] Paystack business verification approved
- [ ] Switch `PAYSTACK_SECRET_KEY` to `sk_live_xxx` in Vercel
- [ ] Switch `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` to `pk_live_xxx`
- [ ] Redeploy PastQ after updating keys
- [ ] Test one real payment (₦100 transaction)
- [ ] Verify vendor earnings updated in Supabase
- [ ] Confirm you can receive payout from Paystack to your bank

---

## Ongoing Operations

### Approving new question banks
1. Supabase Dashboard → Table Editor → question_banks
2. Filter: `status = pending`
3. Review questions (Table Editor → questions → filter by bank_id)
4. If approved: change status → `live`
5. If rejected: change status → `rejected`
   (optionally add a rejection reason — you'll need to DM vendor for now)

### Processing vendor payouts
1. Supabase → payout_requests → filter: `status = pending`
2. Note: vendor name, amount, bank name, account number, account name
3. Transfer via your personal banking app or Paystack Transfer dashboard
4. After transfer confirmed:
   - Update payout_requests row: `status → paid`, add transfer reference in `admin_note`
   - Update profiles row for the vendor:
     ```sql
     UPDATE profiles
     SET pending_payout = pending_payout - [amount],
         total_paid_out = total_paid_out + [amount]
     WHERE id = '[vendor_id]';
     ```
   Run this in Supabase SQL Editor.

### Monitoring
Check weekly:
- Supabase → Database → Usage (storage, row counts)
- Vercel → Analytics (page views, errors)
- Paystack Dashboard → Transactions (successful payments)
- Supabase → ai_usage table (who's using the most AI calls)

---

## Troubleshooting

**"No readable text" error on PDF upload**
The PDF is a scanned image, not a text-searchable PDF.
Tell vendors to use text-based PDFs or retype content manually.

**"Could not access Google Doc" error**
The Google Doc sharing must be set to "Anyone with the link can view".
File → Share → "Anyone with the link" → Viewer.

**AI returns empty course**
Usually means no documents were uploaded to the project.
Upload materials first before generating a course.

**Paystack payment fails in test mode**
Use exact test card: `4084 0840 8408 4081`, CVV: `408`, any future expiry.
OTP: `123456`.

**Import to Akili fails with "No valid purchase"**
The Paystack payment didn't complete successfully.
Check Supabase → purchases → find the row → check `paystack_status`.
If still `pending`, the payment verify webhook/redirect didn't fire.
Manually verify in Paystack dashboard → copy the reference → run:
```sql
UPDATE purchases
SET paystack_status = 'success'
WHERE paystack_reference = 'PQ_xxx';
```

**Daily AI limit hit during testing**
Reset manually in Supabase:
```sql
DELETE FROM ai_usage WHERE user_id = 'your-user-uuid';
```
