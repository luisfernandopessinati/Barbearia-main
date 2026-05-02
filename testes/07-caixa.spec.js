// tests/specs/07-caixa.spec.js
// Abre o fechamento de caixa, lança uma despesa de teste
// e verifica que o saldo líquido é recalculado corretamente.

const { test, expect } = require('@playwright/test');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.test') });

test('07 — Lançar despesa no caixa e verificar saldo líquido', async ({ page }) => {
    await page.goto('/admin/fechamento');
    await page.waitForLoadState('networkidle');

    // ── Vai para a aba Despesas ──
    const tabDespesas = page.locator('#tabDespesasBtn, button:has-text("Despesas")');
    await expect(tabDespesas).toBeVisible({ timeout: 8_000 });
    await tabDespesas.click();

    // ── Pega o saldo atual antes de lançar ──
    const saldoAntes = await page.locator('#saldoLiquido').textContent();
    console.log('   Saldo antes:', saldoAntes);

    // ── Preenche o formulário de despesa ──
    await page.fill('#despDescricao', 'Despesa Teste Playwright');
    await page.fill('#despValor', '10.00');
    await page.selectOption('#despCategoria', 'operacional');
    await page.selectOption('#despForma', 'dinheiro');

    // ── Lança ──
    await page.locator('#btnAddDespesa').click();

    // ── Verifica toast de confirmação ──
    await expect(
        page.locator('#toast').filter({ hasText: 'lan' })
    ).toBeVisible({ timeout: 8_000 });

    // ── Despesa aparece na lista ──
    await expect(
        page.locator('.despesa-card').filter({ hasText: 'Despesa Teste Playwright' })
    ).toBeVisible({ timeout: 5_000 });

    // ── Saldo diminuiu R$ 10,00 ──
    const saldoDepois = await page.locator('#saldoLiquido').textContent();
    console.log('   Saldo depois:', saldoDepois);

    // Converte "R$ 1.234,56" → número
    function parseReal(str) {
        return parseFloat((str || '0').replace('R$','').replace(/\./g,'').replace(',','.').trim());
    }
    const diff = parseReal(saldoAntes) - parseReal(saldoDepois);
    expect(Math.abs(diff - 10)).toBeLessThan(0.01);  // diferença deve ser ~R$10

    console.log('✅ Despesa lançada e saldo recalculado corretamente (diff R$', diff.toFixed(2), ')');

    // ── Exclui a despesa de teste para não sujar o caixa ──
    const btnRemover = page.locator('.despesa-card')
        .filter({ hasText: 'Despesa Teste Playwright' })
        .locator('.btn-remove-despesa');

    page.once('dialog', async d => await d.accept());
    await btnRemover.click();

    await expect(
        page.locator('.despesa-card').filter({ hasText: 'Despesa Teste Playwright' })
    ).not.toBeVisible({ timeout: 5_000 });

    console.log('✅ Despesa de teste removida — caixa limpo');
});
