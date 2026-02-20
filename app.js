
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
        }
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
        const [agendamentos, servicos] = await Promise.all([
            Agendamento.findAll({ attributes: ['data', 'horario'] }),
            Servico.findAll({ where: { ativo: true }, order: [['nome', 'ASC']] })
        ]);

        const horariosOcupados = agendamentos.map(a => ({
            data: a.data,
            horario: a.horario
        }));

        // ← aqui dentro, depois do Promise.all
        const servicosFormatados = servicos.map(s => ({
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ',')
        }));

        res.render('agendar', { horariosOcupados, servicos: servicosFormatados });
    } catch (error) {
        res.render('agendar', { erro: 'Erro ao carregar.' });
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
        const nome = 'Eré';           // ← adiciona o nome
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

// RETORNA HORÁRIOS OCUPADOS POR BARBEIRO E DATA
// SEM proteção — cliente também precisa acessar
app.get('/horarios-ocupados', async (req, res) => {
    const { barbeiro, data } = req.query;
    try {
        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const agendamentos = await Agendamento.findAll({
            where: {
                barbeiro,
                data: { [Op.between]: [inicioDia, fimDia] }
            },
            attributes: ['horario']
        });

        res.json({ ocupados: agendamentos.map(a => a.horario) });
    } catch (error) {
        res.json({ ocupados: [] });
    }
});

// FUNÇÃO AUXILIAR - verifica conflito de horário
async function verificarConflito(barbeiro, data, horario, idIgnorar = null) {
    // Cria o intervalo do dia inteiro: 00:00:00 até 23:59:59
    const inicioDia = new Date(data + 'T00:00:00.000Z');
    const fimDia = new Date(data + 'T23:59:59.999Z');

    const where = {
        barbeiro,
        horario,
        data: { [Op.between]: [inicioDia, fimDia] }
    };

    if (idIgnorar) where.id = { [Op.ne]: idIgnorar };

    const conflito = await Agendamento.findOne({ where });

    console.log('Verificando conflito:', { barbeiro, data, horario });
    console.log('Conflito encontrado?', !!conflito);

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

// LER OS AGENDAMENTOS CRIADOS NO BANCO DE DADOS
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
app.get('/editar/:id', isAdminAuthenticated, (req, res) => {
    const id = req.params.id;
    Agendamento.findByPk(id)
        .then(agendamento => {
            if (agendamento) {

                const plainAgendamento = agendamento.get({ plain: true });

                const data = new Date(plainAgendamento.data);
                data.setMinutes(data.getMinutes() + data.getTimezoneOffset());
                const ano = data.getFullYear();
                const mes = String(data.getMonth() + 1).padStart(2, '0');
                const dia = String(data.getDate()).padStart(2, '0');
                const dataFormatada = `${ano}-${mes}-${dia}`;

                plainAgendamento.data = dataFormatada;

                res.render('editar', { agendamento: plainAgendamento });
            } else {
                res.status(404).send('Agendamento não encontrado');
            }
        })
        .catch(error => {
            res.status(500).send('Erro ao buscar agendamento: ' + error.message);
        });
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
            servico: req.body.servico
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
    const { email, senha } = req.body;

    try {
        const cliente = await Cliente.findOne({ where: { email } });

        if (!cliente) {
            return res.render('loginUsuario', { erro: 'Email ou senha inválidos.' });
        }

        const senhaCorreta = await bcrypt.compare(senha, cliente.senha);

        if (!senhaCorreta) {
            return res.render('loginUsuario', { erro: 'Email ou senha inválidos.' });
        }

        // ← Salva os dados do cliente na sessão
        req.session.clienteId = cliente.id;
        req.session.clienteNome = cliente.nome;
        req.session.clienteTelefone = cliente.telefone;
        req.session.clienteEmail = cliente.email;

        res.redirect('/agendar');

    } catch (error) {
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