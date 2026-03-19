const HorarioFuncionamento = require('../models/HorarioFuncionamento');
const Agendamento = require('../models/Agendamento');
const Bloqueio = require('../models/Bloqueio');
const Servico = require('../models/servico');
const { Op } = require('sequelize');

async function getSlotsDisponiveis({ profissional_id, servico_id, data, idEmpresa }) {
    const diaSemana = new Date(data + 'T00:00:00').getDay();

    const horario = await HorarioFuncionamento.findOne({
        where: { profissional_id, dia_semana: diaSemana, ativo: true, idEmpresa }
    });

    if (!horario) return [];

    const servico = await Servico.findOne({ where: { id: servico_id, idEmpresa } });
    if (!servico) throw new Error('Serviço não encontrado');

    // Verifica se é hoje para filtrar horários passados
    const hoje = new Date().toISOString().split('T')[0];
    const isHoje = data === hoje;
    const minutosAgora = isHoje 
        ? new Date().getHours() * 60 + new Date().getMinutes()
        : 0;

    const slots = gerarSlots(horario.hora_inicio, horario.hora_fim, servico.duracao_minutos, minutosAgora);

    const agendamentos = await Agendamento.findAll({
        where: {
            profissional_id,
            idEmpresa,
            hora_inicio: { [Op.not]: null },
            status: { [Op.notIn]: ['cancelado'] },
            // filtra pela data usando DATEONLY
            data
        },
        attributes: ['hora_inicio', 'hora_fim']
    });

    const bloqueios = await Bloqueio.findAll({
        where: {
            data,
            idEmpresa,
            [Op.or]: [
                { profissional_id },
                { profissional_id: null }
            ]
        },
        attributes: ['hora_inicio', 'hora_fim']
    });

    return slots.map(slot => {
        const ocupado = agendamentos.some(a => temColisao(slot, a));
        const bloqueado = bloqueios.some(b => !b.hora_inicio || temColisao(slot, b));

        return {
            hora_inicio: slot.hora_inicio,
            hora_fim: slot.hora_fim,
            status: ocupado || bloqueado ? 'indisponivel' : 'disponivel'
        };
    });
}

function gerarSlots(horaInicio, horaFim, duracaoMinutos, minutosAgora = 0) {
    const slots = [];
    let atual = timeToMinutes(horaInicio);
    const fim = timeToMinutes(horaFim);

    while (atual + duracaoMinutos <= fim) {
        // Pula slots que já passaram se for hoje
        if (atual > minutosAgora) {
            slots.push({
                hora_inicio: minutesToTime(atual),
                hora_fim: minutesToTime(atual + duracaoMinutos)
            });
        }
        atual += 30; // 👈 slots de 30 em 30
    }
    return slots;
}

function temColisao(slot, ocupado) {
    const sI = timeToMinutes(slot.hora_inicio);
    const sF = timeToMinutes(slot.hora_fim);
    const oI = timeToMinutes(ocupado.hora_inicio);
    const oF = timeToMinutes(ocupado.hora_fim);
    return sI < oF && sF > oI;
}

function timeToMinutes(time) {
    const [h, m] = time.toString().substring(0, 5).split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${h}:${m}`;
}

module.exports = { getSlotsDisponiveis };
module.exports = { getSlotsDisponiveis, minutesToTime, temColisao, timeToMinutes };
