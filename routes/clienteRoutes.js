const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Admin = require('../models/Admin');
const Agendamento = require('../models/Agendamento');
const Servico = require('../models/servico');
const Empresa = require('../models/Empresas');
const Cliente = require('../models/Cliente');
const Pacote = require('../models/Pacotes');
const { verificarConflito } = require('../helpers/conflito');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/db');

function normalizarTelefone(tel) {
    const numeros = tel.replace(/\D/g, '');
    const semDDI = numeros.startsWith('55') && numeros.length >= 12 ? numeros.slice(2) : numeros;
    if (semDDI.length === 11) return `(${semDDI.slice(0,2)}) ${semDDI.slice(2,7)}-${semDDI.slice(7)}`;
    if (semDDI.length === 10) return `(${semDDI.slice(0,2)}) ${semDDI.slice(2,6)}-${semDDI.slice(6)}`;
    return semDDI;
}

// ── Lista clientes (admin) ──
router.get('/clientes', isAdminAuthenticated, clienteController.listar);

// ── Edita cliente ──
router.patch('/clientes/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const { nome, telefone } = req.body;
        const telefoneNormalizado = normalizarTelefone(telefone);
        const cliente = await Cliente.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
        await Agendamento.update(
            { telefone: telefoneNormalizado },
            { where: { telefone: cliente.telefone, idEmpresa: req.user.idEmpresa } }
        );
        await cliente.update({ nome: nome.trim(), telefone: telefoneNormalizado });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + error.message });
    }
});

// ── Login cliente ──
router.post('/loginUsuario/:token', async (req, res) => {
    const { nome } = req.body;
    const telefone = normalizarTelefone(req.body.telefone);
    const { token } = req.params;
    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).send('Empresa não encontrada');
        const idEmpresa = empresa.id;
        let cliente = await Cliente.findOne({ where: { telefone, idEmpresa } });
        if (!cliente) cliente = await Cliente.create({ nome, telefone, idEmpresa });
        req.session.clienteId = cliente.id;
        req.session.clienteNome = cliente.nome;
        req.session.clienteTelefone = cliente.telefone;
        req.session.clienteEmpresaId = idEmpresa;
        res.redirect(`/agendar/${token}`);
    } catch (error) {
        res.render('loginUsuario', { erro: 'Erro ao fazer login.', token });
    }
});

// ── Tela de agendamento ──
router.get('/agendar/:token', async (req, res) => {
    try {
        const { token } = req.params;
        if (!req.session.clienteNome || !req.session.clienteTelefone) {
            return res.redirect(`/loginUsuario/${token}`);
        }
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).send('Empresa não encontrada');
        const idEmpresa = empresa.id;
        req.session.empresaId = idEmpresa;

        const [agendamentos, servicos, admins] = await Promise.all([
            Agendamento.findAll({ where: { idEmpresa }, attributes: ['data', 'horario'] }),
            Servico.findAll({ where: { ativo: true, idEmpresa }, order: [['nome', 'ASC']] }),
            Admin.findAll({ where: { idEmpresa, ativo: 'S' }, attributes: ['id', 'nome', 'foto'] })
        ]);

        const horariosOcupados = agendamentos.map(a => ({ data: a.data, horario: a.horario }));
        const servicosFormatados = servicos.map(s => ({
            id: s.id, nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ','),
            duracao_minutos: s.duracao_minutos,
            qtd_sessoes: s.qtd_sessoes || null
        }));
        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome, foto: a.foto || null }));

        const agendamentoSucesso = req.session.agendamentoSucesso || null;
        req.session.agendamentoSucesso = null;

        return res.render('agendar', {
            horariosOcupados, servicos: servicosFormatados, barbeiros,
            Sucesso: agendamentoSucesso?.mensagem || null,
            whatsappLink: agendamentoSucesso?.whatsappLink || null,
            token
        });
    } catch (error) {
        return res.render('agendar', { erro: 'Erro ao carregar.' });
    }
});

// ── Cliente agenda ──
router.post('/agendar/:token', async (req, res) => {
    const { barbeiro, data, horario, servico, profissional_id, hora_inicio, hora_fim, servico_id } = req.body;
    const { token } = req.params;
    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).send('Empresa não encontrada');
        const idEmpresa = empresa.id;

        let hiInicio = hora_inicio;
        let hiFim = hora_fim;
        if (!hiInicio || !hiFim) {
            const partes = horario.split(/\s*[–-]\s*/);
            hiInicio = partes[0]?.trim();
            hiFim = partes[1]?.trim();
        }

        const ocupado = await verificarConflito(barbeiro, data, hiInicio, hiFim, idEmpresa);
        if (ocupado) return res.render('agendar', { erro: `${barbeiro} já tem agendamento às ${hiInicio} neste dia.` });

        const servicoObj = await Servico.findOne({ where: { nome: servico, idEmpresa } });
        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        await Agendamento.create({
            barbeiro, nome: req.session.clienteNome, telefone: req.session.clienteTelefone,
            data, horario: hiInicio, servico, valor, idEmpresa,
            profissional_id: profissional_id || null,
            hora_inicio: hiInicio, hora_fim: hiFim || null,
            servico_id: servico_id || null, status: 'pendente'
        });

        let whatsappLink = null;
        if (profissional_id) {
            const adminProf = await Admin.findOne({ where: { id: profissional_id, idEmpresa }, attributes: ['telefone'] });
            const telefoneLimpo = adminProf?.telefone?.replace(/\D/g, '');
            const empresaObj = await Empresa.findByPk(idEmpresa, { attributes: ['observacao'] });
            if (telefoneLimpo) {
                const mensagem = encodeURIComponent(
                    `Olá! Acabei de agendar:\n📅 Data: ${data}\n⏰ Horário: ${hiInicio}\n✂️ Serviço: ${servico}\n👤 Profissional: ${barbeiro}` +
                    (empresaObj?.observacao ? `\n📌 ${empresaObj.observacao}` : '')
                );
                whatsappLink = `https://wa.me/55${telefoneLimpo}?text=${mensagem}`;
            }
        }

        req.session.agendamentoSucesso = { mensagem: 'Agendamento confirmado!', whatsappLink };
        return res.redirect(`/agendar/${token}`);
    } catch (error) {
        return res.render('agendar', { erro: 'Erro: ' + error.message });
    }
});

// ── Cliente agenda pacote ──
router.post('/pacote/:token', async (req, res) => {
    const { token } = req.params;
    const { barbeiro, profissional_id, servico, servico_id, sessoes } = req.body;
    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
        const idEmpresa = empresa.id;
        const nome = req.session.clienteNome;
        const telefone = req.session.clienteTelefone;
        if (!nome || !telefone) return res.status(401).json({ erro: 'Sessão expirada.' });

        const sessoesArray = JSON.parse(sessoes);

        for (const s of sessoesArray) {
            const ocupado = await verificarConflito(barbeiro, s.data, s.hora_inicio, s.hora_fim, idEmpresa);
            if (ocupado) return res.status(409).json({ erro: `Conflito no horário ${s.hora_inicio} do dia ${s.data}` });
        }

        const pacote = await Pacote.create({
            idEmpresa, servico_id, cliente_nome: nome, cliente_telefone: telefone,
            total_sessoes: sessoesArray.length, status: 'pendente'
        });

        const servicoObj = await Servico.findOne({ where: { id: servico_id, idEmpresa } });
        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        for (const s of sessoesArray) {
            const ag = await Agendamento.create({
                barbeiro, nome, telefone, email: null,
                data: s.data, horario: s.hora_inicio,
                hora_inicio: s.hora_inicio, hora_fim: s.hora_fim,
                servico, valor, idEmpresa,
                profissional_id: profissional_id || null,
                servico_id: servico_id || null, status: 'pendente', pago: 0
            });
            await sequelize.query(
                'UPDATE Agendamentos SET pacote_id = :pacoteId WHERE id = :id AND idEmpresa = :idEmpresa',
                { replacements: { pacoteId: pacote.id, id: ag.id, idEmpresa }, type: QueryTypes.UPDATE }
            );
        }

        let whatsappLink = null;
        if (profissional_id) {
            const adminProf = await Admin.findOne({ where: { id: profissional_id, idEmpresa }, attributes: ['telefone'] });
            const telefoneLimpo = adminProf?.telefone?.replace(/\D/g, '');
            if (telefoneLimpo) {
                const datasTexto = sessoesArray.map((s, i) => `📅 Sessão ${i+1}: ${s.data} às ${s.hora_inicio}`).join('\n');
                const mensagem = encodeURIComponent(`Olá! Acabei de agendar um pacote:\n✂️ Serviço: ${servico}\n👤 Profissional: ${barbeiro}\n${datasTexto}`);
                whatsappLink = `https://wa.me/55${telefoneLimpo}?text=${mensagem}`;
            }
        }

        return res.json({ sucesso: true, pacote_id: pacote.id, whatsappLink });
    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
});

module.exports = router;