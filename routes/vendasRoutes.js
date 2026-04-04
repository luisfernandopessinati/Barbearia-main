// routes/vendasRoutes.js
const express         = require('express');
const router          = express.Router();
const vendaController = require('../controllers/vendaController');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');

// Dashboard de vendas — página
router.get('/admin/dashboard/vendas', isAdminAuthenticated, vendaController.viewDashboardVendas);

// Dashboard de vendas — dados JSON
router.get('/admin/dashboard/vendas/dados', isAdminAuthenticated, vendaController.dashboardVendas);

// PDV — busca produtos
router.get('/admin/vendas/produtos', isAdminAuthenticated, vendaController.buscarProdutos);

// PDV — finalizar venda
router.post('/admin/vendas', isAdminAuthenticated, vendaController.criar);

// Fechamento de caixa — página
router.get('/admin/fechamento', isAdminAuthenticated, vendaController.viewFechamento);

// Fechamento de caixa — dados JSON
router.get('/admin/fechamento/dados', isAdminAuthenticated, vendaController.fechamento);

// Cancelar venda
router.patch('/admin/vendas/:id/cancelar', isAdminAuthenticated, vendaController.cancelar);

module.exports = router;