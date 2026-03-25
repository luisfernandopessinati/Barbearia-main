// No seu arquivo: routes/api/apiAdmin.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/authMiddleware');
const Empresa = require('../../models/Empresa'); // Certifique-se que o caminho do model está correto

// GET /api/admin/perfil
// Traz os dados da empresa para usar na Home e no WhatsApp
router.get('/perfil', authMiddleware, async (req, res) => {
    try {
        const { idEmpresa } = req.user;

        const empresa = await Empresa.findByPk(idEmpresa, {
            attributes: ['id', 'nome', 'logo', 'observacao', 'telefone', 'endereco']
        });

        if (!empresa) {
            return res.status(404).json({ success: false, message: 'Empresa não encontrada' });
        }

        res.json({ success: true, data: empresa });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar perfil da empresa' });
    }
});

// Adicione no apiAdmin.js
const Empresa = require('../../models/Empresas'); // Verifique se o nome do model está correto

router.get('/perfil', authMiddleware, async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa; // Pegando do token decodificado

        const empresa = await Empresa.findByPk(idEmpresa, {
            attributes: ['nome', 'logo', 'observacao'] // Ajuste as colunas conforme seu banco
        });

        if (!empresa) {
            return res.status(404).json({ success: false, message: 'Empresa não encontrada' });
        }

        res.json({ success: true, data: empresa });
    } catch (error) {
        console.error("Erro ao buscar perfil:", error);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});
module.exports = router;