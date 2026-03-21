const Agendamento = require('../models/Agendamento');

exports.listar = async (req, res) => {
    try {
        const empresaId = req.user.id; // ✅ vem do JWT

        const agendamentos = await Agendamento.findAll({
            where: { idEmpresa: empresaId },
            order: [['data', 'ASC'], ['horario', 'ASC']]
        });

        const formatados = agendamentos.map(a => {
            const data = new Date(a.data);
            data.setMinutes(data.getMinutes() + data.getTimezoneOffset());

            return {
                id: a.id,
                nome: a.nome,
                data: `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`,
                horario: a.horario,
                servico: a.servico,
                barbeiro: a.barbeiro
            };
        });

        res.json({ agendamentos: formatados }); // ✅ formato que o Flutter espera

    } catch (error) {
        console.error("ERRO LISTAR:", error);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos' });
    }
};