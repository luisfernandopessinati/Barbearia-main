const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const upload = require('../config/multer');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware'); // 👈 importa aqui

// Cadastro público
router.get('/cadastro', empresaController.exibirCadastro);
router.post('/api/cadastro', empresaController.cadastrar);

// Dados da empresa (admin autenticado)
router.get('/api/empresa', isAdminAuthenticated, empresaController.getDados);
router.put('/api/empresa', isAdminAuthenticated, (req, res, next) => {
    upload.single('logo')(req, res, (err) => {
        if (err) {
            console.error('Multer erro:', err.message);
            return res.status(400).json({ erro: err.message });
        }
        next();
    });
}, empresaController.atualizarDados);

module.exports = router;