// routes/vendasRoutes.js
const express         = require('express');
const router          = express.Router();
const vendaController = require('../controllers/vendaController');
const despesaController   = require('../controllers/despesaController'); 
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');
const Despesa = require('../models/Despesa');

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

// ── Despesas / Saídas de caixa ───────────────────────────────────
router.post(  '/admin/despesas',     isAdminAuthenticated, despesaController.criar);
router.get(   '/admin/despesas',     isAdminAuthenticated, despesaController.listar);
router.delete('/admin/despesas/:id', isAdminAuthenticated, despesaController.remover);

// ── Cancelamento ─────────────────────────────────────────────────
router.patch('/admin/vendas/:id/cancelar', isAdminAuthenticated, vendaController.cancelar);

module.exports = router;