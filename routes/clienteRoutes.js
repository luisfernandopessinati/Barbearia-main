const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');

module.exports = (isAdminAuthenticated) => {
    router.get('/clientes', isAdminAuthenticated, clienteController.listar);
    return router;
};