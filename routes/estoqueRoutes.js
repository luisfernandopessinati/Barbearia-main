// routes/estoqueRoutes.js
const express            = require('express');
const router             = express.Router();
const estoqueController  = require('../controllers/estoqueController');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware');

// Página do PDV de estoque
router.get('/admin/estoque',                  isAdminAuthenticated, estoqueController.view);

// Busca produtos para o lançamento
router.get('/admin/estoque/produtos',         isAdminAuthenticated, estoqueController.buscarProdutos);

// Finaliza o lançamento
router.post('/admin/estoque',                 isAdminAuthenticated, estoqueController.criar);

// Consulta lançamentos do dia (JSON)
router.get('/admin/estoque/consulta/dados',   isAdminAuthenticated, estoqueController.consultaDados);

// Cancela lançamento + estorna estoque
router.patch('/admin/estoque/:id/cancelar',   isAdminAuthenticated, estoqueController.cancelar);

module.exports = router; 