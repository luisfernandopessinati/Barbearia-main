// tests/specs/05-venda.spec.js
// Abre o PDV, busca o produto cadastrado no teste 02,
// adiciona ao carrinho e finaliza a venda.

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

const ESTADO_FILE = path.join(__dirname, '../estado.json');
function lerEstado() {
    try { return JSON.parse(fs.readFileSync(ESTADO_FILE, 'utf8')); } catch { return {}; }
}
function salvarEstado(dados) {
    const atual = lerEstado();
    fs.writeFileSync(ESTADO_FILE, JSON.stringify({ ...atual, ...dados }, null, 2));
}

test('05 — Lançar venda no PDV e finalizar', async ({ page }) => {
    const estado      = lerEstado();
    const nomeProduto = estado.produtoNome || process.env.PRODUTO_NOME;

    await page.goto('/admin/vendas');
    await page.waitForLoadState('networkidle');

    // ── Busca o produto ──
    const campoBusca = page.locator('#buscaInput');
    await expect(campoBusca).toBeVisible({ timeout: 8_000 });
    await campoBusca.fill(nomeProduto.substring(0, 6)); // digita parte do nome

    // Aguarda a sugestão aparecer
    await expect(
        page.locator('.sugestao-item').filter({ hasText: nomeProduto })
    ).toBeVisible({ timeout: 8_000 });

    // Clica na sugestão
    await page.locator('.sugestao-item').filter({ hasText: nomeProduto }).first().click();

    // Produto deve aparecer no carrinho
    await expect(
        page.locator('.sale-item').filter({ hasText: nomeProduto })
    ).toBeVisible({ timeout: 5_000 });

    // ── Abre o painel de pagamento (mobile: toggle; desktop: já visível) ──
    const footerBar = page.locator('#footerBar');
    if (await footerBar.isVisible()) {
        const areaFooter = page.locator('#areaFooter');
        const isExpanded = await areaFooter.evaluate(el => el.classList.contains('expanded'));
        if (!isExpanded) await footerBar.click();
    }

    // ── Seleciona forma de pagamento ──
    await page.selectOption('#formaPagamento', 'dinheiro');

    // ── Finaliza ──
    const btnFinalizar = page.locator('#btnFinalizar');
    await expect(btnFinalizar).toBeVisible({ timeout: 5_000 });
    await btnFinalizar.click();

    // ── Modal de impressão deve aparecer com confirmação ──
    await expect(
        page.locator('#printOverlay, .print-overlay')
    ).toBeVisible({ timeout: 10_000 });

    // Lê o número da venda do modal
    const textoModal = await page.locator('#printModalVendaNum').textContent();
    const match = textoModal.match(/#(\d+)/);
    const vendaId = match ? parseInt(match[1]) : null;

    salvarEstado({ ultimaVendaId: vendaId });
    console.log('✅ Venda finalizada — ID:', vendaId);

    // Fecha o modal sem imprimir
    await page.locator('.btn-print-skip').click();
});
