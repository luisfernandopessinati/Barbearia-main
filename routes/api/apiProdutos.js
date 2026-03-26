// Routes/Api/apiProdutos.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const autenticarToken = require('../../middlewares/authMiddleware');

const Produto = require('../../models/produto');

// Aplica JWT em todas as rotas deste arquivo
router.use(autenticarToken);

// ─── LISTAR ────────────────────────────────────────────────────────────────────
// GET /api/produtos              → todos ativos
// GET /api/produtos?inativos=1   → inclui inativos
// GET /api/produtos?grupo=cabelo → filtra por grupo
// GET /api/produtos?busca=shamp  → busca por descrição
router.get('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { inativos, grupo, busca } = req.query;

        const where = { idEmpresa };

        if (!inativos) where.ativo = true; // por padrão só ativos

        if (grupo) where.grupo = grupo;

        if (busca) {
            where.descricao = { [Op.like]: `%${busca}%` };
        }

        const produtos = await Produto.findAll({
            where,
            order: [['descricao', 'ASC']]
        });

        res.json({ success: true, data: produtos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao listar produtos', error: err.message });
    }
});

// ─── ESTOQUE ABAIXO DO MÍNIMO ───────────────────────────────────────────────────
// GET /api/produtos/estoque-minimo
router.get('/estoque-minimo', async (req, res) => {
    try {
        const { idEmpresa } = req.user;

        const produtos = await Produto.findAll({
            where: {
                idEmpresa,
                ativo: true,
                estoque: { [Op.lte]: Produto.sequelize.col('est_min') }
            },
            order: [['estoque', 'ASC']]
        });

        res.json({ success: true, data: produtos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar estoque mínimo', error: err.message });
    }
});

// ─── BUSCAR POR ID ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const produto = await Produto.findOne({ where: { id: req.params.id, idEmpresa } });

        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });

        res.json({ success: true, data: produto });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar produto', error: err.message });
    }
});

// GET /api/produtos/codigo/:codbarras
router.get('/codigo/:codbarras', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const produto = await Produto.findOne({ 
            where: { codbarras: req.params.codbarras, idEmpresa, ativo: true } 
        });

        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });

        res.json({ success: true, data: produto });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── CRIAR ──────────────────────────────────────────────────────────────────────
router.post('/', upload.single('imagem'), async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { descricao, grupo, codbarras, custo, preco, estoque, est_min } = req.body;

        if (!descricao || preco === undefined) {
            return res.status(400).json({ success: false, message: 'Campos obrigatórios: descricao, preco' });
        }

        // ✅ Pega o caminho do arquivo enviado, ou null se não enviou
        const imagem = req.file
            ? '/' + req.file.path.replace(/\\/g, '/')  // normaliza barras no Windows
            : null;

        const novo = await Produto.create({
            idEmpresa,
            descricao, grupo, codbarras,
            custo, preco,
            estoque: estoque ?? 0,
            est_min: est_min ?? 0,
            imagem,
            ativo: true
        });

        res.status(201).json({ success: true, data: novo });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao criar produto', error: err.message });
    }
});

// ─── EDITAR ─────────────────────────────────────────────────────────────────────
router.put('/:id', upload.single('imagem'), async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const produto = await Produto.findOne({ where: { id: req.params.id, idEmpresa } });

        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });

        const { descricao, grupo, codbarras, custo, preco, est_min } = req.body;

        // ✅ Só atualiza imagem se enviou uma nova, senão mantém a atual
        const imagem = req.file
            ? '/' + req.file.path.replace(/\\/g, '/')
            : produto.imagem;

        await produto.update({ descricao, grupo, codbarras, custo, preco, est_min, imagem });

        res.json({ success: true, data: produto });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao editar produto', error: err.message });
    }
});

// ─── INATIVAR / REATIVAR ────────────────────────────────────────────────────────
// PATCH /api/produtos/:id/ativo
// body: { ativo: true } ou { ativo: false }
router.patch('/:id/ativo', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { ativo } = req.body;

        const produto = await Produto.findOne({ where: { id: req.params.id, idEmpresa } });
        if (!produto) return res.status(404).json({ success: false, message: 'Produto não encontrado' });

        await produto.update({ ativo: ativo ? true : false });

        const msg = ativo ? 'Produto reativado' : 'Produto inativado';
        res.json({ success: true, message: msg, data: produto });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao alterar status do produto', error: err.message });
    }
});

module.exports = router;