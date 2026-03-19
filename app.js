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
