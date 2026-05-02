// tests/specs/03-agendamento-barbeiro.spec.js
// Cria um agendamento pelo painel admin via POST /admin/agendar

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

// Amanhã às 10:00
function amanha() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return { data: `${yyyy}-${mm}-${dd}`, hora: '10:00', display: `${dd}/${mm}/${yyyy}` };
}

test('03 — Admin cria agendamento pelo painel', async ({ page }) => {
    const { data, hora, display } = amanha();

    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Abre modal/formulário de novo agendamento
    const btnNovo = page.locator(
        'button:has-text("Agendar"), button:has-text("Novo"), button:has-text("+"), [data-action="novo-agendamento"]'
    ).first();

    if (await btnNovo.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await btnNovo.click();
    } else {
        // Clica em uma célula de horário vazia na agenda
        const celula = page.locator('.slot-horario, .fc-timegrid-slot, [data-hora]').first();
        await celula.click({ timeout: 5_000 });
    }

    // Aguarda o formulário abrir
    await page.waitForSelector(
        'input[name="nome"], input[placeholder*="liente"], input[placeholder*="ome"]',
        { timeout: 8_000 }
    );

    // Nome
    await page.fill(
        'input[name="nome"], input[placeholder*="liente"], input[placeholder*="ome"]',
        'Cliente Teste Playwright'
    );

    // Telefone
    const campoTel = page.locator('input[name="telefone"], input[type="tel"]').first();
    if (await campoTel.count()) await campoTel.fill('11999990001');

    // Data
    const campoData = page.locator('input[name="data"], input[type="date"]').first();
    if (await campoData.count()) {
        const valAtual = await campoData.inputValue();
        if (!valAtual) await campoData.fill(data);
    }

    // Horário
    const campoHorario = page.locator(
        'input[name="horario"], input[name="hora_inicio"], select[name="horario"], select[name="hora_inicio"]'
    ).first();
    if (await campoHorario.count()) {
        const tag = await campoHorario.evaluate(el => el.tagName.toLowerCase());
        tag === 'select'
            ? await campoHorario.selectOption({ label: hora })
            : await campoHorario.fill(hora);
    }

    // Serviço — primeira opção real
    const selectServico = page.locator('select[name="servico"], select[name="servico_id"]').first();
    if (await selectServico.count()) await selectServico.selectOption({ index: 1 });

    // Barbeiro/profissional — primeira opção real
    const selectBarbeiro = page.locator('select[name="barbeiro"], select[name="profissional_id"]').first();
    if (await selectBarbeiro.count()) {
        await selectBarbeiro.selectOption({ index: 1 });
        const nomeBarbeiro = await selectBarbeiro.evaluate(
            el => el.options[el.selectedIndex]?.text || ''
        );
        salvarEstado({ barbeiroDeTeste: nomeBarbeiro });
    }

    // Submete
    await page.click(
        'button[type="submit"], button:has-text("Agendar"), button:has-text("Confirmar"), button:has-text("Salvar")'
    );

    // Verifica sucesso — rota retorna { sucesso: true }, frontend exibe toast
    await expect(
        page.locator('#toast, .toast, .alert-success')
            .or(page.locator('text=confirmado').or(page.locator('text=sucesso')).first())
    ).toBeVisible({ timeout: 10_000 });

    salvarEstado({ agendamentoData: display, agendamentoHora: hora });
    console.log('✅ Agendamento criado pelo admin para', display, 'às', hora);
});

// ── Teste de alteração de horário ─────────────────────────────────
test('03b — Admin altera o horário do agendamento criado', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Clica no agendamento "Cliente Teste Playwright" na agenda
    const cardAgendamento = page.locator(
        '.agendamento, .evento, [data-nome], .fc-event'
    ).filter({ hasText: 'Cliente Teste Playwright' }).first();

    await expect(cardAgendamento).toBeVisible({ timeout: 8_000 });
    await cardAgendamento.click();

    // Aguarda painel/modal de edição abrir
    const btnEditar = page.locator(
        'button:has-text("Editar"), button:has-text("Alterar"), a:has-text("Editar")'
    ).first();
    if (await btnEditar.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await btnEditar.click();
    }

    // Altera o horário para 11:00
    const campoHorario = page.locator(
        'input[name="horario"], input[name="hora_inicio"], select[name="horario"], select[name="hora_inicio"]'
    ).first();

    await expect(campoHorario).toBeVisible({ timeout: 6_000 });
    const tag = await campoHorario.evaluate(el => el.tagName.toLowerCase());
    tag === 'select'
        ? await campoHorario.selectOption({ label: '11:00' })
        : await campoHorario.fill('11:00');

    // Salva
    await page.click(
        'button[type="submit"], button:has-text("Salvar"), button:has-text("Atualizar"), button:has-text("Confirmar")'
    );

    // Confirma feedback
    await expect(
        page.locator('#toast, .toast, .alert-success')
            .or(page.locator('text=atualizado, text=alterado, text=salvo').first())
    ).toBeVisible({ timeout: 8_000 });

    console.log('✅ Horário alterado para 11:00');
});