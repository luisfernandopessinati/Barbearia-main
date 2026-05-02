// tests/playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './specs',
    timeout:  30_000,          // 30s por teste
    retries:  0,               // sem retry — queremos ver o erro na hora
    workers:  1,               // roda em sequência (login → produto → venda…)
    reporter: [
        ['list'],              // saída limpa no terminal
        ['html', { outputFolder: '../playwright-report', open: 'on-failure' }],
    ],
    use: {
        baseURL:      'http://localhost:3334',
        headless:     false,        // navegador visível
        slowMo:       400,          // 400ms entre ações — dá pra acompanhar
        viewport:     { width: 1280, height: 800 },
        screenshot:   'only-on-failure',
        video:        'retain-on-failure',
        trace:        'retain-on-failure',
        storageState: './auth.json', // sessão salva entre testes
    },
});
