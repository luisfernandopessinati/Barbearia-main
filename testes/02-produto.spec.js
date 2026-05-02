// tests/specs/02-produto.spec.js
// Cadastra o produto que será usado no teste de venda.
// Guarda o ID/nome em arquivo compartilhado entre specs.

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

test('02 — Cadastrar produto de teste', async ({ page }) => {
    // Navega para a tela de cadastro de produtos
    // Ajuste a rota conforme o seu sistema
    await page.goto('/admin/produtos/novo');

    // Aguarda o formulário
    await page.waitForSelector('input[name="descricao"], input[placeholder*="escri"], input[placeholder*="roduto"]', { timeout: 8_000 });

    // Preenche nome / descrição
    const campoNome = page.locator('input[name="descricao"], input[name="nome"], input[placeholder*="escri"]').first();
    await campoNome.fill(process.env.PRODUTO_NOME);

    // Preço
    const campoPreco = page.locator('input[name="preco"], input[name="price"], input[placeholder*="preço"], input[placeholder*="Preço"]').first();
    await campoPreco.fill(process.env.PRODUTO_PRECO);

    // Estoque (se existir o campo)
    const campoEstoque = page.locator('input[name="estoque"], input[placeholder*="stoque"]').first();
    if (await campoEstoque.count()) {
        await campoEstoque.fill(process.env.PRODUTO_ESTOQUE);
    }

    // Salva
    await page.click('button[type="submit"], input[type="submit"], button:has-text("Salvar"), button:has-text("Cadastrar")');

    // Verifica sucesso — toast, redirecionamento ou o produto na lista
    await expect(
        page.locator('text=' + process.env.PRODUTO_NOME)
            .or(page.locator('.toast, #toast, .alert-success'))
    ).toBeVisible({ timeout: 8_000 });

    // Salva o nome para os próximos testes usarem no PDV
    salvarEstado({ produtoNome: process.env.PRODUTO_NOME });

    console.log('✅ Produto cadastrado:', process.env.PRODUTO_NOME);
});
