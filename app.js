require('dotenv').config();

const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');

const sequelize = require('./config/db');
const bcrypt = require('bcryptjs');

const Admin = require('./models/Admin');
const Agendamento = require('./models/Agendamento');
const Boqueio = require('./models/Boqueio');
const Cliente = require('./models/Cliente');
const Empresa = require('./models/Empresas');
const Feriado = require('./models/feriado');
const HorarioFuncionamento = require('./models/HorarioFuncionamento');
const Servico = require('./models/servico');
const produto = require('./models/produto');
const { getSlotsDisponiveis, minutesToTime, temColisao, timeToMinutes } = require('./services/slotService');

const passport = require('passport');
const session = require('express-session');
require('./config/auth')(passport);

const { Op } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3333;

app.use(session({
    secret: process.env.CHAVE,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 2 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

app.engine('handlebars', engine({
    helpers: {
        substr: (str, start, len) => {
            if (!str) return '';
            return str.substring(start, start + len).toUpperCase();
        },
        eq: (a, b) => a === b
    }
}));
app.set('view engine', 'handlebars');

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.static('public'));

// Rotas  
app.use('/', require('./routes/produtoRoutes'));

const agendamentoRoutes = require('./routes/agendamentoRoutes');
app.use('/api', agendamentoRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);


app.engine('handlebars', engine({
    helpers: {
        substr: (str, start, len) => {
            if (!str) return '';
            return str.substring(start, start + len).toUpperCase();
        },
        eq: (a, b) => a === b,
        lt: (a, b) => a < b,
        json: (obj) => JSON.stringify(obj)
    }
}));

function isAdminAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/loginAdmin');
}

app.post('/loginAdmin', passport.authenticate('admin-local', {
    successRedirect: '/admin',
    failureRedirect: '/loginAdmin',
    failureFlash: false
}));

app.get('/', (req, res) => {
    res.render('home');
});

app.get('/slots', async (req, res) => {
    const { profissional_id, servico_id, data, token } = req.query;

    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });

        const slots = await getSlotsDisponiveis({
            profissional_id: parseInt(profissional_id),
            servico_id: parseInt(servico_id),
            data,
            idEmpresa: empresa.id
        });

        res.json({ slots });

    } catch (error) {
        console.error(error);
        res.json({ slots: [] });
    }
});

// GET /admin/slots — para o painel admin, sem validação de horário de funcionamento
app.get('/admin/slots', isAdminAuthenticated, async (req, res) => {
    const { profissional_id, servico_id, data } = req.query;
    const idEmpresa = req.user.idEmpresa;

    try {
        const servico = await Servico.findOne({ where: { id: servico_id, idEmpresa } });
        if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });

        const duracao = servico.duracao_minutos;

        // Gera slots das 07:00 às 22:00
        const slots = [];
        let atual = 7 * 60;
        const fim = 22 * 60;
        while (atual + duracao <= fim) {
            slots.push({
                hora_inicio: minutesToTime(atual),
                hora_fim: minutesToTime(atual + duracao)
            });
            atual += duracao;
        }

        // Verifica conflitos
        const agendamentos = await Agendamento.findAll({
            where: {
                profissional_id,
                idEmpresa,
                data,
                status: { [Op.notIn]: ['cancelado'] },
                hora_inicio: { [Op.not]: null }
            },
            attributes: ['hora_inicio', 'hora_fim']
        });

        const resultado = slots.map(slot => {
            const ocupado = agendamentos.some(a => temColisao(slot, a));
            return { ...slot, status: ocupado ? 'indisponivel' : 'disponivel' };
        });

        res.json({ slots: resultado });

    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.get('/agendar/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const empresa = await Empresa.findOne({
            where: { token_agendamento: token }
        });

        if (!empresa) {
            return res.status(404).send('Empresa não encontrada');
        }

        const idEmpresa = empresa.id;
        req.session.empresaId = idEmpresa;

        const [agendamentos, servicos, admins] = await Promise.all([
            Agendamento.findAll({
                where: { idEmpresa },
                attributes: ['data', 'horario']
            }),
            Servico.findAll({
                where: { ativo: true, idEmpresa },
                order: [['nome', 'ASC']]
            }),
            Admin.findAll({
                where: { idEmpresa, ativo: 'S' },
                attributes: ['id', 'nome'] // 👈 adicionamos id aqui
            })
        ]);

        const horariosOcupados = agendamentos.map(a => ({
            data: a.data,
            horario: a.horario
        }));

        const servicosFormatados = servicos.map(s => ({
            id: s.id,                       // 👈 adicionamos id
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ','),
            duracao_minutos: s.duracao_minutos  // 👈 adicionamos duração
        }));

        const barbeiros = admins.map(a => ({
            id: a.id,       // 👈 agora é objeto com id e nome
            nome: a.nome
        }));

        const agendamentoSucesso = req.session.agendamentoSucesso || null;
        req.session.agendamentoSucesso = null;

        return res.render('agendar', {
            horariosOcupados,
            servicos: servicosFormatados,
            barbeiros,
            Sucesso: agendamentoSucesso?.mensagem || null,
            whatsappLink: agendamentoSucesso?.whatsappLink || null,
            token
        });

    } catch (error) {
        console.error(error);
        return res.render('agendar', { erro: 'Erro ao carregar.' });
    }
});

app.get('/loginAdmin', (req, res) => {
    res.render('loginAdmin');
});

app.get('/loginUsuario/:token', async (req, res) => {
    const { token } = req.params;

    const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
    if (!empresa) return res.status(404).send('Empresa não encontrada');

    res.render('loginUsuario', { token }); // 👈 passa o token para o EJS
});

app.get('/loginUsuarioNovo/:token', async (req, res) => {
    const { token } = req.params;

    const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
    if (!empresa) return res.status(404).send('Empresa não encontrada');
    res.render('loginUsuarioNovo', { token });
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// CRIAR empresa Padrão 
async function criarEmpresa() {
    try {
        const nome = 'BARBEARIA LP';
        const fantasia = 'BARBEARIA';
        const cnpj = '123456789';
        const dominio = 'localhost';
        const ativo = 'S';

        const empresaExistente = await Empresa.findOne({ where: { cnpj } });

        if (empresaExistente) {
            console.log('Empresa já existe.');
            return;
        }

        await Empresa.create({
            nome,
            fantasia,
            cnpj,
            dominio,
            ativo
        });

        console.log('Empresa criada com sucesso.');
    } catch (error) {
        console.error('Erro ao criar empresa:', error.message);
    }
}
criarEmpresa();

// CRIAR USUARIO ADMIN
async function criarAdmin() {
    try {
        const email = 'admin@gmail.com';
        const senha = '1234';
        const nome = 'ADMIN';           // ← adiciona o nome
        const hashSenha = await bcrypt.hash(senha, 10);

        const adminExistente = await Admin.findOne({ where: { email } });
        if (adminExistente) {
            console.log('Usuário administrador já existe.');
            return;
        }

        await Admin.create({ email, nome, senha: hashSenha });
        console.log('Usuário administrador criado com sucesso.');
    } catch (error) {
        console.error('Erro ao criar usuário administrador:', error.message);
    }
}
criarAdmin();

// CRIAR CLIENTES NO BANCO DE DADOS
app.post('/loginUsuario/:token', async (req, res) => {
    const { nome, telefone } = req.body;
    const { token } = req.params;

    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });

        if (!empresa) {
            return res.status(404).send('Empresa não encontrada');
        }

        const idEmpresa = empresa.id;

        let cliente = await Cliente.findOne({
            where: { telefone, idEmpresa }
        });

        if (!cliente) {
            cliente = await Cliente.create({ nome, telefone, idEmpresa });
        }

        req.session.clienteId = cliente.id;
        req.session.clienteNome = cliente.nome;
        req.session.clienteTelefone = cliente.telefone;
        req.session.clienteEmpresaId = idEmpresa;

        res.redirect(`/agendar/${token}`); // 👈 mantém o token no redirect

    } catch (error) {
        console.error(error);
        res.render('loginUsuario', { erro: 'Erro ao fazer login.', token });
    }
});

async function criarServicosIniciais() {
    try {
        const count = await Servico.count();
        if (count > 0) return; // já tem serviços, não recria

        await Servico.bulkCreate([
            { nome: 'Corte de Cabelo', valor: 45.00 },
            { nome: 'Barba', valor: 35.00 },
            { nome: 'Sobrancelha', valor: 10.00 },
            { nome: 'Combo Completo', valor: 70.00 }
        ]);
        console.log('Serviços iniciais criados.');
    } catch (error) {
        console.error('Erro ao criar serviços:', error.message);
    }
}
criarServicosIniciais();

// ============================================================
// ROTAS ADMINS
// ============================================================

// GET /admins — lista todos os admins (para o modal)
app.get('/admins', isAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.findAll({
            where: { idEmpresa: req.user.idEmpresa },
            attributes: ['id', 'nome', 'email', 'role', 'ativo'],
            order: [['nome', 'ASC']]
        });
        res.json({ admins });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao buscar admins: ' + error.message });
    }
});

// POST /admins — cria um novo admin
app.post('/admins', isAdminAuthenticated, async (req, res) => {
    try {
        const { nome, email, senha, role } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
        }
        if (senha.length < 6) {
            return res.status(400).json({ erro: 'A senha precisa ter no mínimo 6 caracteres.' });
        }

        const emailNormalizado = email.trim().toLowerCase();

        const jaExiste = await Admin.findOne({ where: { email: emailNormalizado } });
        if (jaExiste) {
            return res.status(409).json({ erro: 'Já existe um admin com este e-mail.' });
        }

        const hashSenha = await bcrypt.hash(senha, 10);

        await Admin.create({
            nome: nome.trim(),
            email: emailNormalizado,
            senha: hashSenha,
            idEmpresa: req.user.idEmpresa,
            role: role === 'owner' ? 'owner' : 'admin'   // só aceita os dois valores válidos
        });

        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao criar admin: ' + error.message });
    }
});

// DELETE /admins/:id — remove um admin (nunca remove o próprio usuário logado nem owners)
app.delete('/admins/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;

        const admin = await Admin.findOne({
            where: { id, idEmpresa: req.user.idEmpresa } // 👈 garante que é da mesma empresa
        });
        if (!admin) {
            return res.status(404).json({ erro: 'Admin não encontrado.' });
        }

        // Proteção: não deixa excluir owner nem o próprio usuário logado
        if (admin.role === 'owner') {
            return res.status(403).json({ erro: 'Não é possível remover um Owner.' });
        }
        if (req.session?.adminId && String(admin.id) === String(req.session.adminId)) {
            return res.status(403).json({ erro: 'Você não pode remover sua própria conta.' });
        }

        await admin.update({ ativo: false });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover admin: ' + error.message });
    }
});

//reativar admin
app.patch('/admins/:id/reativar', isAdminAuthenticated, async (req, res) => {
    try {
        const admin = await Admin.findOne({ where: { id: req.params.id, idEmpresa: req.user.idEmpresa } });
        if (!admin) return res.status(404).json({ erro: 'Admin não encontrado.' });
        await admin.update({ ativo: 'S' });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao reativar: ' + error.message });
    }
});

// alterar o admin
app.patch('/admins/:id/nome', isAdminAuthenticated, async (req, res) => {
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

// RETORNA HORÁRIOS OCUPADOS POR BARBEIRO E DATA
app.get('/horarios-ocupados', async (req, res) => {
    const { barbeiro, data, token } = req.query;

    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } }); // 👈 busca pelo token
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });

        const inicioDia = new Date(`${data}T00:00:00.000Z`);
        const proximoDia = new Date(`${data}T00:00:00.000Z`);
        proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);

        const agendamentos = await Agendamento.findAll({
            where: {
                barbeiro,
                data: {
                    [Op.gte]: inicioDia,
                    [Op.lt]: proximoDia
                },
                idEmpresa: empresa.id
            },
            attributes: ['horario']
        });

        res.json({
            ocupados: agendamentos.map(a => a.horario)
        });

    } catch (error) {
        console.error(error);
        res.json({ ocupados: [] });
    }
});

// FUNÇÃO AUXILIAR - verifica conflito de horário
async function verificarConflito(barbeiro, data, horario, idEmpresa, idIgnorar = null) {
    const inicioDia = new Date(`${data}T00:00:00.000Z`);
    const proximoDia = new Date(`${data}T00:00:00.000Z`);
    proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);

    const where = {
        barbeiro,
        horario,
        idEmpresa,
        data: {
            [Op.gte]: inicioDia,
            [Op.lt]: proximoDia
        }
    };

    if (idIgnorar) where.id = { [Op.ne]: idIgnorar };

    const conflito = await Agendamento.findOne({ where });
    return !!conflito;
}

// GET — lista horários de um profissional
app.get('/horarios-funcionamento', isAdminAuthenticated, async (req, res) => {
    const { profissional_id } = req.query;
    try {
        const horarios = await HorarioFuncionamento.findAll({
            where: { profissional_id, idEmpresa: req.user.idEmpresa },
            order: [['dia_semana', 'ASC']]
        });
        res.json({ horarios });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// POST — cria novo horário
app.post('/horarios-funcionamento', isAdminAuthenticated, async (req, res) => {
    const { profissional_id, dia_semana, hora_inicio, hora_fim } = req.body;
    const idEmpresa = req.user.idEmpresa;
    try {
        // Verifica se já existe esse dia para esse profissional
        const existente = await HorarioFuncionamento.findOne({
            where: { profissional_id, dia_semana, idEmpresa }
        });
        if (existente) {
            return res.status(409).json({ erro: 'Já existe um horário para este dia. Remova o anterior primeiro.' });
        }
        await HorarioFuncionamento.create({
            profissional_id, dia_semana, hora_inicio, hora_fim, idEmpresa, ativo: true
        });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// DELETE — remove um horário
app.delete('/horarios-funcionamento/:id', isAdminAuthenticated, async (req, res) => {
    try {
        await HorarioFuncionamento.destroy({
            where: { id: req.params.id, idEmpresa: req.user.idEmpresa }
        });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// CLIENTE AGENDAapp.post('/agendar/:token', async function (req, res) {
app.post('/agendar/:token', async function (req, res) {
    const { barbeiro, data, horario, servico, profissional_id, hora_inicio, hora_fim, servico_id } = req.body; // 👈 adicionamos os novos
    const { token } = req.params;
    console.log('Token recebido:', token);
    const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
    console.log('Empresa encontrada:', empresa);

    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });

        if (!empresa) {
            return res.status(404).send('Empresa não encontrada');
        }

        const idEmpresa = empresa.id;

        const ocupado = await verificarConflito(barbeiro, data, horario, idEmpresa);

        if (ocupado) {
            return res.render('agendar', {
                erro: `${barbeiro} já tem agendamento às ${horario} neste dia.`
            });
        }

        const servicoObj = await Servico.findOne({
            where: { nome: servico, idEmpresa }
        });

        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        await Agendamento.create({
            barbeiro,
            nome: req.session.clienteNome,
            telefone: req.session.clienteTelefone,
            data,
            horario,
            servico,
            valor,
            idEmpresa,
            profissional_id: profissional_id || null,   // 👈 novo
            hora_inicio: hora_inicio || horario || null, // 👈 novo (fallback para horario antigo)
            hora_fim: hora_fim || null,                  // 👈 novo
            servico_id: servico_id || null,              // 👈 novo
            status: 'pendente'                           // 👈 novo
        });

        const telefoneEmpresa = empresa.celular;
        const mensagem = encodeURIComponent(
            `Olá! Acabei de agendar:\n` +
            `📅 Data: ${data}\n` +
            `⏰ Horário: ${horario}\n` +
            `✂️ Serviço: ${servico}\n` +
            `👤 Profissional: ${barbeiro}`
        );
        const whatsappLink = `https://wa.me/55${telefoneEmpresa.replace(/\D/g, '')}?text=${mensagem}`;

        req.session.agendamentoSucesso = {
            mensagem: 'Agendamento confirmado!',
            whatsappLink
        };

        return res.redirect(`/agendar/${token}`);

    } catch (error) {
        return res.render('agendar', {
            erro: 'Erro: ' + error.message
        });
    }
});

// ADMIN AGENDA
app.post('/admin/agendar', isAdminAuthenticated, async (req, res) => {
    const { barbeiro, nome, telefone, data, horario, servico, profissional_id, hora_inicio, hora_fim, servico_id } = req.body; // 👈 adicionamos os novos
    const idEmpresa = req.user.idEmpresa;

    try {
        if (!idEmpresa) {
            return res.status(403).json({ erro: 'Empresa não identificada.' });
        }

        const ocupado = await verificarConflito(barbeiro, data, horario, idEmpresa);

        if (ocupado) {
            return res.status(409).json({
                erro: `${barbeiro} já tem agendamento às ${horario} neste dia.`
            });
        }

        const servicoObj = await Servico.findOne({
            where: { nome: servico, idEmpresa }
        });

        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        await Agendamento.create({
            barbeiro,
            nome,
            email: null,
            telefone,
            data,
            horario,
            servico,
            valor,
            idEmpresa,
            profissional_id: profissional_id || null,    // 👈 novo
            hora_inicio: hora_inicio || horario || null,  // 👈 novo
            hora_fim: hora_fim || null,                   // 👈 novo
            servico_id: servico_id || null,               // 👈 novo
            status: 'pendente'                            // 👈 novo
        });

        return res.status(200).json({ sucesso: true });

    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
});

// BUSCAR AGENDAMENTOS - ADMINS e SERVICOS
app.get('/admin', isAdminAuthenticated, async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;

        const [agendamentos, admins, servicos] = await Promise.all([
            Agendamento.findAll({ where: { idEmpresa } }),
            Admin.findAll({ where: { idEmpresa }, attributes: ['id', 'nome', 'email', 'role', 'ativo'] }), 
            Servico.findAll({ where: { ativo: true, idEmpresa }, order: [['nome', 'ASC']] })
        ]);

        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome })); // 👈 agora é objeto

        const servicosFormatados = servicos.map(s => ({
            id: s.id,
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ',')
        }));

        const agendamentosFormatados = agendamentos.map(agendamento => {
            const data = new Date(agendamento.data);
            data.setMinutes(data.getMinutes() + data.getTimezoneOffset());
            const ano = data.getFullYear();
            const mes = String(data.getMonth() + 1).padStart(2, '0');
            const dia = String(data.getDate()).padStart(2, '0');
            return {
                id: agendamento.id,
                nome: agendamento.nome,
                telefone: agendamento.telefone,
                data: `${dia}/${mes}/${ano}`,
                horario: agendamento.horario,
                servico: agendamento.servico,
                barbeiro: agendamento.barbeiro
            };
        });

        res.render('admin', { agendamentos: agendamentosFormatados, barbeiros, servicos: servicosFormatados });
    } catch (error) {
        res.render('admin', { erro: "Erro ao buscar dados: " + error.message });
    }
});

// GET /admin/dashboard/dados — dados agregados para o dashboard
// Query params: ?inicio=2024-01-01&fim=2024-12-31
app.get('/admin/dashboard/dados', isAdminAuthenticated, async (req, res) => {
    try {
        const { Op } = require('sequelize');

        // Período — padrão: últimos 30 dias
        const fim = req.query.fim ? new Date(req.query.fim) : new Date();
        const inicio = req.query.inicio ? new Date(req.query.inicio) : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Ajusta fim para o final do dia
        fim.setHours(23, 59, 59, 999);
        inicio.setHours(0, 0, 0, 0);

        const agendamentos = await Agendamento.findAll({
            where: { data: { [Op.between]: [inicio, fim] }, idEmpresa: req.user.idEmpresa },
            order: [['data', 'ASC']],

        });

        const lista = agendamentos.map(a => a.get({ plain: true }));

        // ── 1. Evolução diária por barbeiro ───────────────────
        // { "2024-01-15": { "Eré": 3, "Guilherme": 2 }, ... }
        const evolucao = {};
        lista.forEach(a => {
            const d = new Date(a.data);
            d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
            const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!evolucao[dia]) evolucao[dia] = {};
            const barb = a.barbeiro || 'Sem barbeiro';
            evolucao[dia][barb] = (evolucao[dia][barb] || 0) + 1;
        });

        // ── 2. Serviços por barbeiro (para pizza) ────────────
        // { "Eré": { "Corte": 10, "Barba": 5 }, ... }
        const servicosPorBarbeiro = {};
        lista.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            if (!servicosPorBarbeiro[barb]) servicosPorBarbeiro[barb] = {};
            servicosPorBarbeiro[barb][a.servico] = (servicosPorBarbeiro[barb][a.servico] || 0) + 1;
        });

        // ── 3. KPIs ───────────────────────────────────────────
        const totalAgendamentos = lista.length;
        const faturamentoTotal = lista.reduce((sum, a) => sum + parseFloat(a.valor || 0), 0);

        // Barbeiro mais movimentado
        const porBarbeiro = {};
        lista.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            porBarbeiro[barb] = (porBarbeiro[barb] || 0) + 1;
        });
        const topBarbeiro = Object.entries(porBarbeiro).sort((a, b) => b[1] - a[1])[0];

        // Serviço mais popular
        const porServico = {};
        lista.forEach(a => { porServico[a.servico] = (porServico[a.servico] || 0) + 1; });
        const topServico = Object.entries(porServico).sort((a, b) => b[1] - a[1])[0];

        // Faturamento por barbeiro
        const faturamentoPorBarbeiro = {};
        lista.forEach(a => {
            const barb = a.barbeiro || 'Sem barbeiro';
            faturamentoPorBarbeiro[barb] = (faturamentoPorBarbeiro[barb] || 0) + parseFloat(a.valor || 0);
        });

        res.json({
            periodo: {
                inicio: inicio.toISOString().split('T')[0],
                fim: fim.toISOString().split('T')[0]
            },
            kpis: {
                totalAgendamentos,
                faturamentoTotal: faturamentoTotal.toFixed(2),
                topBarbeiro: topBarbeiro ? { nome: topBarbeiro[0], count: topBarbeiro[1] } : null,
                topServico: topServico ? { nome: topServico[0], count: topServico[1] } : null
            },
            evolucao,          // evolução diária por barbeiro
            servicosPorBarbeiro, // pizza por barbeiro
            faturamentoPorBarbeiro,
            porBarbeiro
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// GET /admin/dashboard — renderiza a view
app.get('/admin/dashboard', isAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.findAll({ attributes: ['nome'], where: { idEmpresa: req.user.idEmpresa } });
        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));
        res.render('dashboard', { barbeiros });
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

// GET - lista feriados (público, cliente também acessa)
app.get('/feriados', async (req, res) => {
    try {
        const dominio = req.hostname;
        const empresa = await Empresa.findOne({ where: { dominio } });

        if (!empresa) {
            return res.status(404).json({ erro: 'Empresa não encontrada' });
        }

        const feriados = await Feriado.findAll({
            attributes: ['data', 'descricao'],
            where: { idEmpresa: empresa.id }
        });

        res.json({
            feriados: feriados.map(f => ({
                data: f.data,
                descricao: f.descricao
            }))
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ erro: 'Erro ao buscar feriados' });
    }
});

// POST - admin cadastra feriado
app.post('/feriados', isAdminAuthenticated, async (req, res) => {
    const { data, descricao } = req.body;
    try {
        await Feriado.create({ data, descricao, idEmpresa: req.user.idEmpresa });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Data já cadastrada ou erro ao salvar.' });
    }
});

// DELETE - admin remove feriado
app.delete('/feriados/:data', isAdminAuthenticated, async (req, res) => {
    try {
        await Feriado.destroy({ where: { data: req.params.data, idEmpresa: req.user.idEmpresa } });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover.' });
    }
});

// EXIBIR OS DADOS NO INPUT E ATUALIZAR OS DADOS
app.get('/editar/:id', isAdminAuthenticated, async (req, res) => {
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

        // Formata a data para yyyy-mm-dd (valor do input date)
        const data = new Date(plain.data);
        data.setMinutes(data.getMinutes() + data.getTimezoneOffset());
        plain.data = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));
        const servicosFormatados = servicos.map(s => ({
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ',')
        }));

        res.render('editar', {
            agendamento: plain,
            barbeiros,
            servicos: servicosFormatados
        });

    } catch (error) {
        res.status(500).send('Erro ao buscar agendamento: ' + error.message);
    }
});

// LISTA TODOS OS SERVIÇOS (admin — inclui inativos)
app.get('/servicos/admin', isAdminAuthenticated, async (req, res) => {
    const servicos = await Servico.findAll({ where: { idEmpresa: req.user.idEmpresa }, order: [['nome', 'ASC']] });
    res.json({ servicos: servicos.map(s => ({ id: s.id, nome: s.nome, valor: s.valor, ativo: s.ativo })) });
});

// ADICIONA NOVO SERVIÇO
app.post('/servicos', isAdminAuthenticated, async (req, res) => {
    const { nome, valor } = req.body;
    try {
        await Servico.create({ nome, valor, idEmpresa: req.user.idEmpresa });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// EDITA NOME E VALOR
app.put('/servicos/:id', isAdminAuthenticated, async (req, res) => {
    const { nome, valor } = req.body;
    try {
        await Servico.update({ nome, valor }, { where: { id: req.params.id } });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// ATIVA / DESATIVA
app.put('/servicos/:id/toggle', isAdminAuthenticated, async (req, res) => {
    try {
        const s = await Servico.findByPk(req.params.id);
        await s.update({ ativo: !s.ativo });
        res.json({ sucesso: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

app.post('/editar/:id', isAdminAuthenticated, (req, res) => {
    const id = req.params.id;
    Agendamento.update(
        {
            nome: req.body.nome,
            telefone: req.body.telefone,
            data: req.body.data,
            horario: req.body.horario,
            servico: req.body.servico,
            barbeiro: req.body.barbeiro,
            profissional_id: req.body.profissional_id  // adiciona aqui
        },
        { where: { id: id, idEmpresa: req.user.idEmpresa } }
    ).then(() => {
        res.redirect('/admin');
    }).catch(error => {
        res.status(500).send('Erro ao atualizar o agendamento: ' + error.message);
    });
});

// DELETAR AGENDAMENTOS NO BANCO DE DADOS
app.get('/deletar/:id', isAdminAuthenticated, function (req, res) {
    Agendamento.destroy({ where: { id: req.params.id } })
        .then(function () {
            res.redirect('/admin');
        }).catch(function (erro) {
            res.send('Erro ao excluir o agendamento');
        });
});


sequelize.sync({ force: true }).then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor funcionando na porta http://localhost:${PORT}`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/admin`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/loginUsuario`);
    });
});

/*app.listen(PORT, () => {
    console.log(`Servidor funcionando na porta http://localhost:${PORT}`);
    console.log(`Servidor funcionando na porta http://localhost:${PORT}/admin`);
    console.log(`Servidor funcionando na porta http://localhost:${PORT}/loginUsuario`);
});
*/