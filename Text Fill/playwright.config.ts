import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...devices['Desktop Edge'],
    channel: 'msedge',
    viewport: { width: 360, height: 440 },
  },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  reporter: 'list',
});
