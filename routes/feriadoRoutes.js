const express = require('express');
const router = express.Router();
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Feriado = require('../models/feriado');
const Empresa = require('../models/Empresas');

// GET - lista feriados (público)
router.get('/feriados', async (req, res) => {
    try {
        const dominio = req.hostname;
        const empresa = await Empresa.findOne({ where: { dominio } });
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });

        const feriados = await Feriado.findAll({
            attributes: ['data', 'descricao'],
            where: { idEmpresa: empresa.id }
        });

        res.json({ feriados: feriados.map(f => ({ data: f.data, descricao: f.descricao })) });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar feriados' });
    }
});

// POST - admin cadastra feriado
router.post('/feriados', isAdminAuthenticated, async (req, res) => {
    const { data, descricao } = req.body;
    try {
        await Feriado.create({ data, descricao, idEmpresa: req.user.idEmpresa });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Data já cadastrada ou erro ao salvar.' });
    }
});

// DELETE - admin remove feriado
router.delete('/feriados/:data', isAdminAuthenticated, async (req, res) => {
    try {
        await Feriado.destroy({ where: { data: req.params.data, idEmpresa: req.user.idEmpresa } });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover.' });
    }
});

module.exports = router;