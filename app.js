require('dotenv').config();

const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');

const sequelize = require('./config/db');
const bcrypt = require('bcryptjs');

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
app.use('/', require('./routes/produtoRoutes'));

const agendamentoRoutes = require('./routes/agendamentoRoutes');
app.use('/api', agendamentoRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);

app.use('/', require('./routes/empresaRoutes'));

app.use('/', require('./routes/clienteRoutes')(isAdminAuthenticated));

// PATCH /clientes/:id — edita nome e telefone
app.patch('/clientes/:id', isAdminAuthenticated, async (req, res) => {
    try {
        const { nome, telefone } = req.body;
        const telefoneNormalizado = normalizarTelefone(telefone);

        const cliente = await Cliente.findOne({
            where: { id: req.params.id, idEmpresa: req.user.idEmpresa }
        });
        if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });

        // Atualiza o telefone nos agendamentos também
        await Agendamento.update(
            { telefone: telefoneNormalizado },
            { where: { telefone: cliente.telefone, idEmpresa: req.user.idEmpresa } }
        );

        await cliente.update({
            nome: nome.trim(),
            telefone: telefoneNormalizado
        });

        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar: ' + error.message });
    }
});

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

app.get('/site/:nome', (req, res) => {
    const { nome } = req.params;
    
    // Segurança: remove qualquer ../ ou caractere estranho
    const nomeSeguro = nome.replace(/[^a-zA-Z0-9_-]/g, '');
    
    res.render(nomeSeguro, (err, html) => {
        if (err) return res.status(404).send('Site não encontrado');
        res.send(html);
    });
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
        if (!req.session.clienteNome || !req.session.clienteTelefone) {
            return res.redirect(`/loginUsuario/${token}`);
        }        
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
                attributes: ['id', 'nome', 'foto'] 
            })
        ]);

        const horariosOcupados = agendamentos.map(a => ({
            data: a.data,
            horario: a.horario
        }));

        const servicosFormatados = servicos.map(s => ({
            id: s.id,                      
            nome: s.nome,
            valor: parseFloat(s.valor).toFixed(2).replace('.', ','),
            duracao_minutos: s.duracao_minutos,
            qtd_sessoes: s.qtd_sessoes || null  
        }));

        const barbeiros = admins.map(a => ({
            id: a.id,       
            nome: a.nome,
            foto: a.foto || null
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

function normalizarTelefone(tel) {
    // Remove tudo que não é número
    const numeros = tel.replace(/\D/g, '');
    // Remove o 55 do Brasil se vier com DDI
    const semDDI = numeros.startsWith('55') && numeros.length >= 12 
        ? numeros.slice(2) 
        : numeros;
    // Formata como (XX) XXXXX-XXXX
    if (semDDI.length === 11) {
        return `(${semDDI.slice(0,2)}) ${semDDI.slice(2,7)}-${semDDI.slice(7)}`;
    }
    // Fixo (XX) XXXX-XXXX
    if (semDDI.length === 10) {
        return `(${semDDI.slice(0,2)}) ${semDDI.slice(2,6)}-${semDDI.slice(6)}`;
    }
    // Se não reconhecer o formato, retorna só os números
    return semDDI;
}

// CRIAR CLIENTES NO BANCO DE DADOS
app.post('/loginUsuario/:token', async (req, res) => {
    const { nome } = req.body;
    const telefone = normalizarTelefone(req.body.telefone); // 👈
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
            attributes: ['id', 'nome', 'email', 'role', 'ativo', 'telefone','foto'],
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
        const { nome, email, senha, role, telefone } = req.body;

        if (!nome || !email || !senha || !telefone) {
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
            telefone: telefone.trim(),
            idEmpresa: req.user.idEmpresa,
            ativo: 'S',
            role: role === 'owner' ? 'owner' : 'admin'
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

app.patch('/admins/:id/telefone', isAdminAuthenticated, async (req, res) => {
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

// alterar foto do admin
app.post('/admins/:id/foto', isAdminAuthenticated, uploadAdmins.single('foto'), async (req, res) => {
    try {
        const admin = await Admin.findOne({
            where: { id: req.params.id, idEmpresa: req.user.idEmpresa }
        });
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
async function verificarConflito(barbeiro, data, horaInicio, horaFim, idEmpresa, idIgnorar = null) {
    // 'data' já vem como string '2026-03-21', usa direto sem converter para Date
    const where = {
        barbeiro,
        idEmpresa,
        data,  // 👈 compara string direto com o campo do banco
        hora_inicio: { [Op.lt]: horaFim },
        hora_fim:    { [Op.gt]: horaInicio }
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
    const { barbeiro, data, horario, servico, profissional_id, hora_inicio, hora_fim, servico_id } = req.body;
    const { token } = req.params;

    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });

        if (!empresa) {
            return res.status(404).send('Empresa não encontrada');
        }

        const idEmpresa = empresa.id;

        // Extrai hora_inicio e hora_fim do horario caso não venham separados
        let hiInicio = hora_inicio;
        let hiFim = hora_fim;

        if (!hiInicio || !hiFim) {
            const partes = horario.split(/\s*[–-]\s*/);
            hiInicio = partes[0]?.trim();
            hiFim = partes[1]?.trim();
        }

        const ocupado = await verificarConflito(barbeiro, data, hiInicio, hiFim, idEmpresa);

        if (ocupado) {
            return res.render('agendar', {
                erro: `${barbeiro} já tem agendamento às ${hiInicio} neste dia.`
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
            horario: hiInicio,  // 👈 salva só "13:00" igual ao padrão do banco
            servico,
            valor,
            idEmpresa,
            profissional_id: profissional_id || null,
            hora_inicio: hiInicio,
            hora_fim: hiFim || null,
            servico_id: servico_id || null,
            status: 'pendente'
        });

        let whatsappLink = null;

        if (profissional_id) {
            const adminProf = await Admin.findOne({
                where: { id: profissional_id, idEmpresa },
                attributes: ['telefone']
            });

            const telefoneLimpo = adminProf?.telefone?.replace(/\D/g, '');
            const empresaObj = await Empresa.findByPk(idEmpresa, {
                attributes: ['observacao']
            });

            if (telefoneLimpo) {
                const mensagem = encodeURIComponent(
                    `Olá! Acabei de agendar:\n` +
                    `📅 Data: ${data}\n` +
                    `⏰ Horário: ${hiInicio}\n` +   // 👈 usa hiInicio
                    `✂️ Serviço: ${servico}\n` +
                    `👤 Profissional: ${barbeiro}` +
                    (empresaObj?.observacao ? `\n📌 ${empresaObj.observacao}` : '')
                );
                whatsappLink = `https://wa.me/55${telefoneLimpo}?text=${mensagem}`;
            }
        }

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
    const { barbeiro, nome, telefone, data, horario, servico, profissional_id, hora_inicio, hora_fim, servico_id } = req.body;
    const idEmpresa = req.user.idEmpresa;
    const tipo = req.body.tipo || 'agendamento';
    const isCompromisso = tipo === 'compromisso';
    try {
        if (!idEmpresa) {
            return res.status(403).json({ erro: 'Empresa não identificada.' });
        }

        let hiInicio, hiFim;

        if (isCompromisso) {
            // Compromisso usa os campos próprios de hora
            hiInicio = req.body.compromisso_inicio;
            hiFim = req.body.compromisso_fim;

            if (!hiInicio || !hiFim) {
                return res.status(400).json({ erro: 'Informe hora início e fim do compromisso.' });
            }
        } else {
            // Agendamento normal
            hiInicio = hora_inicio;
            hiFim = hora_fim;

            if (!hiInicio || !hiFim) {
                const partes = (horario || '').split(/\s*[–-]\s*/);
                hiInicio = partes[0]?.trim();
                hiFim = partes[1]?.trim();
            }
        }

        const ocupado = await verificarConflito(barbeiro, data, hiInicio, hiFim, idEmpresa);
        if (ocupado) {
            return res.status(409).json({
                erro: `${barbeiro} já tem agendamento às ${hiInicio} neste dia.`
            });
        }

        const servicoObj = !isCompromisso
            ? await Servico.findOne({ where: { nome: servico, idEmpresa } })
            : null;

        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        await Agendamento.create({
            barbeiro,
            nome: isCompromisso ? (req.body.motivo || 'Compromisso') : nome,
            email: null,
            telefone: isCompromisso ? '999999999' : telefone,
            data,
            horario: hiInicio,
            servico: isCompromisso ? null : servico,
            valor,
            idEmpresa,
            profissional_id: profissional_id || null,
            hora_inicio: hiInicio,
            hora_fim: hiFim || null,
            servico_id: isCompromisso ? null : (servico_id || null),
            status: isCompromisso ? 'compromisso' : 'pendente'
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

        const [agendamentos, admins, servicos, empresa] = await Promise.all([
            Agendamento.findAll({ where: { idEmpresa } }),
            Admin.findAll({ where: { idEmpresa }, attributes: ['id', 'nome', 'email', 'role', 'ativo'] }), 
            Servico.findAll({ where: { ativo: true, idEmpresa }, order: [['nome', 'ASC']]}),
            Empresa.findByPk(idEmpresa) // 👈 ADICIONADO: Busca os dados da empresa (incluindo o token)
        ]);

        const barbeiros = admins.map(a => ({ id: a.id, nome: a.nome }));

        const servicosFormatados = servicos.map(s => ({
            id: s.id,
            nome: s.nome,
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
                pago: agendamento.pago || 0 ,
                pacote_id: agendamento.pacote_id || null
            };
        });
//console.log('>>> AGENDAMENTOS:', agendamentosFormatados.map(a => ({ id: a.id, pacote_id: a.pacote_id })));

        // Agora passamos o objeto 'empresa' para a view
        res.render('admin', { 
            agendamentos: agendamentosFormatados, 
            barbeiros, 
            servicos: servicosFormatados,
            empresa: empresa ? empresa.get({ plain: true }) : null // 👈 ENVIANDO PARA O HANDLEBARS
        });
    } catch (error) {
        res.render('admin', { erro: "Erro ao buscar dados: " + error.message });
    }
});

// ajustar pagamento 
const { QueryTypes } = require('sequelize');
app.patch('/agendamentos/:id/pago', isAdminAuthenticated, async (req, res) => {
    try {
        const id = req.params.id;
        const idEmpresa = req.user.idEmpresa;

        // Busca o agendamento atual com pacote_id
        const rows = await sequelize.query(
            'SELECT pago, pacote_id FROM Agendamentos WHERE id = :id AND idEmpresa = :idEmpresa',
            { replacements: { id, idEmpresa }, type: QueryTypes.SELECT }
        );

        if (!rows.length) return res.status(404).json({ erro: 'Não encontrado' });

        const novoPago = rows[0].pago ? 0 : 1;
        const pacoteId = rows[0].pacote_id;

        if (pacoteId) {
            // É pacote — atualiza todos os agendamentos do pacote
            await sequelize.query(
                'UPDATE Agendamentos SET pago = :novoPago WHERE pacote_id = :pacoteId AND idEmpresa = :idEmpresa',
                { replacements: { novoPago, pacoteId, idEmpresa }, type: QueryTypes.UPDATE }
            );

            // Atualiza também a tabela Pacotes
            await sequelize.query(
                'UPDATE Pacotes SET pago = :novoPago WHERE id = :pacoteId AND idEmpresa = :idEmpresa',
                { replacements: { novoPago, pacoteId, idEmpresa }, type: QueryTypes.UPDATE }
            );
        } else {
            // Agendamento normal — atualiza só esse
            await sequelize.query(
                'UPDATE Agendamentos SET pago = :novoPago WHERE id = :id AND idEmpresa = :idEmpresa',
                { replacements: { novoPago, id, idEmpresa }, type: QueryTypes.UPDATE }
            );
        }

        return res.json({ sucesso: true, pago: novoPago });
    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
});

//Agendar pacotes 
app.post('/admin/pacote', isAdminAuthenticated, async (req, res) => {
    const { nome, telefone, servico, servico_id, barbeiro, profissional_id, sessoes } = req.body;
    
    try {
        const sessoesArray = JSON.parse(sessoes);
        
        // Verifica conflitos
        for (const s of sessoesArray) {
            const ocupado = await verificarConflito(barbeiro, s.data, s.hora_inicio, s.hora_fim, req.user.idEmpresa);
            if (ocupado) {
                return res.status(409).json({ erro: `Conflito no horário ${s.hora_inicio} do dia ${s.data}` });
            }
        }

        // Cria o pacote
        const pacote = await Pacote.create({
            idEmpresa: req.user.idEmpresa,
            servico_id,
            cliente_nome: nome,
            cliente_telefone: telefone,
            total_sessoes: sessoesArray.length,
            status: 'pendente'
        });

        const servicoObj = await Servico.findOne({ where: { id: servico_id, idEmpresa: req.user.idEmpresa } });
        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        for (const s of sessoesArray) {
            const ag = await Agendamento.create({
                barbeiro,
                nome,
                telefone,
                email: null,
                data: s.data,
                horario: s.hora_inicio,
                hora_inicio: s.hora_inicio,
                hora_fim: s.hora_fim,
                servico,
                valor,
                idEmpresa: req.user.idEmpresa,
                profissional_id: profissional_id || null,
                servico_id: servico_id || null,
                pacote_id: pacote.id,  // 👈
                status: 'pendente',
                pago: 0
            });
            await sequelize.query(
                'UPDATE Agendamentos SET pacote_id = :pacoteId WHERE id = :id AND idEmpresa = :idEmpresa',
                { 
                    replacements: { 
                        pacoteId: pacote.id, 
                        id: ag.id,
                        idEmpresa: req.user.idEmpresa  // 👈
                    }, 
                    type: QueryTypes.UPDATE 
                }
            );            
        }

        return res.status(200).json({ sucesso: true, pacote_id: pacote.id });

    } catch (e) {
        return res.status(500).json({ erro: e.message });
    }
});
// cliente agendar pacotes
app.post('/pacote/:token', async (req, res) => {
    const { token } = req.params;
    const { barbeiro, profissional_id, servico, servico_id, sessoes } = req.body;

    try {
        const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
        if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });

        const idEmpresa = empresa.id;
        const nome = req.session.clienteNome;
        const telefone = req.session.clienteTelefone;

        if (!nome || !telefone) return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });

        const sessoesArray = JSON.parse(sessoes);

        // Verifica conflitos em todos os horários
        for (const s of sessoesArray) {
            const ocupado = await verificarConflito(barbeiro, s.data, s.hora_inicio, s.hora_fim, idEmpresa);
            if (ocupado) {
                return res.status(409).json({ 
                    erro: `Conflito no horário ${s.hora_inicio} do dia ${s.data}` 
                });
            }
        }

        // Cria o pacote
        const pacote = await Pacote.create({
            idEmpresa,
            servico_id,
            cliente_nome: nome,
            cliente_telefone: telefone,
            total_sessoes: sessoesArray.length,
            status: 'pendente'
        });

        // Busca valor do serviço
        const servicoObj = await Servico.findOne({ where: { id: servico_id, idEmpresa } });
        const valor = servicoObj ? parseFloat(servicoObj.valor) : 0;

        // Cria os agendamentos
        for (const s of sessoesArray) {
            const ag = await Agendamento.create({
                barbeiro,
                nome,
                telefone,
                email: null,
                data: s.data,
                horario: s.hora_inicio,
                hora_inicio: s.hora_inicio,
                hora_fim: s.hora_fim,
                servico,
                valor,
                idEmpresa,
                profissional_id: profissional_id || null,
                servico_id: servico_id || null,
                status: 'pendente',
                pago: 0
            });

            // Vincula ao pacote via query raw
            await sequelize.query(
                'UPDATE Agendamentos SET pacote_id = :pacoteId WHERE id = :id AND idEmpresa = :idEmpresa',
                { 
                    replacements: { pacoteId: pacote.id, id: ag.id, idEmpresa },
                    type: QueryTypes.UPDATE
                }
            );
        }

        // Monta link WhatsApp do profissional
        let whatsappLink = null;
        if (profissional_id) {
            const adminProf = await Admin.findOne({
                where: { id: profissional_id, idEmpresa },
                attributes: ['telefone']
            });
            const telefoneLimpo = adminProf?.telefone?.replace(/\D/g, '');
            if (telefoneLimpo) {
                const datasTexto = sessoesArray.map((s, i) => 
                    `📅 Sessão ${i+1}: ${s.data} às ${s.hora_inicio}`
                ).join('\n');
                const mensagem = encodeURIComponent(
                    `Olá! Acabei de agendar um pacote:\n` +
                    `✂️ Serviço: ${servico}\n` +
                    `👤 Profissional: ${barbeiro}\n` +
                    `${datasTexto}`
                );
                whatsappLink = `https://wa.me/55${telefoneLimpo}?text=${mensagem}`;
            }
        }

        return res.json({ sucesso: true, pacote_id: pacote.id, whatsappLink });

    } catch (e) {
        console.log('>>> ERRO PACOTE CLIENTE:', e.message);
        return res.status(500).json({ erro: e.message });
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

// LISTA TODOS OS SERVIÇOS (admin — inclui inativos)
app.get('/servicos/admin', isAdminAuthenticated, async (req, res) => {
    const servicos = await Servico.findAll({ where: { idEmpresa: req.user.idEmpresa }, order: [['nome', 'ASC']] });
    res.json({ servicos: servicos.map(s => ({ id: s.id, nome: s.nome, valor: s.valor, ativo: s.ativo, duracao_minutos: s.duracao_minutos })) }); 
});

// ADICIONA NOVO SERVIÇO
app.post('/servicos', isAdminAuthenticated, async (req, res) => {
    const { nome, valor, duracao_minutos , qtd_sessoes  } = req.body;
    try {
        await Servico.create({ nome, valor,duracao_minutos, qtd_sessoes: qtd_sessoes || null , idEmpresa: req.user.idEmpresa });
        res.json({ sucesso: true });
    } catch (e) {
       
        res.status(500).json({ erro: e.message });
    }
});

// EDITA NOME E VALOR
app.put('/servicos/:id', isAdminAuthenticated, async (req, res) => {
    const { nome, valor, duracao_minutos  } = req.body;
    try {
        await Servico.update({ nome, valor, duracao_minutos  }, { where: { id: req.params.id } });
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
