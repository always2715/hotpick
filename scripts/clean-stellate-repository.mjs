import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const rootArg = args.find((value) => value.startsWith('--root='));
const root = path.resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd());
const dryRun = args.includes('--dry-run');

const removeBuildOutput = args.includes('--local') || (!args.includes('--install') && !args.includes('--build'));

const removableDirectories = [
  'app',
  'src/app',
  ...(removeBuildOutput ? ['.next'] : []),
];

const removableFiles = [
  'next-env.d.ts',
  'middleware.ts',
  'middleware.js',
  'lib/cron-auth.ts',
  'lib/cron-auth.js',
  'lib/kisa-rss.ts',
  'lib/kisa-rss.js',
  'lib/nvd-enrichment.ts',
  'lib/nvd-enrichment.js',
  'lib/nvd-cve.ts',
  'lib/nvd-cve.js',
  'lib/supabase-admin.ts',
  'lib/supabase-admin.js',
  'scripts/backfill-nvd-details.ps1',
  'APPLY_STELLATE_v8.0.40_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.41_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.42_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.43_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.44_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.45_CLEANUP.bat',
  'STELLATE_PROJECT_HANDOFF_v8.0.38.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.41.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.42.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.43.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.44.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.45.txt',
];

function readPackageName() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return String(parsed?.name || '').trim();
  } catch {
    return '';
  }
}

if (readPackageName() !== 'hotpick') {
  console.error(`[STELLATE cleanup] Aborted: package.json name is not hotpick at ${root}.`);
  process.exit(2);
}

const removed = [];
for (const relativePath of [...removableDirectories, ...removableFiles]) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  removed.push(relativePath);
  if (!dryRun) fs.rmSync(absolutePath, { recursive: true, force: true });
}

if (removed.length === 0) {
  console.log('[STELLATE cleanup] No foreign project files found.');
} else {
  console.log(`[STELLATE cleanup] ${dryRun ? 'Would remove' : 'Removed'}: ${removed.join(', ')}`);
}
