import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Every file under public/, as site paths. */
function publicFiles(dir = 'public'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? publicFiles(join(dir, e.name)) : ['/' + relative('public', join(dir, e.name)).split(sep).join('/')],
  );
}

/** Emits /sw.js from src/sw.js with the list of built files to precache for offline play. */
function serviceWorker(): Plugin {
  return {
    name: 'nurikabe-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map'));
      const precache = ['/', ...built.map((f) => '/' + f), ...publicFiles().filter((f) => !f.startsWith('/_'))];
      const template = readFileSync('src/sw.js', 'utf8');
      // hashed file names change whenever content does, so they make a good version
      const version = createHash('sha256').update(precache.sort().join('\n')).update(template).digest('hex').slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('__SW_VERSION__', version).replace('__SW_PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
  plugins: [serviceWorker()],
});
