export function versionFromTag(tag) {
  const v = String(tag || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`invalid version tag: "${tag}"`);
  return v;
}

// CLI: node scripts/sync-version.mjs [tag]  (falls back to $GITHUB_REF_NAME)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
  const version = versionFromTag(tag);
  const manifestUrl = new URL('../manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  manifest.version = version;
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest.json version -> ${version}`);
}
