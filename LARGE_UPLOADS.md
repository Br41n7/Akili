# Large uploads (past the 4.5 MB Vercel limit)

Vercel rejects any request body over 4.5 MB, so a big file cannot be posted to our own API. Files over 4 MB now take a different road:

1. Browser asks `POST /api/documents/upload/start` with the project, file name and size. The server checks sign-in, project ownership, file type, the plan's `max_file_mb` and the 20-file project cap, then returns a one-time signed upload link for the private `uploads-temp` bucket (path `userId/uuid.ext`).
2. Browser sends the file straight to Supabase Storage (never through Vercel).
3. Browser calls `POST /api/documents/upload` with JSON `{project_id, storage_path, name}`. The server only accepts paths inside the learner's own folder, downloads the file, re-checks the plan size on the real bytes, parses it (`lib/document-parse.ts`, shared with the small-file path) and returns the text. The temporary file is deleted in a `finally`, whether parsing worked or not.
4. Files that never reach step 3 (tab closed) are swept: each new upload start deletes that learner's waiting files older than 1 hour.

Files up to 4 MB still use the old single request.

## Limits
Plan setting `max_file_mb` (Free 10, Pro 25 by default; editable in Admin → Plans; allowed range 1–50). The browser refuses anything over 50 MB. Supabase Free allows 50 MB per object at most.

## Cost
Nothing is kept: a file occupies Storage only between steps 2 and 3 (seconds), so it does not add to the 1 GB Free storage. It does count toward egress/ingress while in transit.

## Known gaps (not verified)
- The signed-URL upload from the browser (`uploadToSignedUrl`) was not run against a real Supabase project here; routes were tested with a fake Storage.
- Parsing happens in one serverless function (`maxDuration` 60 s). A very large or complex PDF may still time out on Vercel Hobby (its own cap applies); the learner sees "failed on our side".
- Memory: a 25 MB PDF is held in memory while parsing. Fine for normal use, untested at scale.
- Scanned PDFs still yield no text (no PDF OCR).
- Quiz, exam, study tools and Ask AI still read only the 12,000-character preview of each file.

## Uploading from a computer (phase4j)
Report: a learner could not upload materials from a PC. The exact error was not given, so these are the likely causes I found and fixed. **None has been confirmed as the cause.**
- **No drag and drop.** The dashed upload box looked like a drop zone but only opened the file picker, and dropping a file made the browser open it and leave Akili. The Materials box and the new-project form now accept dropped files, and a file dropped anywhere else on the page no longer navigates away.
- **Files over 4.5 MB** (PC files are usually bigger than phone photos) failed on the old route with a hosting error page and a vague "could not be processed". They now go through the large-upload path (phase4g; needs migration 0016), and any non-Akili error status now gets a plain message (too large, session ended, took too long, server problem).
- Not changed and possible causes: a Word/PowerPoint file in the old `.doc` / `.ppt` format (not supported, message says to convert), a cloud-only OneDrive/Google Drive placeholder file that has not downloaded, and a browser extension or office network blocking Supabase Storage. If it still fails, ask for a screenshot of the red message and the file type and size.
