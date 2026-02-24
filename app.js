
const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');

const sequelize = require('./config/db');
const bcrypt = require('bcryptjs');

const Agendamento = require('./models/Agendamento');
const Cliente = require('./models/Cliente');
const Admin = require('./models/Admin');
const Feriado = require('./models/feriado');
const Servico = require('./models/servico');

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

app.get('/agendar', async (req, res) => {
    try {
        const [agendamentos, servicos, admins] = await Promise.all([
            Agendamento.findAll({ attributes: ['data', 'horario'] }),
            Servico.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] }),
            Admin.findAll({ attributes: ['nome'] })
        ]);

        const horariosOcupados = agendamentos.map(a => ({
            data: a.data,
            horario: a.horario
        }));

        const servicosFormatados = servicos.map(s => ({
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ',')
        }));

        const barbeiros = admins.map(a => a.nome);

        return res.render('agendar', {  // ← IMPORTANTE
            horariosOcupados,
            servicos: servicosFormatados,
            barbeiros
        });

    } catch (error) {
        console.error(error);
        return res.render('agendar', { erro: 'Erro ao carregar.' }); // ← IMPORTANTE
    }
});

app.get('/loginAdmin', (req, res) => {
    res.render('loginAdmin');
});

app.get('/loginUsuario', (req, res) => {
    res.render('loginUsuario');
});

app.get('/loginUsuarioNovo', (req, res) => {
    res.render('loginUsuarioNovo');
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

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
app.post('/loginUsuarioNovo', async (req, res) => {
    const { nome, email, cpf, telefone, senha } = req.body;

    try {
        // Verifique se o usuário já existe pelo email
        const usuarioExistente = await Cliente.findOne({ where: { email } });
        if (usuarioExistente) {
            return res.render('loginUsuarioNovo', { errorMessage: 'Email já cadastrado.' });
        }
        // Crie um novo usuário
        const hashSenha = await bcrypt.hash(senha, 10);
        await Cliente.create({ nome, email, cpf, telefone, senha: hashSenha });

        // Redirecione para a página de login após criar a conta com sucesso
        res.render('loginUsuario', { Sucesso: 'Conta criada com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar usuário:', error.message);
        res.render('loginUsuarioNovo', { erro: 'Erro ao criar usuário. Tente novamente mais tarde.' });
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
// ROTAS ADMINS — adicionar no app.js após a rota GET /admin
// ============================================================

// GET /admins — lista todos os admins (para o modal)
app.get('/admins', isAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.findAll({
            attributes: ['id', 'nome', 'email', 'role'],
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

        const admin = await Admin.findByPk(id);
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

        await admin.destroy();
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover admin: ' + error.message });
    }
});

// RETORNA HORÁRIOS OCUPADOS POR BARBEIRO E DATA
app.get('/horarios-ocupados', async (req, res) => {
    const { barbeiro, data } = req.query;

    try {
        const inicioDia = new Date(`${data}T00:00:00.000Z`);
        const proximoDia = new Date(`${data}T00:00:00.000Z`);
        proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);

        const agendamentos = await Agendamento.findAll({
            where: {
                barbeiro,
                data: {
                    [Op.gte]: inicioDia,
                    [Op.lt]: proximoDia
                }
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
async function verificarConflito(barbeiro, data, horario, idIgnorar = null) {
    const inicioDia = new Date(`${data}T00:00:00.000Z`);
    const proximoDia = new Date(`${data}T00:00:00.000Z`);
    proximoDia.setUTCDate(proximoDia.getUTCDate() + 1);

    const where = {
        barbeiro,
        horario,
        data: {
            [Op.gte]: inicioDia,
            [Op.lt]: proximoDia
        }
    };

    if (idIgnorar) where.id = { [Op.ne]: idIgnorar };

    const conflito = await Agendamento.findOne({ where });
    return !!conflito;
}

// CLIENTE AGENDA
app.post('/agendar', async function (req, res) {
    const { barbeiro, data, horario, servico } = req.body;

    // Pega nome e telefone da sessão do cliente logado
    const nome = req.session.clienteNome;
    const telefone = req.session.clienteTelefone;
    const email = req.session.clienteEmail;

    try {
        const ocupado = await verificarConflito(barbeiro, data, horario);
        if (ocupado) {
            return res.render('agendar', {
                erro: `${barbeiro} já tem agendamento às ${horario} neste dia. Escolha outro horário.`
            });
        }

        await Agendamento.create({ barbeiro, nome, email, telefone, data, horario, servico });
        // Monta link do whatsapp
        const mensagem = encodeURIComponent(
            `Olá! Seu agendamento foi confirmado ✅\n\n` +
            `✂️ Serviço: ${servico}\n` +
            `👤 Barbeiro: ${barbeiro}\n` +
            `📅 Data: ${data}\n` +
            `🕐 Horário: ${horario}\n\n` +
            `Obrigado pela preferência!`
        );
        const whatsappLink = `https://wa.me/5517981043899?text=${mensagem}`;

        res.render('agendar', {
            Sucesso: 'Agendamento confirmado!',
            whatsappLink
        });

    } catch (error) {
        res.render('agendar', { erro: "Erro: " + error.message });
    }
});

// ADMIN AGENDA
app.post('/agendar/admin', isAdminAuthenticated, async (req, res) => {
    const { barbeiro, nome, telefone, data, horario, servico } = req.body;

    try {
        const ocupado = await verificarConflito(barbeiro, data, horario);
        if (ocupado) {
            return res.status(409).json({
                erro: `${barbeiro} já tem agendamento às ${horario} neste dia.`
            });
        }

        await Agendamento.create({ barbeiro, nome, email: null, telefone, data, horario, servico });

        return res.status(200).json({ sucesso: true });  // ← JSON, não redirect!

    } catch (error) {
        return res.status(500).json({ erro: error.message });
    }
});

// BUSCAR AGENDAMENTOS - ADMINS e SERVICOS
app.get('/admin', isAdminAuthenticated, async (req, res) => {
    try {
        const [agendamentos, admins, servicos] = await Promise.all([
            Agendamento.findAll(),
            Admin.findAll({ attributes: ['nome'] }),
            Servico.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] })
        ]);

        const barbeiros = admins.map(a => a.nome);

        // ← aqui dentro, depois do Promise.all
        const servicosFormatados = servicos.map(s => ({
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


// GET - lista feriados (público, cliente também acessa)
app.get('/feriados', async (req, res) => {
    const feriados = await Feriado.findAll({ attributes: ['data', 'descricao'] });
    res.json({ feriados: feriados.map(f => ({ data: f.data, descricao: f.descricao })) });
});

// POST - admin cadastra feriado
app.post('/feriados', isAdminAuthenticated, async (req, res) => {
    const { data, descricao } = req.body;
    try {
        await Feriado.create({ data, descricao });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Data já cadastrada ou erro ao salvar.' });
    }
});

// DELETE - admin remove feriado
app.delete('/feriados/:data', isAdminAuthenticated, async (req, res) => {
    try {
        await Feriado.destroy({ where: { data: req.params.data } });
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover.' });
    }
});

// EXIBIR OS DADOS NO INPUT E ATUALIZAR OS DADOS
app.get('/editar/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;

        const [agendamento, admins, servicos] = await Promise.all([
            Agendamento.findByPk(id),
            Admin.findAll({ attributes: ['nome'] }),
            Servico.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] })
        ]);

        if (!agendamento) return res.status(404).send('Agendamento não encontrado');

        const plain = agendamento.get({ plain: true });

        // Formata a data para yyyy-mm-dd (valor do input date)
        const data = new Date(plain.data);
        data.setMinutes(data.getMinutes() + data.getTimezoneOffset());
        plain.data = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;

        const barbeiros = admins.map(a => a.nome);
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
    const servicos = await Servico.findAll({ order: [['nome', 'ASC']] });
    res.json({ servicos: servicos.map(s => ({ id: s.id, nome: s.nome, valor: s.valor, ativo: s.ativo })) });
});

// ADICIONA NOVO SERVIÇO
app.post('/servicos', isAdminAuthenticated, async (req, res) => {
    const { nome, valor } = req.body;
    try {
        await Servico.create({ nome, valor });
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
            barbeiro: req.body.barbeiro  
        },
        { where: { id: id } }
    ).then(() => {
        res.redirect('/admin');
    }).catch(error => {
        res.status(500).send('Erro ao atualizar o agendamento: ' + error.message);
    });
});

// LOGIN DO USUÁRIO (CLIENTE)
app.post('/loginUsuario', async (req, res) => {
    const { nome, telefone } = req.body;

    try {
        // Busca pelo telefone, se não existir cria automaticamente
        let cliente = await Cliente.findOne({ where: { telefone } });

        if (!cliente) {
            cliente = await Cliente.create({ nome, telefone });
        }

        // Salva os dados do cliente na sessão
        req.session.clienteId = cliente.id;
        req.session.clienteNome = cliente.nome;
        req.session.clienteTelefone = cliente.telefone;

        res.redirect('/agendar');

    } catch (error) {
        console.error(error);
        res.render('loginUsuario', { erro: 'Erro ao fazer login.' });
    }
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


sequelize.sync({ force: false }).then(() => {
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