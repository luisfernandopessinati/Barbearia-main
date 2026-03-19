const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { isAdminAuthenticated } = require('../middlewares/adminMiddleware'); // 👈

router.get('/clientes', isAdminAuthenticated, clienteController.listar);

module.exports = router; 