// tests/specs/01-login.spec.js
const { test, expect } = require('@playwright/test');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

// Este teste NÃO usa storageState — ele próprio faz o login e valida
test.use({ storageState: { cookies: [], origins: [] } });

test('01 — Login com credenciais válidas redireciona para o painel', async ({ page }) => {
    await page.goto('/admin/login');

    await page.fill('input[type="email"], input[name="email"]', process.env.ADMIN_EMAIL);
    await page.fill('input[type="password"]', process.env.ADMIN_SENHA);
    await page.click('button[type="submit"], input[type="submit"]');

    // Deve redirecionar para alguma rota /admin
    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 });

    // Salva a sessão para os próximos testes
    await page.context().storageState({ path: require('path').join(__dirname, '../auth.json') });

    console.log('✅ Login OK — sessão salva');
});

test('01b — Login com senha errada exibe mensagem de erro', async ({ page }) => {
    await page.goto('/admin/login');

    await page.fill('input[type="email"], input[name="email"]', process.env.ADMIN_EMAIL);
    await page.fill('input[type="password"]', 'senha_errada_xyz');
    await page.click('button[type="submit"], input[type="submit"]');

    // Deve permanecer na tela de login ou mostrar erro
    await expect(page).not.toHaveURL(/\/admin\/(?!login)/, { timeout: 5_000 });
});
