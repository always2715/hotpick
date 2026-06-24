# STELLATE v8.0.41

## Fixed

The v8.0.40 cleanup BAT contained UTF-8 Korean text with LF-only line endings. Some Windows CMD environments interpreted broken byte sequences as commands, producing messages such as `'떎.' is not recognized`.

v8.0.41 provides `APPLY_STELLATE_v8.0.41_CLEANUP.bat` with:

- ASCII characters only
- CRLF line endings only
- No UTF-8 BOM
- Direct CMD deletion of `app`, `src/app`, `.next`, and foreign security-project files
- Optional Node cleanup validation when Node is available

No TOP ranking, feed recovery, content generation, or thumbnail selection policy was changed.
