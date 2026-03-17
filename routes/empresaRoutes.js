const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const empresaController = require('../controllers/empresaController');

// Configuração do multer para upload de logo
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../public/uploads/logos'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `empresa-${req.session.idEmpresa}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|svg\+xml|webp/;
        const ok = allowed.test(file.mimetype);
        cb(ok ? null : new Error('Formato não permitido.'), ok);
    }
});

// Cadastro público (já existente)
router.get('/cadastro', (req, res, next) => {
    next();
}, empresaController.exibirCadastro);

router.post('/api/cadastro', empresaController.cadastrar);

// Dados da empresa (admin autenticado)
router.get('/api/empresa', empresaController.getDados);
router.put('/api/empresa', upload.single('logo'), empresaController.atualizarDados);

module.exports = router;
