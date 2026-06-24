# STELLATE v8.0.41

STELLATE v8.0.41 is a Windows cleanup reliability patch based on v8.0.40.

- Keeps the TOP25 generation pool and successful TOP20 publication policy.
- Keeps v8.0.39 run compatibility and non-destructive feed recovery.
- Keeps the curated Unsplash 100-image thumbnail pool.
- Replaces the broken UTF-8 Korean BAT with an ASCII-only CRLF Windows CMD file.
- The BAT directly removes foreign App Router/NVD/KISA/Supabase files even before Node runs.
- Vercel preinstall/build cleanup remains enabled.

Run `APPLY_STELLATE_v8.0.41_CLEANUP.bat` once from the hotpick repository root, commit all deletions in GitHub Desktop, and push.
