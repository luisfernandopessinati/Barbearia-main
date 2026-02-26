const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
const upload = require('../config/multer');

// Middleware de autenticação
function isAdminAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/loginAdmin');
}

router.get('/admin/produtos', isAdminAuthenticated, produtoController.listar);
router.post('/produtos', isAdminAuthenticated, upload.single('imagem'), produtoController.criar);
router.post('/produtos/excluir/:id', isAdminAuthenticated, produtoController.excluir);
router.post('/produtos/editar/:id', isAdminAuthenticated, upload.single('imagem'), produtoController.editar);

module.exports = router;