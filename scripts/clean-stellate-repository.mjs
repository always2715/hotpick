import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const rootArg = args.find((value) => value.startsWith('--root='));
const root = path.resolve(rootArg ? rootArg.slice('--root='.length) : process.cwd());
const dryRun = args.includes('--dry-run');

const removeBuildOutput = args.includes('--local') || (!args.includes('--install') && !args.includes('--build'));

const CURRENT_RELEASE = '8.0.56';
const preservedVersionedFiles = new Set([
  `README_v${CURRENT_RELEASE}.md`,
  `STELLATE_PROJECT_HANDOFF_v${CURRENT_RELEASE}.txt`,
  `STELLATE_v${CURRENT_RELEASE}_CHANGED_FILES.txt`,
  `STELLATE_v${CURRENT_RELEASE}_DEPLOY_GUIDE.txt`,
  `STELLATE_v${CURRENT_RELEASE}_RELEASE_MANIFEST.txt`,
  `STELLATE_v${CURRENT_RELEASE}_RUNTIME_MANIFEST.txt`,
  `STELLATE_v${CURRENT_RELEASE}_TEST_REPORT.txt`,
  'STELLATE_THUMBNAIL_POOL_POLICY_v8.0.43.txt',
  `APPLY_STELLATE_v${CURRENT_RELEASE}_CLEANUP.bat`,
]);

function discoverOldVersionedFiles() {
  const versionedPatterns = [
    /^README_v\d+\.\d+\.\d+\.md$/i,
    /^STELLATE_PROJECT_HANDOFF_v\d+\.\d+\.\d+\.txt$/i,
    /^STELLATE_v\d+\.\d+\.\d+_.+\.(?:txt|md)$/i,
    /^STELLATE_THUMBNAIL_POOL_POLICY_v\d+\.\d+\.\d+\.txt$/i,
    /^APPLY_STELLATE_v\d+\.\d+\.\d+_CLEANUP\.bat$/i,
  ];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => versionedPatterns.some((pattern) => pattern.test(name)))
    .filter((name) => !preservedVersionedFiles.has(name));
}

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
  'APPLY_STELLATE_v8.0.46_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.47_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.48_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.49_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.50_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.51_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.52_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.53_CLEANUP.bat',
  'APPLY_STELLATE_v8.0.54_CLEANUP.bat',
  'STELLATE_PROJECT_HANDOFF_v8.0.38.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.41.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.42.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.43.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.44.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.45.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.46.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.47.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.48.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.49.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.50.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.51.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.52.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.53.txt',
  'STELLATE_PROJECT_HANDOFF_v8.0.54.txt',
  'README_v8.0.54.md',
  'STELLATE_v8.0.54_CHANGED_FILES.txt',
  'STELLATE_v8.0.54_DEPLOY_GUIDE.txt',
  'STELLATE_v8.0.54_RELEASE_MANIFEST.txt',
  'STELLATE_v8.0.54_RUNTIME_MANIFEST.txt',
  'STELLATE_v8.0.54_TEST_REPORT.txt',
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
const oldVersionedFiles = discoverOldVersionedFiles();
for (const relativePath of [...removableDirectories, ...removableFiles, ...oldVersionedFiles]) {
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
