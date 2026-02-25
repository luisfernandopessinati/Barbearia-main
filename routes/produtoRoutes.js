const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
// const upload = require('../config/multer'); // se estiver usando upload

// listar
router.get('/admin/produtos', produtoController.listar);

// criar
router.post('/produtos', produtoController.criar);
// se for usar upload:
// router.post('/produtos', upload.single('imagem'), produtoController.criar);

// excluir
router.post('/produtos/excluir/:id', produtoController.excluir);

module.exports = router;