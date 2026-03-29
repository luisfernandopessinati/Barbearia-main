require('dotenv').config();

const express = require('express');
const { engine } = require('express-handlebars');
const bodyParser = require('body-parser');

const sequelize = require('./config/db');
const bcrypt = require('bcryptjs');

const { isAdminAuthenticated } = require('./middlewares/adminMiddleware');


// ─── Models ───────────────────────────────────────────────────────────────────
const Admin                = require('./models/Admin');
const Agendamento          = require('./models/Agendamento');
const Bloqueio             = require('./models/Bloqueio');
const Cliente              = require('./models/Cliente');
const Empresa              = require('./models/Empresas');
const Feriado              = require('./models/feriado');
const HorarioFuncionamento = require('./models/HorarioFuncionamento');
const Servico              = require('./models/servico');
const Produto              = require('./models/produto');
const Pacote               = require('./models/Pacotes');
const Venda                = require('./models/Venda');
const VendaItem            = require('./models/VendaItem');
const MovtoEstoque         = require('./models/MovtoEstoque');
const LancEstoque    = require('./models/LancEstoque');
const LancEstProduto = require('./models/LancEstProduto');

// ─── Associations ─────────────────────────────────────────────────────────────
Agendamento.belongsTo(Servico,   { foreignKey: 'servico_id',      as: 'Servico' });
Agendamento.belongsTo(Admin,     { foreignKey: 'profissional_id', as: 'Profissional' });

Venda.belongsTo(Cliente,         { foreignKey: 'cliente_id',  as: 'Cliente' });
Venda.hasMany(VendaItem,         { foreignKey: 'venda_id',    as: 'Itens' });
VendaItem.belongsTo(Venda,       { foreignKey: 'venda_id' });
VendaItem.belongsTo(Produto,     { foreignKey: 'produto_id',  as: 'Produto' });
MovtoEstoque.belongsTo(Produto,  { foreignKey: 'produto_id',  as: 'Produto' });

LancEstoque.hasMany(LancEstProduto, { foreignKey: 'lancamento_id', as: 'Itens' });
LancEstProduto.belongsTo(Produto,   { foreignKey: 'produto_id',    as: 'Produto' });
// ─── Services / Helpers ───────────────────────────────────────────────────────
const { getSlotsDisponiveis, minutesToTime, temColisao, timeToMinutes } = require('./services/slotService');
const { verificarConflito } = require('./helpers/conflito');

const passport = require('passport');
const session  = require('express-session');
require('./config/auth')(passport);

const { Op } = require('sequelize');
const jwt     = require('jsonwebtoken');
const SECRET  = process.env.JWT_SECRET;

const app  = express();
const PORT = process.env.PORT || 3333;

const clienteController = require('./controllers/clienteController');
const uploadAdmins      = require('./config/multerAdmins');
const upload            = require('./config/multer');
const empresaController = require('./controllers/empresaController');

const path = require('path');
const fs   = require('fs');

// ─── Session / Passport ───────────────────────────────────────────────────────
const isProd = process.env.NODE_ENV === 'production';

app.use(session({
    secret: process.env.CHAVE,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProd, // só em produção
        sameSite: isProd ? 'none' : 'lax'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// ─── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'handlebars');

app.engine('handlebars', engine({
    helpers: {
        substr: (str, start, len) => {
            if (!str) return '';
            return str.substring(start, start + len).toUpperCase();
        },
        eq:   (a, b) => a === b,
        lt:   (a, b) => a < b,
        json: (obj)  => JSON.stringify(obj),
        add:  (a, b) => a + b
    }
}));

// ─── Body parser / Static ─────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(bodyParser.urlencoded({ extended: false, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/public/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rotas web ────────────────────────────────────────────────────────────────
const agendamentoRoutes = require('./routes/agendamentoRoutes');
app.use('/api', agendamentoRoutes);

const apiServicos = require('./routes/api/apiServicos');
const apiProfissionais = require('./routes/api/apiProfissionais');
app.use('/api/servicos', apiServicos);
app.use('/api/profissionais', apiProfissionais);

const authRoutes = require('./routes/authRoutes');
app.use('/api', authRoutes);

const vendasRoutes = require('./routes/vendasRoutes');
app.use(vendasRoutes);

const estoqueRoutes = require('./routes/estoqueRoutes');
app.use(estoqueRoutes);

app.use('/', require('./routes/produtoRoutes'));
app.use('/', require('./routes/empresaRoutes'));
app.use('/', require('./routes/clienteRoutes'));
app.use('/', require('./routes/feriadoRoutes'));
app.use('/', require('./routes/horarioRoutes'));
app.use('/', require('./routes/servicoRoutes'));
app.use('/', require('./routes/adminRoutes'));
app.use('/', require('./routes/slotsRoutes'));
app.use('/', require('./routes/agendamentoAdminRoutes'));


// ─── Rotas API (web admin) ────────────────────────────────────────────────────
const apiAdminRoutes = require('./routes/api/apiAdmin');
app.use('/api/admin', apiAdminRoutes);

// ─── Rotas API (app mobile) ───────────────────────────────────────────────────
app.use('/api/agendamentos', require('./routes/api/apiAgendamentos'));
app.use('/api/produtos',     require('./routes/api/apiProdutos'));
app.use('/api/estoque',      require('./routes/api/apiEstoque'));
app.use('/api/vendas',       require('./routes/api/apiVendas'));


// tratando erro da imagem 
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).send('Imagem muito grande. O limite é 15MB.');
    }
    if (err.message) {
        return res.status(400).send(err.message);
    }
    next(err);
});

app.post('/loginAdmin', passport.authenticate('admin-local', {
    successRedirect: '/admin',
    failureRedirect: '/loginAdmin',
    failureFlash: false
}));

app.get('/', (req, res) => {
    res.render('home');
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

app.post('/api/loginAdmin', (req, res, next) => {
    passport.authenticate('admin-local', (err, user, info) => {
        if (err) return res.status(500).json({ error: err });
 
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Login inválido'
            });
        }
 
        req.logIn(user, (err) => {
            if (err) return res.status(500).json({ error: err });
 
            return res.json({
                success: true,
                token: jwt.sign(
                    {
                        id:        user.id,
                        idEmpresa: user.idEmpresa,  // ← padronizado
                        nome:      user.nome,        // ← útil no app
                        role:      user.role         // ← útil para permissões
                    },
                    SECRET,
                    { expiresIn: '7d' }
                ),
                user: {
                    id:        user.id,
                    nome:      user.nome,
                    role:      user.role,
                    idEmpresa: user.idEmpresa
                }
            });
        });
    })(req, res, next);
});
 

app.get('/loginAdmin', (req, res) => {
    res.render('loginAdmin');
});

app.get('/loginUsuario/:token', async (req, res) => {
    const { token } = req.params;

    const empresa = await Empresa.findOne({ where: { token_agendamento: token } });
    if (!empresa) return res.status(404).send('Empresa não encontrada');

    res.render('loginUsuario', { 
        token, 
        logo: empresa.logo,
        empresa: { feminino: empresa.estilo == 2 }  // 👈
    });
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

// Rota para abrir a tela de PDV (Vendas)
app.get('/admin/vendas', isAdminAuthenticated, (req, res) => {
    res.render('vendas', { 
        // Aqui passamos o token que o JS da página vai precisar
        // Se você usa JWT na sessão, pegue de lá
        token: req.user ? jwt.sign({ id: req.user.id, idEmpresa: req.user.idEmpresa }, SECRET) : null 
    });
});

// Rota para abrir a tela de Fechamento
app.get('/admin/fechamento', isAdminAuthenticated, (req, res) => {
    res.render('fechamento_caixa', { 
        token: req.user ? jwt.sign({ id: req.user.id, idEmpresa: req.user.idEmpresa }, SECRET) : null
    });
});

(async () => {   
    app.listen(PORT, () => {
        console.log(`Servidor funcionando na porta http://localhost:${PORT}`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/admin`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/loginUsuario`);
    });
})();

