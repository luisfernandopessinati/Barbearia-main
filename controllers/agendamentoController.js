const Agendamento = require('../models/Agendamento');

exports.listar = async (req, res) => {
    const empresaId = req.empresaId;

    const agendamentos = await Agendamento.findAll({
        where: { empresaId }
    });

    res.json(agendamentos);
};