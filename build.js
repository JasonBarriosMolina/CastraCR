#!/usr/bin/env node
/**
 * Build script universal para Vercel.
 * Detecta el proyecto por VERCEL_PROJECT_NAME y corre el turbo filter correcto.
 */
const { execSync } = require('child_process');
const { cpSync, existsSync } = require('fs');
const path = require('path');

const project = process.env['VERCEL_PROJECT_NAME'] ?? '';
const isAdmin = project.includes('admin');

const filter  = isAdmin ? '@castrar-cr/admin' : '@castrar-cr/web';
const appDir  = isAdmin ? 'apps/admin' : 'apps/web';

console.log(`[build.js] Proyecto: ${project} → filter: ${filter}`);

execSync(`npx turbo run build --filter=${filter}`, { stdio: 'inherit' });

// Crear symlink .next → apps/{app}/.next
// (symlink preserva rutas absolutas en build traces, cpSync las rompe)
const src  = path.join(__dirname, appDir, '.next');
const dest = path.join(__dirname, '.next');

if (existsSync(src)) {
  console.log(`[build.js] Symlinking ${dest} → ${src}`);
  execSync(`ln -sfn ${src} ${dest}`, { stdio: 'inherit' });
} else {
  console.error(`[build.js] ERROR: no encontré .next en ${src}`);
  process.exit(1);
}
