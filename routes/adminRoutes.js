const express = require('express');
const router = express.Router();
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Admin = require('../models/Admin');
const Agendamento = require('../models/Agendamento');
const Servico = require('../models/servico');
const Empresa = require('../models/Empresas');
const Pacote = require('../models/Pacotes');
const Cliente = require('../models/Cliente');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const uploadAdmins = require('../config/multerAdmins');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/db');
const { verificarConflito } = require('../helpers/conflito');
const { minutesToTime, temColisao } = require('../services/slotService');
const registrarHistorico = require('../helpers/registrarHistorico');

function normalizarTelefone(tel) {
    const numeros = tel.replace(/\D/g, '');
    const semDDI = numeros.startsWith('55') && numeros.length >= 12 ? numeros.slice(2) : numeros;
    if (semDDI.length === 11) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 7)}-${semDDI.slice(7)}`;
    if (semDDI.length === 10) return `(${semDDI.slice(0, 2)}) ${semDDI.slice(2, 6)}-${semDDI.slice(6)}`;
    return semDDI;
}

// ── Lista admins ──
router.get('/admins', isAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.findAll({
            where: { idEmpresa: req.user.idEmpresa },
            attributes: ['id', 'nome', 'email', 'role', 'ativo', 'telefone', 'foto'],
            order: [['nome', 'ASC']]
        });
        res.json({ admins });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar admins: ' + error.message });
    }
});

// ── Cria admin ──
router.post('/admins', isAdminAuthenticated, async (req, res) => {
    try {
        const { nome, email, senha, role, telefone } = req.body;
        if (!nome || !email || !senha || !telefone) return res.status(400).json({ erro: 'Preencha todos os campos.' });
        if (senha.length < 6) return res.status(400).json({ erro: 'Senha mínima de 6 caracteres.' });

        const emailNormalizado = email.trim().toLowerCase();
        const jaExiste = await Admin.findOne({ where: { email: emailNormalizado } });
        if (jaExiste) return res.status(409).json({ erro: 'Já existe um admin com este e-mail.' });

        const hashSenha = await bcrypt.hash(senha, 10);
        const novo = await Admin.create({
            nome: nome.trim(), email: emailNormalizado, senha: hashSenha,
            telefone: telefone.trim(), idEmpresa: req.user.idEmpresa,
            ativo: 'S', role: role === 'owner' ? 'owner' : 'admin'
        });
        res.json({ sucesso: true, id: novo.id });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao criar admin: ' + error.message });
    }
});

// ── Inativa admin ──
router.delete('/admins/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const admin = await Admin.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado.' });
        if (admin.role === 'owner') return res.status(403).json({ erro: 'Não é possível remover um Owner.' });
        await admin.update({ ativo: false });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover admin: ' + error.message });
    }
});

// ── Reativa admin ──
router.patch('/admins/:id/reativar', isAdminAuthenticated, async (req, res) => {
    try {
        const admin = await Admin.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado.' });
        await admin.update({ ativo: 'S' });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao reativar: ' + error.message });
    }
});

// ── Edita nome ──
router.patch('/admins/:id/nome', isAdminAuthenticated, async (req, res) => {
    try {
        const { nome } = req.body;
        if (!nome || nome.trim().length < 2) return res.status(400).json({ erro: 'Nome inválido.' });
        const admin = await Admin.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado.' });
        await admin.update({ nome: nome.trim() });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar nome: ' + error.message });
    }
});

// ── Edita telefone ──
router.patch('/admins/:id/telefone', isAdminAuthenticated, async (req, res) => {
    try {
        const { telefone } = req.body;
        if (!telefone || telefone.trim().length < 8) return res.status(400).json({ erro: 'Telefone inválido.' });
        const admin = await Admin.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado.' });
        await admin.update({ telefone: telefone.trim() });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar telefone: ' + error.message });
    }
});

// ── Foto admin ──
router.post('/admins/:id/foto', isAdminAuthenticated, uploadAdmins.single('foto'), async (req, res) => {
    try {
        const admin = await Admin.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado.' });
        if (admin.foto) {
            const fotoAntiga = path.join(__dirname, '../public', admin.foto);
            if (fs.existsSync(fotoAntiga)) fs.unlinkSync(fotoAntiga);
        }
        await admin.update({ foto: `/uploads/admins/${req.file.filename}` });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao salvar foto: ' + error.message });
    }
});

// ── Painel admin ──
router.get('/admin', isAdminAuthenticated, async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const [agendamentos, admins, servicos, empresa] = await Promise.all([
            Agendamento.findAll({ where: { idEmpresa, status: { [Op.ne]: 'cancelado' } } }),
            Admin.findAll({ where: { idEmpresa }, attributes: ['id', 'nome', 'email', 'role', 'ativo'] }),
            Servico.findAll({ where: { ativo: true, idEmpresa }, order: [['nome', 'ASC']] }),
            Empresa.findByPk(idEmpresa)
        ]);

        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));
        const servicosFormatados = servicos.map(s => ({
            id: s.id, nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ','),
            qtd_sessoes: s.qtd_sessoes || null
        }));

        const agendamentosFormatados = agendamentos.map(agendamento => {
            const data = new Date(agendamento.data);
            data.setMinutes(data.getMinutes() + data.getTimezoneOffset());
            return {
                id: agendamento.id,
                nome: agendamento.nome,
                telefone: agendamento.telefone,
                data: `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`,
                horario: agendamento.horario,
                hora_fim: agendamento.hora_fim ? agendamento.hora_fim.substring(0, 5) : '',
                servico: agendamento.servico,
                barbeiro: agendamento.barbeiro,
                pago: agendamento.pago || 0,
                pacote_id: agendamento.pacote_id || null,
                status: agendamento.status,
                alerta_faltou: agendamento.alerta_faltou || false
            };
        });

        res.render('admin', {
            agendamentos: agendamentosFormatados,
            barbeiros,
            servicos: servicosFormatados,
            empresa: empresa ? empresa.get({ plain: true }) : null
        });
    } catch (error) {
        res.render('admin', { erro: 'Erro ao buscar dados: ' + error.message });
    }
});

// ── Slots admin ──
router.get('/admin/slots', isAdminAuthenticated, async (req, res) => {
    const { profissional_id, servico_id, data } = req.query;
    const idEmpresa = req.user.idEmpresa;
    try {
        const servico = await Servico.findOne({ where: { id: servico_id, idEmpresa } });
        if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });

        const slots = [];
        let atual = 7 * 60;
        const fim = 22 * 60;
        while (atual + servico.duracao_minutos <= fim) {
            slots.push({ hora_inicio: minutesToTime(atual), hora_fim: minutesToTime(atual + servico.duracao_minutos) });
            atual += 30;
        }

        const agendamentos = await Agendamento.findAll({
            where: { profissional_id, idEmpresa, data, status: { [Op.notIn]: ['cancelado'] }, hora_inicio: { [Op.not]: null } },
            attributes: ['hora_inicio', 'hora_fim']
        });

        res.json({ slots: slots.map(slot => ({ ...slot, status: agendamentos.some(a => temColisao(slot, a)) ? 'indisponivel' : 'disponivel' })) });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});
// ── Admin agenda ──
router.post('/admin/agendar', isAdminAuthenticated, async (req, res) => {
    const { barbeiro, nome, telefone, data, horario, servico, profissional_id, hora_inicio, hora_fim, servico_id } = req.body;
    const idEmpresa = req.user.idEmpresa;
    const tipo = req.body.tipo || 'agendamento';
    const isCompromisso = tipo === 'compromisso';

    try {
        let hiInicio, hiFim;
        if (isCompromisso) {
            hiInicio = req.body.compromisso_inicio;
            hiFim = req.body.compromisso_fim;
            if (!hiInicio || !hiFim) return res.status(400).json({ erro: 'Informe hora início e fim do compromisso.' });
        } else {
            hiInicio = hora_inicio;
            hiFim = hora_fim;
            if (!hiInicio || !hiFim) {
                const partes = (horario || '').split(/\s*[–-]\s*/);
                hiInicio = partes[0]?.trim();
                hiFim = partes[1]?.trim();
            }
        }

        const ocupado = await verificarConflito(barbeiro, data, hiInicio, hiFim, idEmpresa);
        if (ocupado) return res.status(409).json({ erro: `${barbeiro} já tem agendamento às ${hiInicio} neste dia.` });

        const servicoObj = !isCompromisso ? await Servico.findOne({ where: { nome: servico, idEmpresa } }) : null;
        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;
        let alertaFaltou = false;
        if (!isCompromisso && telefone) {
            const telNormalizado = normalizarTelefone(telefone);
            const ultimoAgendamento = await sequelize.query(`
        SELECT status FROM Agendamentos
        WHERE telefone = :telefone
          AND idEmpresa = :idEmpresa
          AND status NOT IN ('cancelado')
          AND data < :data
        ORDER BY data DESC, horario DESC
        LIMIT 1
    `, {
                replacements: { telefone: telNormalizado, idEmpresa, data },
                type: QueryTypes.SELECT
            });

            if (ultimoAgendamento.length > 0 && ultimoAgendamento[0].status === 'cliente_faltou') {
                alertaFaltou = true;
            }
        }
        const novoAgendamento = await Agendamento.create({
            barbeiro,
            nome: isCompromisso ? (req.body.motivo || 'Compromisso') : nome,
            email: null,
            telefone: isCompromisso ? '999999999' : normalizarTelefone(telefone),
            data, horario: hiInicio,
            servico: isCompromisso ? null : servico,
            valor, idEmpresa,
            profissional_id: profissional_id || null,
            hora_inicio: hiInicio, hora_fim: hiFim || null,
            servico_id: isCompromisso ? null : (servico_id || null),
            status: isCompromisso ? 'compromisso' : 'pendente',
            observacao: isCompromisso ? null : (req.body.observacao || null),
            alerta_faltou: alertaFaltou
        });

        // ── Histórico ──
        await registrarHistorico(
            novoAgendamento,
            'criado',
            'admin',
            req.user.id,
            req.user.nome
        );

        if (!isCompromisso && nome && telefone) {
            const telNormalizado = normalizarTelefone(telefone);
            const [cliente] = await Cliente.findOrCreate({
                where: { telefone: telNormalizado, idEmpresa },
                defaults: { nome: nome.trim(), telefone: telNormalizado, idEmpresa }
            });
            if (cliente.nome !== nome.trim()) await cliente.update({ nome: nome.trim() });
        }

        return res.status(200).json({ sucesso: true });
    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
});
// ── Admin pacote ──
router.post('/admin/pacote', isAdminAuthenticated, async (req, res) => {
    const { nome, telefone, servico, servico_id, barbeiro, profissional_id, sessoes } = req.body;
    try {
        const sessoesArray = JSON.parse(sessoes);

        for (const s of sessoesArray) {
            const ocupado = await verificarConflito(barbeiro, s.data, s.hora_inicio, s.hora_fim, req.user.idEmpresa);
            if (ocupado) return res.status(409).json({ erro: `Conflito no horário ${s.hora_inicio} do dia ${s.data}` });
        }

        const pacote = await Pacote.create({
            idEmpresa: req.user.idEmpresa, servico_id,
            cliente_nome: nome, cliente_telefone: normalizarTelefone(telefone),
            total_sessoes: sessoesArray.length, status: 'pendente'
        });

        const servicoObj = await Servico.findOne({ where: { id: servico_id, idEmpresa: req.user.idEmpresa } });
        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        for (const s of sessoesArray) {
            const ag = await Agendamento.create({
                barbeiro, nome, telefone: normalizarTelefone(telefone), email: null,
                data: s.data, horario: s.hora_inicio,
                hora_inicio: s.hora_inicio, hora_fim: s.hora_fim,
                servico, valor, idEmpresa: req.user.idEmpresa,
                profissional_id: profissional_id || null,
                servico_id: servico_id || null, status: 'pendente', pago: 0
            });
            await sequelize.query(
                'UPDATE Agendamentos SET pacote_id = :pacoteId WHERE id = :id AND idEmpresa = :idEmpresa',
                { replacements: { pacoteId: pacote.id, id: ag.id, idEmpresa: req.user.idEmpresa }, type: QueryTypes.UPDATE }
            );

            // ── Histórico por sessão ──
            await registrarHistorico(
                { ...ag.get({ plain: true }), pacote_id: pacote.id },
                'criado',
                'admin',
                req.user.id,
                req.user.nome
            );
        }

        if (nome && telefone) {
            const telNormalizado = normalizarTelefone(telefone);
            const [cliente] = await Cliente.findOrCreate({
                where: { telefone: telNormalizado, idEmpresa: req.user.idEmpresa },
                defaults: { nome: nome.trim(), telefone: telNormalizado, idEmpresa: req.user.idEmpresa }
            });
            if (cliente.nome !== nome.trim()) await cliente.update({ nome: nome.trim() });
        }

        return res.status(200).json({ sucesso: true, pacote_id: pacote.id });
    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
});
// ── Marcar pago ──
router.patch('/agendamentos/:id/pago', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const idEmpresa = req.user.idEmpresa;

        const rows = await sequelize.query(
            'SELECT * FROM Agendamentos WHERE id = :id AND idEmpresa = :idEmpresa',
            { replacements: { id, idEmpresa }, type: QueryTypes.SELECT }
        );
        if (!rows.length) return res.status(404).json({ erro: 'Não encontrado' });

        const novoPago = rows[0].pago ? 0 : 1;
        const pacoteId = rows[0].pacote_id;

        if (pacoteId) {
            await sequelize.query(
                'UPDATE Agendamentos SET pago = :novoPago WHERE pacote_id = :pacoteId AND idEmpresa = :idEmpresa',
                { replacements: { novoPago, pacoteId, idEmpresa }, type: QueryTypes.UPDATE }
            );
            await sequelize.query(
                'UPDATE Pacotes SET pago = :novoPago WHERE id = :pacoteId AND idEmpresa = :idEmpresa',
                { replacements: { novoPago, pacoteId, idEmpresa }, type: QueryTypes.UPDATE }
            );
        } else {
            await sequelize.query(
                'UPDATE Agendamentos SET pago = :novoPago WHERE id = :id AND idEmpresa = :idEmpresa',
                { replacements: { novoPago, id, idEmpresa }, type: QueryTypes.UPDATE }
            );
        }

        // ── Histórico ──
        await registrarHistorico(
            { ...rows[0], pago: novoPago },
            'pago',
            'admin',
            req.user.id,
            req.user.nome
        );

        return res.json({ sucesso: true, pago: novoPago });
    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
});

//atualizar agendamentos
router.get('/admin/agendamentos-json', isAdminAuthenticated, async (req, res) => {
    try {
        const agendamentos = await Agendamento.findAll({
            where: { idEmpresa: req.user.idEmpresa },
            order: [['data', 'ASC'], ['horario', 'ASC']]
        });
        const formatados = agendamentos.map(a => {
            const d = new Date(a.data);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            return {
                id: a.id,
                nome: a.nome,
                telefone: a.telefone,
                data: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
                horario: a.horario,
                hora_fim: a.hora_fim ? a.hora_fim.substring(0, 5) : '',
                servico: a.servico,
                barbeiro: a.barbeiro,
                pago: a.pago || 0,
                status: a.status,
                alerta_faltou: a.alerta_faltou || false,
                pacote_id: a.pacote_id || null
            };
        });
        res.json({ agendamentos: formatados });
    } catch (e) {
        res.status(500).json({ erro: 'Erro ao buscar agendamentos' });
    }
});

// ── Dashboard ──
router.get('/admin/bodashard', isAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.findAll({ attributes: ['nome'], where: { idEmpresa: req.user.idEmpresa } });
        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));
        res.render('dashboard', { barbeiros });
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

//retornar mensagem de confirmação
router.get('/admin/empresa-observacao', isAdminAuthenticated, async (req, res) => {
    try {
        const empresa = await Empresa.findOne({
            where: { id: req.user.idEmpresa },
            attributes: ['observacao']
        });
        res.json({ observacao: empresa?.observacao || '' });
    } catch (e) {
        res.status(500).json({ observacao: '' });
    }
});

// ── Notificações do sininho ──
router.get('/admin/notificacoes', isAdminAuthenticated, async (req, res) => {
    try {
        const AgendamentoHistorico = require('../models/AgendamentoHistorico');
        const notificacoes = await AgendamentoHistorico.findAll({
            where: {
                idEmpresa: req.user.idEmpresa,
                feito_por: 'cliente',
                visto_admin: 0
            },
            order: [['createdAt', 'DESC']],
            limit: 20
        });
        res.json({
            sucesso: true, notificacoes: notificacoes.map(n => ({
                id: n.id,
                acao: n.acao,
                nome: n.nome,
                servico: n.servico,
                barbeiro: n.barbeiro,
                data: n.data,
                hora_inicio: n.hora_inicio,
                feito_por_nome: n.feito_por_nome,
                createdAt: n.createdAt
            }))
        });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// ── Marcar cliente faltou ──
router.patch('/agendamentos/:id/cliente-faltou', isAdminAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const idEmpresa = req.user.idEmpresa;

        // Busca o agendamento atual
        const rows = await sequelize.query(
            'SELECT * FROM Agendamentos WHERE id = :id AND idEmpresa = :idEmpresa',
            { replacements: { id, idEmpresa }, type: QueryTypes.SELECT }
        );
        if (!rows.length) return res.status(404).json({ erro: 'Agendamento não encontrado.' });

        const ag = rows[0];

        // Marca o agendamento atual como cliente_faltou
        await sequelize.query(
            'UPDATE Agendamentos SET status = "cliente_faltou" WHERE id = :id AND idEmpresa = :idEmpresa',
            { replacements: { id, idEmpresa }, type: QueryTypes.UPDATE }
        );

        // Busca o próximo agendamento futuro deste cliente (pelo telefone)
        const proximos = await sequelize.query(`
            SELECT id FROM Agendamentos
            WHERE telefone = :telefone
              AND idEmpresa = :idEmpresa
              AND status NOT IN ('cancelado', 'cliente_faltou', 'concluido')
              AND data > :data
            ORDER BY data ASC, horario ASC
            LIMIT 1
        `, {
            replacements: { telefone: ag.telefone, idEmpresa, data: ag.data },
            type: QueryTypes.SELECT
        });

        // Se existe próximo agendamento, marca o alerta
        if (proximos.length > 0) {
            await sequelize.query(
                'UPDATE Agendamentos SET alerta_faltou = 1 WHERE id = :id AND idEmpresa = :idEmpresa',
                { replacements: { id: proximos[0].id, idEmpresa }, type: QueryTypes.UPDATE }
            );
        }

        // Histórico
        await registrarHistorico(
            { ...ag, status: 'cliente_faltou' },
            'cliente_faltou',
            'admin',
            req.user.id,
            req.user.nome
        );

        return res.json({ sucesso: true });
    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
});


// cliente chegou confirmar agendamento 
router.patch('/agendamentos/:id/desfazer-faltou', isAdminAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        const idEmpresa = req.user.idEmpresa;

        // Busca telefone E data do agendamento atual
        const rows = await sequelize.query(
            'SELECT telefone, data FROM Agendamentos WHERE id = :id AND idEmpresa = :idEmpresa',
            { replacements: { id, idEmpresa }, type: QueryTypes.SELECT }
        );

        if (!rows.length) return res.status(404).json({ erro: 'Agendamento não encontrado.' });

        const { telefone, data } = rows[0];

        // Volta o agendamento para pendente
        await sequelize.query(
            'UPDATE Agendamentos SET status = "pendente" WHERE id = :id AND idEmpresa = :idEmpresa',
            { replacements: { id, idEmpresa }, type: QueryTypes.UPDATE }
        );

        // Remove o alerta só do próximo agendamento APÓS a data atual
        await sequelize.query(`
            UPDATE Agendamentos SET alerta_faltou = 0
            WHERE telefone = :telefone
              AND idEmpresa = :idEmpresa
              AND alerta_faltou = 1
              AND data > :data
            ORDER BY data ASC
            LIMIT 1
        `, {
            replacements: { telefone, idEmpresa, data },
            type: QueryTypes.UPDATE
        });

        return res.json({ sucesso: true });
    } catch (e) {
        console.error('ERRO desfazer-faltou:', e.message);
        return res.status(500).json({ erro: e.message });
    }
});

// ── Dashboard ──
router.get('/admin/dashboard', isAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.findAll({ attributes: ['nome'], where: { idEmpresa: req.user.idEmpresa } });
        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));
        res.render('dashboard', { barbeiros });
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

router.post('/admin/notificacoes/marcar-visto', isAdminAuthenticated, async (req, res) => {
    try {
        const AgendamentoHistorico = require('../models/AgendamentoHistorico');
        await AgendamentoHistorico.update(
            { visto_admin: 1, visto_em: new Date() },
            { where: { idEmpresa: req.user.idEmpresa, feito_por: 'cliente', visto_admin: 0 } }
        );
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});


router.get('/admin/dashboard/dados', isAdminAuthenticated, async (req, res) => {
    try {
        const fim = req.query.fim ? new Date(req.query.fim + 'T12:00:00') : new Date();
        const inicio = req.query.inicio ? new Date(req.query.inicio + 'T12:00:00') : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);
        fim.setHours(23, 59, 59, 999);
        inicio.setHours(0, 0, 0, 0);

        const agendamentos = await Agendamento.findAll({
            where: {
                idEmpresa: req.user.idEmpresa,
                data:      { [Op.between]: [inicio, fim] },
                status:    { [Op.in]: ['pendente', 'compromisso'] },
            },
            order: [['data', 'ASC']]
        });
        const lista = agendamentos.map(a => a.get({ plain: true }));

        // ── Deduplica combos: um pacote_id = um agendamento ──────────────
        // Para KPIs e evolução, cada pacote_id conta 1x (pelo primeiro item)
        const vistos = new Set();
        const listaDedup = lista.filter(a => {
            if (!a.pacote_id) return true;           // serviço avulso → sempre inclui
            if (vistos.has(a.pacote_id)) return false; // combo já visto → ignora
            vistos.add(a.pacote_id);
            return true;                              // primeiro do combo → inclui
        });

        // ── Evolução por barbeiro (usa lista dedup) ───────────────────────
        const evolucao = {};
        listaDedup.forEach(a => {
            const d = new Date(a.data);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!evolucao[dia]) evolucao[dia] = {};
            const barb = a.barbeiro || 'Sem barbeiro';
            evolucao[dia][barb] = (evolucao[dia][barb] || 0) + 1;
        });

        // ── Serviços por barbeiro (usa lista COMPLETA — mostra todos os serviços do combo) ──
        const servicosPorBarbeiro = {};
        lista.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            if (!servicosPorBarbeiro[barb]) servicosPorBarbeiro[barb] = {};
            servicosPorBarbeiro[barb][a.servico] = (servicosPorBarbeiro[barb][a.servico] || 0) + 1;
        });

        // ── KPIs (usa lista dedup) ────────────────────────────────────────
        const porBarbeiro = {};
        const faturamentoPorBarbeiro = {};
        const porServico = {};
        let faturamentoTotal = 0;

        listaDedup.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            porBarbeiro[barb] = (porBarbeiro[barb] || 0) + 1;
            faturamentoPorBarbeiro[barb] = (faturamentoPorBarbeiro[barb] || 0) + parseFloat(a.valor || 0);
            porServico[a.servico] = (porServico[a.servico] || 0) + 1;
            faturamentoTotal += parseFloat(a.valor || 0);
        });

        const topBarbeiro = Object.entries(porBarbeiro).sort((a, b) => b[1] - a[1])[0];
        const topServico  = Object.entries(porServico).sort((a, b) => b[1] - a[1])[0];

        res.json({
            periodo: { inicio: inicio.toISOString().split('T')[0], fim: fim.toISOString().split('T')[0] },
            kpis: {
                totalAgendamentos: listaDedup.length,
                faturamentoTotal: faturamentoTotal.toFixed(2),
                topBarbeiro: topBarbeiro ? { nome: topBarbeiro[0], count: topBarbeiro[1] } : null,
                topServico:  topServico  ? { nome: topServico[0],  count: topServico[1]  } : null
            },
            evolucao, servicosPorBarbeiro, faturamentoPorBarbeiro, porBarbeiro
        });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});


module.exports = router;