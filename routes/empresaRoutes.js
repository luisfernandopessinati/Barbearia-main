const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');

router.get('/cadastro', (req, res, next) => {    
    next();
}, empresaController.exibirCadastro);

router.post('/api/cadastro', empresaController.cadastrar);

module.exports = router;