const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
const upload = require('../config/multer');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');


router.get('/admin/produtos', isAdminAuthenticated, produtoController.listar);
router.post('/produtos', isAdminAuthenticated, upload.single('imagem'), produtoController.criar);
router.post('/produtos/excluir/:id', isAdminAuthenticated, produtoController.excluir);
router.post('/produtos/editar/:id', isAdminAuthenticated, upload.single('imagem'), produtoController.editar);

module.exports = router;

// GET /produtos/:id/historico
router.get('/produtos/:id/historico', isAdminAuthenticated, async (req, res) => {
    try {
        const MovtoEstoque = require('../models/MovtoEstoque');
        const Produto = require('../models/produto');

        const produto = await Produto.findOne({
            where: { id: req.params.id, idEmpresa: req.user.idEmpresa }
        });
        if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

        const movtos = await MovtoEstoque.findAll({
            where: { produto_id: req.params.id, empresa_id: req.user.idEmpresa },
            order: [['data', 'DESC']],
            limit: 50
        });

        res.json({
            sucesso: true,
            produto: { id: produto.id, descricao: produto.descricao, estoque: produto.estoque },
            movtos: movtos.map(m => ({
                id: m.id,
                data: m.data,
                tipo_documento: m.tipo_documento,
                ent_sai: m.ent_sai,
                qtd_anterior: m.qtd_anterior,
                quantidade: m.quantidade,
                qtd_final: m.qtd_final
            }))
        });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});