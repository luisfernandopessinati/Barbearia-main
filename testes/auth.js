// tests/helpers/auth.js
// Faz login uma vez e salva a sessão em auth.json
// Os outros testes reutilizam essa sessão automaticamente.

const { chromium } = require('@playwright/test');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

async function fazerLogin() {
    const browser = await chromium.launch({ headless: false, slowMo: 400 });
    const context = await browser.newContext();
    const page    = await context.newPage();

    await page.goto(process.env.BASE_URL + '/admin/login');

    // Aguarda o formulário carregar
    await page.waitForSelector('input[type="email"], input[name="email"], input[type="text"]');

    // Preenche email — tenta seletores comuns
    const emailSel = 'input[type="email"], input[name="email"]';
    await page.fill(emailSel, process.env.ADMIN_EMAIL);
    await page.fill('input[type="password"]', process.env.ADMIN_SENHA);
    await page.click('button[type="submit"], input[type="submit"]');

    // Espera navegar para o painel
    await page.waitForURL('**/admin**', { timeout: 10_000 });

    // Salva sessão (cookies + localStorage)
    await context.storageState({ path: path.join(__dirname, '../auth.json') });
    await browser.close();

    console.log('✅ Login realizado e sessão salva em auth.json');
}

fazerLogin().catch(err => {
    console.error('❌ Falha no login:', err.message);
    process.exit(1);
});
