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
app.use('/', require('./routes/slotsRoutes'));
app.use('/', require('./routes/agendamentoAdminRoutes'));

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
            return res.status(401).json({ success: false, message: 'Login inválido' });
        }

        req.logIn(user, (err) => {
            if (err) return res.status(500).json({ error: err });

            return res.json({
                success: true,
                user: {
                    id: user.id,
                    nome: user.nome,
                    email: user.email
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

(async () => {   
    app.listen(PORT, () => {
        console.log(`Servidor funcionando na porta http://localhost:${PORT}`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/admin`);
        console.log(`Servidor funcionando na porta http://localhost:${PORT}/loginUsuario`);
    });
})();

