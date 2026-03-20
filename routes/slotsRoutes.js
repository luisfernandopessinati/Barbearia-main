const express = require('express');
const router = express.Router();
const Empresa = require('../models/Empresas');
const Agendamento = require('../models/Agendamento');
const { getSlotsDisponiveis } = require('../services/slotService');
const { Op } = require('sequelize');

router.get('/slots', async (req, res) => {
    const { profissional_id, servico_id, data, token } = req.query;
    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
        const slots = await getSlotsDisponiveis({
            profissional_id: parseInt(profissional_id),
            servico_id: parseInt(servico_id),
            data, idEmpresa: empresa.id
        });
        res.json({ slots });
    } catch (error) {
        res.json({ slots: [] });
    }
});

router.get('/horarios-ocupados', async (req, res) => {
    const { barbeiro, data, token } = req.query;
    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
        const inicioDia = new Date(`${data}T00:00:00.000Z`);
        const proximoDia = new Date(`${data}T00:00:00.000Z`);
        proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);
        const agendamentos = await Agendamento.findAll({
            where: { barbeiro, data: { [Op.gte]: inicioDia, [Op.lt]: proximoDia }, idEmpresa: empresa.id },
            attributes: ['horario']
        });
        res.json({ ocupados: agendamentos.map(a => a.horario) });
    } catch (error) {
        res.json({ ocupados: [] });
    }
});

module.exports = router;