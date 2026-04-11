// routes/vendasRoutes.js
const express         = require('express');
const router          = express.Router();
const vendaController = require('../controllers/vendaController');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');

// ── Dashboard ────────────────────────────────────────────────────
router.get('/admin/dashboard/vendas',       isAdminAuthenticated, vendaController.viewDashboardVendas);
router.get('/admin/dashboard/vendas/dados', isAdminAuthenticated, vendaController.dashboardVendas);

// ── PDV ──────────────────────────────────────────────────────────
router.get( '/admin/vendas/produtos',  isAdminAuthenticated, vendaController.buscarProdutos);
router.post('/admin/vendas',           isAdminAuthenticated, vendaController.criar);

// ── Pagamentos de uma venda ──────────────────────────────────────
router.get('/admin/vendas/:id/pagamentos', isAdminAuthenticated, vendaController.listarPagamentos);

// ── Fechamento de caixa ──────────────────────────────────────────
router.get('/admin/fechamento',       isAdminAuthenticated, vendaController.viewFechamento);
router.get('/admin/fechamento/dados', isAdminAuthenticated, vendaController.fechamento);

// ── Cancelamento ─────────────────────────────────────────────────
router.patch('/admin/vendas/:id/cancelar', isAdminAuthenticated, vendaController.cancelar);

module.exports = router;