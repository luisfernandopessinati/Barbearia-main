// tests/specs/04-agendamento-cliente.spec.js
// Simula o cliente acessando /agendar/:token (rota pública).
// O token fica no .env.test — pegue em Empresas.token_agendamento no banco.

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

// ── Este teste usa sessão limpa (cliente não está logado como admin) ──
test.use({ storageState: { cookies: [], origins: [] } });

const ESTADO_FILE = path.join(__dirname, '../estado.json');
function salvarEstado(dados) {
    let atual = {};
    try { atual = JSON.parse(fs.readFileSync(ESTADO_FILE, 'utf8')); } catch {}
    fs.writeFileSync(ESTADO_FILE, JSON.stringify({ ...atual, ...dados }, null, 2));
}

// Dois dias à frente às 14:00
function doisDias() {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return { data: `${yyyy}-${mm}-${dd}`, hora: '14:00' };
}

test('04 — Cliente agenda pelo link público /agendar/:token', async ({ page }) => {
    const token = process.env.TOKEN_AGENDAMENTO;
    if (!token) {
        console.warn('⚠️  TOKEN_AGENDAMENTO não definido no .env.test — pulando teste do cliente');
        test.skip();
        return;
    }

    const { data, hora } = doisDias();

    // ── Abre a página pública de agendamento ──
    await page.goto(`/agendar/${token}`);
    await page.waitForLoadState('networkidle');

    // ── Pode ter uma etapa de identificação (telefone/nome) antes do formulário ──
    const campoTelLogin = page.locator(
        'input[name="telefone"], input[type="tel"], input[placeholder*="elefone"]'
    ).first();

    if (await campoTelLogin.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await campoTelLogin.fill('11988880001');
        await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Continuar")');
        await page.waitForLoadState('networkidle');
    }

    // ── Preenche o formulário de agendamento ──

    // Barbeiro/profissional
    const selectBarbeiro = page.locator(
        'select[name="barbeiro"], select[name="profissional_id"], input[name="barbeiro"]'
    ).first();
    if (await selectBarbeiro.count()) {
        const tag = await selectBarbeiro.evaluate(el => el.tagName.toLowerCase());
        if (tag === 'select') await selectBarbeiro.selectOption({ index: 1 });
    }

    // Serviço
    const selectServico = page.locator(
        'select[name="servico"], select[name="servico_id"], input[name="servico"]'
    ).first();
    if (await selectServico.count()) {
        const tag = await selectServico.evaluate(el => el.tagName.toLowerCase());
        if (tag === 'select') await selectServico.selectOption({ index: 1 });
    }

    // Data
    const campoData = page.locator('input[type="date"], input[name="data"]').first();
    if (await campoData.count()) await campoData.fill(data);

    // Horário — pode ser select gerado dinamicamente após escolher data
    await page.waitForTimeout(500); // aguarda possível re-render de horários
    const campoHora = page.locator(
        'select[name="horario"], select[name="hora_inicio"], input[name="horario"], input[name="hora_inicio"]'
    ).first();
    if (await campoHora.count()) {
        const tag = await campoHora.evaluate(el => el.tagName.toLowerCase());
        if (tag === 'select') {
            // Seleciona a primeira opção disponível (não placeholder)
            await campoHora.selectOption({ index: 1 });
        } else {
            await campoHora.fill(hora);
        }
    }

    // Observação (opcional)
    const campoObs = page.locator('textarea[name="observacao"], input[name="observacao"]').first();
    if (await campoObs.count()) await campoObs.fill('Agendamento via teste automatizado');

    // ── Confirma ──
    await page.click(
        'button[type="submit"], button:has-text("Agendar"), button:has-text("Confirmar")'
    );

    // ── A rota faz redirect para /agendar/:token com session.agendamentoSucesso ──
    // O frontend deve exibir a mensagem "Agendamento confirmado!"
    await expect(
        page.locator('text=confirmado, text=sucesso, text=Agendamento confirmado').first()
            .or(page.locator('.alert-success, .sucesso, .mensagem-sucesso'))
    ).toBeVisible({ timeout: 12_000 });

    salvarEstado({ agendamentoClienteFeito: true });
    console.log('✅ Agendamento pelo cliente realizado com sucesso');
});