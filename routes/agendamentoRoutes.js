const express = require('express');
const router = express.Router();
const agendamentoController = require('../controllers/agendamentoController');

router.get('/agendamentos', agendamentoController.listar);

module.exports = router;