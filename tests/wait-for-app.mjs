#!/usr/bin/env node
/** Wait for app health endpoint, then run tests */
import { spawnSync } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://webapp:4000';
const MAX_ATTEMPTS = 60;
const INTERVAL_MS = 2000;

async function waitForApp() {
  const healthUrl = `${BASE_URL}/api/health`;
  console.log(`Waiting for app at ${healthUrl}...`);
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        console.log('App is ready!');
        return;
      }
    } catch (_) {
      /* ignore */
    }
    if (i === MAX_ATTEMPTS) {
      console.error('Timeout waiting for app');
      process.exit(1);
    }
    console.log(`  Attempt ${i}/${MAX_ATTEMPTS} - retrying in ${INTERVAL_MS / 1000}s...`);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

waitForApp().then(() => {
  const result = spawnSync('npm', ['test'], { stdio: 'inherit', shell: true });
  process.exit(result.status ?? 1);
});
