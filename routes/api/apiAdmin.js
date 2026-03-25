const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/authMiddleware');
const Empresa = require('../../models/Empresas');

// GET /api/admin/perfil
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

    } catch (error) {
        console.error("Erro ao buscar perfil:", error);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

module.exports = router;