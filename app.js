require('dotenv').config();

const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');

const sequelize = require('./config/db');
const bcrypt = require('bcryptjs');

const { isAdminAuthenticated } = require('./middlewares/adminMiddleware');

const Admin = require('./models/Admin');
const Agendamento = require('./models/Agendamento');
const Bloqueio = require('./models/Bloqueio');
const Cliente = require('./models/Cliente');
const Empresa = require('./models/Empresas');
const Feriado = require('./models/feriado');
const HorarioFuncionamento = require('./models/HorarioFuncionamento');
const Servico = require('./models/servico');
const produto = require('./models/produto');
const Pacote = require('./models/Pacotes');
const { getSlotsDisponiveis, minutesToTime, temColisao, timeToMinutes } = require('./services/slotService');

const passport = require('passport');
const session = require('express-session');
require('./config/auth')(passport);

const { verificarConflito } = require('./helpers/conflito');

const { Op } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3333;

const clienteController = require('./controllers/clienteController');
const uploadAdmins = require('./config/multerAdmins'); 

const upload = require('./config/multer');
const empresaController = require('./controllers/empresaController');

const path = require('path');
const fs   = require('fs');

// desconectar automaticamente 
app.use(session({
    secret: process.env.CHAVE,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'handlebars');

//imagens

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas  

const agendamentoRoutes = require('./routes/agendamentoRoutes');
app.use('/api', agendamentoRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);
app.use('/', require('./routes/produtoRoutes'));
app.use('/', require('./routes/empresaRoutes'));
app.use('/', require('./routes/clienteRoutes')); 
app.use('/', require('./routes/feriadoRoutes'));
app.use('/', require('./routes/horarioRoutes'));
app.use('/', require('./routes/servicoRoutes'));
app.use('/', require('./routes/adminRoutes'));
app.use('/', require('./routes/clienteRoutes'));

app.engine('handlebars', engine({
    helpers: {
        substr: (str, start, len) => {
            if (!str) return '';
            return str.substring(start, start + len).toUpperCase();
        },
        eq: (a, b) => a === b,
        lt: (a, b) => a < b,
        json: (obj) => JSON.stringify(obj),
        add: (a, b) => a + b
    }
}));

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

app.get('/site/:nome', (req, res) => {
    const { nome } = req.params;
    
    // Segurança: remove qualquer ../ ou caractere estranho
    const nomeSeguro = nome.replace(/[^a-zA-Z0-9_-]/g, '');
    
    res.render(nomeSeguro, (err, html) => {
        if (err) return res.status(404).send('Site não encontrado');
        res.send(html);
    });
});


app.get('/loginAdmin', (req, res) => {
    res.render('loginAdmin');
});

app.get('/loginUsuario/:token', async (req, res) => {
    const { token } = req.params;

    const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
    if (!empresa) return res.status(404).send('Empresa não encontrada');

    res.render('loginUsuario', { token,logo: empresa.logo }); 
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
            valor: parseFloat(s.valor).toFixed(2).replace('.', ','),
            qtd_sessoes: s.qtd_sessoes || null 
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


(async () => {
    /*await Admin.sync({ alter: true });
    await Empresa.sync({ alter: true });
    await Servico.sync({ alter: true });
    await Cliente.sync({ alter: true });
    await produto.sync({ alter: true });
    await Feriado.sync({ alter: true });
    await HorarioFuncionamento.sync({ alter: true });
    await Bloqueio.sync({ alter: true });
    await Agendamento.sync({ alter: true });*/
    app.listen(PORT, () => {
        console.log(`Servidor funcionando na porta http://localhost:${PORT}`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/admin`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/loginUsuario`);
    });
})();
