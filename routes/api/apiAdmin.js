const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/authMiddleware');

const Agendamento = require('../../models/Agendamento'); 

// 🔥 AGENDAMENTOS (APP)
router.get('/agendamentos', authMiddleware, async (req, res) => {
    try {
        const idEmpresa = req.user.empresa_id;

        const agendamentos = await Agendamento.findAll({
            where: { idEmpresa },
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

        res.json({ agendamentos: formatados });

    } catch (error) {
        console.error("ERRO API:", error);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos' });
    }
});

module.exports = router;