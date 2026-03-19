const { Op } = require('sequelize');
const Agendamento = require('../models/Agendamento');

async function verificarConflito(barbeiro, data, horaInicio, horaFim, idEmpresa, idIgnorar = null) {
    const where = {
        barbeiro, idEmpresa, data,
        hora_inicio: { [Op.lt]: horaFim },
        hora_fim: { [Op.gt]: horaInicio }
    };
    if (idIgnorar) where.id = { [Op.ne]: idIgnorar };
    const conflito = await Agendamento.findOne({ where });
    return !!conflito;
}

module.exports = { verificarConflito };