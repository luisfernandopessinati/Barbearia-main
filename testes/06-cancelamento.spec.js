// tests/specs/06-cancelamento.spec.js
// Vai ao fechamento de caixa, encontra a venda criada no teste 05
// e cancela ela, verificando que o status muda para "Cancelada".

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const ESTADO_FILE = path.join(__dirname, '../estado.json');
function lerEstado() {
    try { return JSON.parse(fs.readFileSync(ESTADO_FILE, 'utf8')); } catch { return {}; }
}

test('06 — Cancelar a venda lançada no teste anterior', async ({ page }) => {
    const estado   = lerEstado();
    const vendaId  = estado.ultimaVendaId;

    if (!vendaId) {
        console.warn('⚠️  Nenhum ID de venda encontrado — pulando cancelamento');
        test.skip();
        return;
    }

    await page.goto('/admin/fechamento');
    await page.waitForLoadState('networkidle');

    // O fechamento carrega hoje automaticamente — aguarda a lista
    await page.waitForSelector('#listaVendas', { timeout: 10_000 });

    // Localiza o card da venda pelo ID
    const cardVenda = page.locator(`#card${vendaId}`);
    await expect(cardVenda).toBeVisible({ timeout: 8_000 });

    // Expande o card para ver o botão cancelar (clica no header)
    await cardVenda.locator('.venda-card-header').click();

    // Clica em cancelar venda
    const btnCancelar = cardVenda.locator('.btn-cancelar');
    await expect(btnCancelar).toBeVisible({ timeout: 5_000 });

    // Playwright intercepta o confirm() do browser
    page.once('dialog', async dialog => {
        console.log('   ➜ Confirm:', dialog.message());
        await dialog.accept();
    });

    await btnCancelar.click();

    // Aguarda o toast de confirmação
    await expect(
        page.locator('#toast').filter({ hasText: 'cancelada' })
    ).toBeVisible({ timeout: 10_000 });

    // Aguarda a tela recarregar e verifica badge "Cancelada"
    await page.waitForLoadState('networkidle');
    const badgeCancelado = page.locator(`#card${vendaId} .badge-cancelado`);
    await expect(badgeCancelado).toBeVisible({ timeout: 8_000 });

    console.log('✅ Venda #' + vendaId + ' cancelada com sucesso');
});
