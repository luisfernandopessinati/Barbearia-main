// Routes/Api/apiAgendamentos.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const autenticarToken = require('../../middlewares/authMiddleware');

const Agendamento = require('../../models/Agendamento');
const Servico     = require('../../models/servico');
const Admin       = require('../../models/Admin');
const Feriado     = require('../../models/feriado');
const Bloqueio    = require('../../models/Bloqueio');
const { verificarConflito } = require('../../helpers/conflito');

// Aplica JWT em todas as rotas deste arquivo
router.use(autenticarToken);

// ─── LISTAR ────────────────────────────────────────────────────────────────────
// GET /api/agendamentos?data=2025-01-20
// GET /api/agendamentos?data_inicio=2025-01-01&data_fim=2025-01-31
// GET /api/agendamentos?status=pendente
// GET /api/agendamentos?profissional_id=3
router.get('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { data, data_inicio, data_fim, status, profissional_id } = req.query;

        const where = { idEmpresa };

        if (data) {
            where.data = data;
        } else if (data_inicio && data_fim) {
            where.data = { [Op.between]: [data_inicio, data_fim] };
        }

        if (status) where.status = status;
        if (profissional_id) where.profissional_id = profissional_id;

        const agendamentos = await Agendamento.findAll({
            where,
            include: [
                { model: Servico, as: 'Servico', attributes: ['id', 'nome', 'valor', 'duracao_minutos'], required: false },
                { model: Admin, as: 'Profissional', attributes: ['id', 'nome', 'foto'], required: false }
            ],
            order: [['data', 'ASC'], ['hora_inicio', 'ASC']]
        });

        res.json({ success: true, data: agendamentos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao listar agendamentos', error: err.message });
    }
});

// ─── BUSCAR POR ID ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const agendamento = await Agendamento.findOne({
            where: { id: req.params.id, idEmpresa },
            include: [
                { model: Servico, as: 'Servico', attributes: ['id', 'nome', 'valor', 'duracao_minutos'], required: false },
                { model: Admin, as: 'Profissional', attributes: ['id', 'nome', 'foto'], required: false }
            ]
        });

        if (!agendamento) return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });

        res.json({ success: true, data: agendamento });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar agendamento', error: err.message });
    }
});

// ─── CRIAR ──────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const {
            profissional_id, barbeiro, nome, email, telefone,
            data, hora_inicio, hora_fim, horario,
            servico_id, servico, valor, pacote_id
        } = req.body;

        if (!nome || !telefone || !data) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: nome, telefone, data' });
        }

        if (!hora_inicio || !hora_fim) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: hora_inicio, hora_fim' });
        }

        // ── Validação 1: feriado ──────────────────────────────────────────────
        const feriado = await Feriado.findOne({ where: { data, idEmpresa } });
        if (feriado) {
            return res.status(409).json({
                success: false,
                code: 'FERIADO',
                message: `Dia bloqueado: ${feriado.descricao}`
            });
        }

        // ── Validação 2: bloqueio manual do profissional ──────────────────────
        if (profissional_id) {
            const bloqueio = await Bloqueio.findOne({
                where: {
                    idEmpresa, data,
                    [Op.or]: [
                        { profissional_id },          // bloqueio específico deste profissional
                        { profissional_id: null }      // bloqueio geral (todos)
                    ],
                    [Op.or]: [
                        { hora_inicio: null },         // dia inteiro bloqueado
                        {
                            hora_inicio: { [Op.lt]: hora_fim },
                            hora_fim:    { [Op.gt]: hora_inicio }
                        }
                    ]
                }
            });

            if (bloqueio) {
                return res.status(409).json({
                    success: false,
                    code: 'BLOQUEIO',
                    message: bloqueio.motivo
                        ? `Horário bloqueado: ${bloqueio.motivo}`
                        : 'Profissional indisponível neste horário'
                });
            }
        }

        // ── Validação 3: conflito com agendamento existente ───────────────────
        const nomeBarb = barbeiro || null;
        if (nomeBarb || profissional_id) {
            const conflito = await verificarConflito(
                nomeBarb,
                data,
                hora_inicio,
                hora_fim,
                idEmpresa
            );

            if (conflito) {
                return res.status(409).json({
                    success: false,
                    code: 'CONFLITO_HORARIO',
                    message: `Já existe um agendamento neste horário para ${nomeBarb || 'este profissional'}`
                });
            }
        }

        // ── Tudo ok — cria o agendamento ──────────────────────────────────────
        const novo = await Agendamento.create({
            idEmpresa,
            profissional_id,
            barbeiro: nomeBarb,
            nome, email, telefone,
            data, hora_inicio, hora_fim, horario,
            servico_id, servico, valor,
            pacote_id,
            status: 'pendente',
            pago: 0
        });

        res.status(201).json({ success: true, data: novo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao criar agendamento', error: err.message });
    }
});

// ─── EDITAR ─────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const agendamento = await Agendamento.findOne({ where: { id: req.params.id, idEmpresa } });

        if (!agendamento) return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });

        const {
            profissional_id, nome, email, telefone,
            data, hora_inicio, hora_fim, horario,
            servico_id, servico, valor, pago, pacote_id
        } = req.body;

        await agendamento.update({
            profissional_id, nome, email, telefone,
            data, hora_inicio, hora_fim, horario,
            servico_id, servico, valor, pago, pacote_id
        });

        res.json({ success: true, data: agendamento });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao editar agendamento', error: err.message });
    }
});

// ─── ALTERAR STATUS ─────────────────────────────────────────────────────────────
// PATCH /api/agendamentos/:id/status
// body: { status: 'confirmado' | 'cancelado' | 'concluido' | 'pendente' }
router.patch('/:id/status', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { status } = req.body;

        const statusValidos = ['pendente', 'confirmado', 'cancelado', 'concluido'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({ success: false, message: `Status inválido. Use: ${statusValidos.join(', ')}` });
        }

        const agendamento = await Agendamento.findOne({ where: { id: req.params.id, idEmpresa } });
        if (!agendamento) return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });

        await agendamento.update({ status });

        res.json({ success: true, data: agendamento });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao alterar status', error: err.message });
    }
});

// ─── MARCAR PAGO ────────────────────────────────────────────────────────────────
// PATCH /api/agendamentos/:id/pago
router.patch('/:id/pago', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { pago } = req.body; // 0 ou 1

        const agendamento = await Agendamento.findOne({ where: { id: req.params.id, idEmpresa } });
        if (!agendamento) return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });

        await agendamento.update({ pago: pago ? 1 : 0 });

        res.json({ success: true, data: agendamento });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar pagamento', error: err.message });
    }
});

// ─── SLOTS DISPONÍVEIS ──────────────────────────────────────────────────────────
// GET /api/agendamentos/slots?profissional_id=1&servico_id=2&data=2025-01-25
router.get('/slots/disponiveis', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { profissional_id, servico_id, data } = req.query;

        if (!profissional_id || !servico_id || !data) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: profissional_id, servico_id, data' });
        }

        // Verifica feriado
        const feriado = await Feriado.findOne({ where: { data, idEmpresa } });
        if (feriado) {
            return res.json({ success: true, feriado: true, message: feriado.descricao, slots: [] });
        }

        // Busca serviço para saber a duração
        const servico = await Servico.findOne({ where: { id: servico_id, idEmpresa } });
        if (!servico) return res.status(404).json({ success: false, message: 'Serviço não encontrado' });

        // Gera todos os slots do dia (07:00 às 22:00, intervalo de 30min)
        const slots = [];
        const timeToMinutes = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const minutesToTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
        const temColisao = (slot, ag) =>
            timeToMinutes(slot.hora_inicio) < timeToMinutes(ag.hora_fim) &&
            timeToMinutes(slot.hora_fim)    > timeToMinutes(ag.hora_inicio);

        let atual = 7 * 60;
        const fim  = 22 * 60;
        while (atual + servico.duracao_minutos <= fim) {
            slots.push({
                hora_inicio: minutesToTime(atual),
                hora_fim:    minutesToTime(atual + servico.duracao_minutos)
            });
            atual += 30;
        }

        // Busca agendamentos existentes no dia
        const agendamentos = await Agendamento.findAll({
            where: {
                profissional_id, idEmpresa, data,
                status:      { [Op.notIn]: ['cancelado'] },
                hora_inicio: { [Op.not]: null }
            },
            attributes: ['hora_inicio', 'hora_fim']
        });

        // Busca bloqueios do dia para este profissional
        const bloqueios = await Bloqueio.findAll({
            where: {
                idEmpresa, data,
                [Op.or]: [{ profissional_id }, { profissional_id: null }]
            }
        });

        // Marca cada slot como disponível ou indisponível
        const resultado = slots.map(slot => {
            const colideAgendamento = agendamentos.some(a => temColisao(slot, a));
            const colideBlockeio    = bloqueios.some(b =>
                !b.hora_inicio || temColisao(slot, { hora_inicio: b.hora_inicio, hora_fim: b.hora_fim })
            );
            return {
                ...slot,
                status: colideAgendamento || colideBlockeio ? 'indisponivel' : 'disponivel'
            };
        });

        res.json({ success: true, data: resultado });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar slots', error: err.message });
    }
});

// ─── EXCLUIR ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const agendamento = await Agendamento.findOne({ where: { id: req.params.id, idEmpresa } });

        if (!agendamento) return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });

        await agendamento.destroy();
        res.json({ success: true, message: 'Agendamento excluído' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao excluir agendamento', error: err.message });
    }
});

module.exports = router;