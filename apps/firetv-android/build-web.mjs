#!/usr/bin/env node
// Builds IPTVnator's web (PWA) bundle and stages it as the Fire TV app's
// assets/web: the app serves it from its own origin and answers the PWA's
// backend routes itself (see SlykBackend.kt).
//
// Usage: node apps/firetv-android/build-web.mjs [--skip-build]
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

const root = process.cwd();
const appDir = path.join(root, 'apps/firetv-android');
const webOut = path.join(root, 'dist/apps/web');
const assets = path.join(appDir, 'app/src/main/assets/web');

if (!process.argv.includes('--skip-build')) {
    execSync('pnpm nx build web --configuration=pwa', { stdio: 'inherit' });
}

// Angular's application builder writes the site to browser/ when present.
const site = fs.existsSync(path.join(webOut, 'browser'))
    ? path.join(webOut, 'browser')
    : webOut;
fs.rmSync(assets, { recursive: true, force: true });
fs.cpSync(site, assets, { recursive: true });

// No service worker: the app is the server, and a cached worker would pin
// an old build after an app update.
for (const file of ['ngsw-worker.js', 'ngsw.json', 'safety-worker.js', 'worker-basic.min.js']) {
    fs.rmSync(path.join(assets, file), { force: true });
}

fs.copyFileSync(
    path.join(appDir, 'web-bridge/app-config.js'),
    path.join(assets, 'assets/app-config.js')
);
await build({
    entryPoints: [path.join(appDir, 'web-bridge/slyk-backend.ts')],
    bundle: true,
    format: 'iife',
    target: 'chrome70',
    minify: true,
    tsconfig: path.join(root, 'tsconfig.base.json'),
    outfile: path.join(assets, 'slyk-backend.js'),
});

const indexPath = path.join(assets, 'index.html');
const index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes('slyk-backend.js')) {
    fs.writeFileSync(
        indexPath,
        index.replace('</head>', '    <script src="slyk-backend.js" defer></script>\n</head>')
    );
}
console.log(`Staged web app in ${path.relative(root, assets)}`);
