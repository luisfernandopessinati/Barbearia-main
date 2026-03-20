const express = require('express');
const router = express.Router();
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Admin = require('../models/Admin');
const Agendamento = require('../models/Agendamento');
const Servico = require('../models/servico');
const { Op } = require('sequelize');

// ── Editar agendamento ──
router.get('/editar/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const idEmpresa = req.user.idEmpresa;
        const [agendamento, admins, servicos] = await Promise.all([
            Agendamento.findByPk(id, { where: { idEmpresa } }),
            Admin.findAll({ where: { idEmpresa }, attributes: ['id', 'nome'] }),
            Servico.findAll({ where: { ativo: true, idEmpresa }, order: [['nome', 'ASC']] })
        ]);
        if (!agendamento) return res.status(404).send('Agendamento não encontrado');
        const plain = agendamento.get({ plain: true });
        const data = new Date(plain.data);
        data.setMinutes(data.getMinutes() + data.getTimezoneOffset());
        plain.data = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));
        const servicosFormatados = servicos.map(s => ({
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ','),
            qtd_sessoes: s.qtd_sessoes || null
        }));
        res.render('editar', { agendamento: plain, barbeiros, servicos: servicosFormatados });
    } catch (error) {
        res.status(500).send('Erro ao buscar agendamento: ' + error.message);
    }
});

router.post('/editar/:id', isAdminAuthenticated, (req, res) => {
    Agendamento.update(
        { nome: req.body.nome, telefone: req.body.telefone, data: req.body.data,
          horario: req.body.horario, servico: req.body.servico, barbeiro: req.body.barbeiro,
          profissional_id: req.body.profissional_id },
        { where: { id: req.params.id, idEmpresa: req.user.idEmpresa } }
    ).then(() => res.redirect('/admin'))
     .catch(error => res.status(500).send('Erro ao atualizar: ' + error.message));
});

// ── Deletar agendamento ──
router.get('/deletar/:id', isAdminAuthenticated, (req, res) => {
    Agendamento.destroy({ where: { id: req.params.id } })
        .then(() => res.redirect('/admin'))
        .catch(() => res.send('Erro ao excluir o agendamento'));
});

// ── Dashboard dados ──
router.get('/admin/dashboard/dados', isAdminAuthenticated, async (req, res) => {
    try {
        const fim = req.query.fim ? new Date(req.query.fim) : new Date();
        const inicio = req.query.inicio ? new Date(req.query.inicio) : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);
        fim.setHours(23, 59, 59, 999);
        inicio.setHours(0, 0, 0, 0);

        const agendamentos = await Agendamento.findAll({
            where: { data: { [Op.between]: [inicio, fim] }, idEmpresa: req.user.idEmpresa },
            order: [['data', 'ASC']]
        });
        const lista = agendamentos.map(a => a.get({ plain: true }));

        const evolucao = {};
        lista.forEach(a => {
            const d = new Date(a.data);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!evolucao[dia]) evolucao[dia] = {};
            const barb = a.barbeiro || 'Sem barbeiro';
            evolucao[dia][barb] = (evolucao[dia][barb] || 0) + 1;
        });

        const servicosPorBarbeiro = {};
        lista.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            if (!servicosPorBarbeiro[barb]) servicosPorBarbeiro[barb] = {};
            servicosPorBarbeiro[barb][a.servico] = (servicosPorBarbeiro[barb][a.servico] || 0) + 1;
        });

        const porBarbeiro = {};
        const faturamentoPorBarbeiro = {};
        const porServico = {};
        let faturamentoTotal = 0;

        lista.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            porBarbeiro[barb] = (porBarbeiro[barb] || 0) + 1;
            faturamentoPorBarbeiro[barb] = (faturamentoPorBarbeiro[barb] || 0) + parseFloat(a.valor || 0);
            porServico[a.servico] = (porServico[a.servico] || 0) + 1;
            faturamentoTotal += parseFloat(a.valor || 0);
        });

        const topBarbeiro = Object.entries(porBarbeiro).sort((a, b) => b[1] - a[1])[0];
        const topServico = Object.entries(porServico).sort((a, b) => b[1] - a[1])[0];

        res.json({
            periodo: { inicio: inicio.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] },
            kpis: { totalAgendamentos: lista.length, faturamentoTotal: faturamentoTotal.toFixed(2),
                topBarbeiro: topBarbeiro ? { nome: topBarbeiro[0], count: topBarbeiro[1] } : null,
                topServico: topServico ? { nome: topServico[0], count: topServico[1] } : null },
            evolucao, servicosPorBarbeiro, faturamentoPorBarbeiro, porBarbeiro
        });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

module.exports = router;