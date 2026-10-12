import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('zip script exports committed files using git archive without including untracked files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dalbit-archive-test-'));
  try {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(manifest.scripts.zip, 'git archive --format=zip --output=dalbit-edu.zip HEAD');
    const git = (...args) => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
    git('init', '--quiet');
    await writeFile(join(directory, 'tracked.txt'), 'Source archive fixture.');
    git('add', 'tracked.txt');
    git('-c', 'user.name=Archive fixture', '-c', 'user.email=fixture@example.com',
      '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${join(directory, 'no-hooks')}`,
      'commit', '--quiet', '-m', 'Create archive fixture',
      '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>');
    await writeFile(join(directory, 'untracked.txt'), 'Not part of HEAD.');
    execSync(manifest.scripts.zip, { cwd: directory, stdio: 'pipe' });
    const archive = await readFile(join(directory, 'dalbit-edu.zip'));
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    assert.ok(archive.includes(Buffer.from('tracked.txt')));
    assert.ok(!archive.includes(Buffer.from('untracked.txt')));
    const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
    assert.match(ignore, /^dalbit-edu\.zip$/m);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
