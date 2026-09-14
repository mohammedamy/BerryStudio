import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './cloth-lab/e2e',
  testMatch: '**/*.pw.js',
  timeout: 60_000,
  workers: 1,
  webServer: {
    command: 'npm --prefix cloth-lab run dev -- --host 127.0.0.1 --port 5178',
    url: 'http://127.0.0.1:5178/e2e/render.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://127.0.0.1:5178',
    viewport: { width: 800, height: 800 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
})
