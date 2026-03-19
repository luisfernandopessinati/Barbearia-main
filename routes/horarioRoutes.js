const express = require('express');
const router = express.Router();
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const HorarioFuncionamento = require('../models/HorarioFuncionamento');

// GET - lista horários de um profissional
router.get('/horarios-funcionamento', isAdminAuthenticated, async (req, res) => {
    const { profissional_id } = req.query;
    try {
        const horarios = await HorarioFuncionamento.findAll({
            where: { profissional_id, idEmpresa: req.user.idEmpresa },
            order: [['dia_semana', 'ASC']]
        });
        res.json({ horarios });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// POST - cria novo horário
router.post('/horarios-funcionamento', isAdminAuthenticated, async (req, res) => {
    const { profissional_id, dia_semana, hora_inicio, hora_fim } = req.body;
    const idEmpresa = req.user.idEmpresa;
    try {
        const existente = await HorarioFuncionamento.findOne({
            where: { profissional_id, dia_semana, idEmpresa }
        });
        if (existente) return res.status(409).json({ erro: 'Já existe um horário para este dia. Remova o anterior primeiro.' });

        await HorarioFuncionamento.create({ profissional_id, dia_semana, hora_inicio, hora_fim, idEmpresa, ativo: true });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// DELETE - remove um horário
router.delete('/horarios-funcionamento/:id', isAdminAuthenticated, async (req, res) => {
    try {
        await HorarioFuncionamento.destroy({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

module.exports = router;