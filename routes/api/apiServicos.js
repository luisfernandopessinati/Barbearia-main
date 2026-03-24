const express = require('express');
const router = express.Router();
const autenticarToken = require('../../middlewares/authMiddleware');
const Servico = require('../../models/servico');

// Aplica JWT em todas as rotas
router.use(autenticarToken);

// ─── LISTAR SERVIÇOS ATIVOS ────────────────────────────────────────────────────
// GET /api/servicos
// GET /api/servicos?todos=true  → inclui inativos (uso admin)
router.get('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { todos } = req.query;

        const where = { idEmpresa };
        if (!todos) where.ativo = true; // Por padrão só retorna ativos

        const servicos = await Servico.findAll({
            where,
            attributes: ['id', 'nome', 'valor', 'duracao_minutos', 'qtd_sessoes', 'ativo'],
            order: [['nome', 'ASC']],
        });

        res.json({ success: true, data: servicos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao listar serviços', error: err.message });
    }
});

// ─── BUSCAR POR ID ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;

        const servico = await Servico.findOne({
            where: { id: req.params.id, idEmpresa },
            attributes: ['id', 'nome', 'valor', 'duracao_minutos', 'qtd_sessoes', 'ativo'],
        });

        if (!servico) return res.status(404).json({ success: false, message: 'Serviço não encontrado' });

        res.json({ success: true, data: servico });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar serviço', error: err.message });
    }
});

// ─── CRIAR ─────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { nome, valor, duracao_minutos, qtd_sessoes } = req.body;

        if (!nome || valor === undefined || !duracao_minutos) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: nome, valor, duracao_minutos' });
        }

        const novo = await Servico.create({
            idEmpresa,
            nome,
            valor,
            duracao_minutos,
            qtd_sessoes: qtd_sessoes ?? null,
            ativo: true,
        });

        res.status(201).json({ success: true, data: novo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao criar serviço', error: err.message });
    }
});

// ─── EDITAR ────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const servico = await Servico.findOne({ where: { id: req.params.id, idEmpresa } });

        if (!servico) return res.status(404).json({ success: false, message: 'Serviço não encontrado' });

        const { nome, valor, duracao_minutos, qtd_sessoes, ativo } = req.body;

        await servico.update({ nome, valor, duracao_minutos, qtd_sessoes, ativo });

        res.json({ success: true, data: servico });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao editar serviço', error: err.message });
    }
});

// ─── ATIVAR / DESATIVAR ────────────────────────────────────────────────────────
// PATCH /api/servicos/:id/status
// body: { ativo: true | false }
router.patch('/:id/status', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { ativo } = req.body;

        if (typeof ativo !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Campo obrigatório: ativo (boolean)' });
        }

        const servico = await Servico.findOne({ where: { id: req.params.id, idEmpresa } });
        if (!servico) return res.status(404).json({ success: false, message: 'Serviço não encontrado' });

        await servico.update({ ativo });

        res.json({ success: true, data: servico });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao alterar status do serviço', error: err.message });
    }
});

// ─── EXCLUIR ───────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const servico = await Servico.findOne({ where: { id: req.params.id, idEmpresa } });

        if (!servico) return res.status(404).json({ success: false, message: 'Serviço não encontrado' });

        await servico.destroy();
        res.json({ success: true, message: 'Serviço excluído' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao excluir serviço', error: err.message });
    }
});

module.exports = router;
