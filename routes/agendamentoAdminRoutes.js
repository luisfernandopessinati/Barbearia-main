const express = require('express');
const router = express.Router();
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Admin = require('../models/Admin');
const Agendamento = require('../models/Agendamento');
const Servico = require('../models/servico');
const { Op } = require('sequelize');
const registrarHistorico = require('../helpers/registrarHistorico'); // ← adicionar

function normalizarTelefone(tel) {
    const numeros = tel.replace(/\D/g, '');
    const semDDI = numeros.startsWith('55') && numeros.length >= 12 ? numeros.slice(2) : numeros;
    if (semDDI.length === 11) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 7)}-${semDDI.slice(7)}`;
    if (semDDI.length === 10) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 6)}-${semDDI.slice(6)}`;
    return semDDI;
}

// ── Editar agendamento (GET) ── sem alteração
router.get('/editar/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const idEmpresa = req.user.idEmpresa;
        const [agendamento, admins, servicos] = await Promise.all([
            Agendamento.findOne({ where: { id, idEmpresa } }),
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

// ── Editar agendamento (POST) ──
router.post('/editar/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const idEmpresa = req.user.idEmpresa;

        const agendamento = await Agendamento.findOne({ where: { id, idEmpresa } });
        if (!agendamento) return res.status(404).send('Agendamento não encontrado');

        // Salva os dados ANTES do update
        const dadosAntigos = JSON.parse(JSON.stringify(agendamento.get({ plain: true })));
      
        await agendamento.update({
            nome:            req.body.nome?.trim(),
            telefone:        normalizarTelefone(req.body.telefone),
            data:            req.body.data,
            horario:         req.body.horario,
            servico:         req.body.servico,
            barbeiro:        req.body.barbeiro,
            profissional_id: req.body.profissional_id,
            observacao:      req.body.observacao?.trim() || null
        });

        // dadosNovos montado manualmente do req.body
        const dadosNovos = {
            id:              agendamento.id,
            idEmpresa:       agendamento.idEmpresa,
            nome:            req.body.nome?.trim(),
            telefone:        normalizarTelefone(req.body.telefone),
            data:            req.body.data,
            horario:         req.body.horario,
            hora_inicio:     dadosAntigos.hora_inicio,
            hora_fim:        dadosAntigos.hora_fim,
            servico:         req.body.servico,
            barbeiro:        req.body.barbeiro,
            profissional_id: req.body.profissional_id,
            observacao:      req.body.observacao?.trim() || null,  // ← trim aqui
            status:          dadosAntigos.status,
            valor:           dadosAntigos.valor
        };

        await registrarHistorico(
            dadosNovos,
            'editado',
            'admin',
            req.user.id,
            req.user.nome,
            dadosAntigos
        );
        res.redirect('/admin');
    } catch (error) {
        res.status(500).send('Erro ao atualizar: ' + error.message);
    }
});

// ── Deletar agendamento ──
router.get('/deletar/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const idEmpresa = req.user.idEmpresa;

        // Busca ANTES de deletar — depois do destroy não tem mais snapshot
        const agendamento = await Agendamento.findOne({ where: { id, idEmpresa } });
        if (!agendamento) return res.redirect('/admin');

        // Histórico antes de destruir
        await registrarHistorico(
            agendamento,
            'excluido',
            'admin',
            req.user.id,
            req.user.nome
        );

        await agendamento.destroy();
        res.redirect('/admin');
    } catch (error) {
        res.send('Erro ao excluir o agendamento');
    }
});

module.exports = router;