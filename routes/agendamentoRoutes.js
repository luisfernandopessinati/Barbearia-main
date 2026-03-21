const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware'); // ✅ importa
const agendamentoController = require('../controllers/agendamentoController');

router.get('/agendamentos', authMiddleware, agendamentoController.listar); // ✅ aplica

module.exports = router;