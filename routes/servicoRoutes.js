const express = require('express');
const router = express.Router();
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Servico = require('../models/servico');

// GET - lista todos (admin)
router.get('/servicos/admin', isAdminAuthenticated, async (req, res) => {
    const servicos = await Servico.findAll({ where: { idEmpresa: req.user.idEmpresa }, order: [['nome', 'ASC']] });
    res.json({ servicos: servicos.map(s => ({ id: s.id, nome: s.nome, valor: s.valor, ativo: s.ativo, duracao_minutos: s.duracao_minutos })) });
});

// POST - adiciona novo serviço
router.post('/servicos', isAdminAuthenticated, async (req, res) => {
    const { nome, valor, duracao_minutos, qtd_sessoes } = req.body;
    try {
        await Servico.create({ nome, valor, duracao_minutos, qtd_sessoes: qtd_sessoes || null, idEmpresa: req.user.idEmpresa });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// PUT - edita serviço
router.put('/servicos/:id', isAdminAuthenticated, async (req, res) => {
    const { nome, valor, duracao_minutos } = req.body;
    try {
        await Servico.update({ nome, valor, duracao_minutos }, { where: { id: req.params.id } });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// PUT - ativa/desativa
router.put('/servicos/:id/toggle', isAdminAuthenticated, async (req, res) => {
    try {
        const s = await Servico.findByPk(req.params.id);
        await s.update({ ativo: !s.ativo });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;