const express = require('express');
const router = express.Router();
const autenticarToken = require('../../middlewares/authMiddleware');
const Admin = require('../../models/Admin');

// Aplica JWT em todas as rotas
router.use(autenticarToken);

// ─── LISTAR PROFISSIONAIS DA EMPRESA ──────────────────────────────────────────
// GET /api/profissionais
// Retorna os Admins da mesma empresa como lista de profissionais
router.get('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;

        const profissionais = await Admin.findAll({
            where: { idEmpresa },
            attributes: ['id', 'nome', 'foto'],
            order: [['nome', 'ASC']],
        });

        res.json({ success: true, data: profissionais });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao listar profissionais', error: err.message });
    }
});

// ─── BUSCAR POR ID ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;

        const profissional = await Admin.findOne({
            where: { id: req.params.id, idEmpresa },
            attributes: ['id', 'nome', 'foto'],
        });

        if (!profissional) return res.status(404).json({ success: false, message: 'Profissional não encontrado' });

        res.json({ success: true, data: profissional });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar profissional', error: err.message });
    }
});

module.exports = router;
