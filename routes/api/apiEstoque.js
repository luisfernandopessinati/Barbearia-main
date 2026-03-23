// Routes/Api/apiEstoque.js
const express = require('express');
const router = express.Router();
const sequelize = require('../../config/db');
const autenticarToken = require('../../middlewares/authMiddleware');

const Produto = require('../../models/produto');
const LancEstoque = require('../../models/LancEstoque');
const LancEstProduto = require('../../models/LancEstProduto');
const MovtoEstoque = require('../../models/MovtoEstoque');

// Aplica JWT em todas as rotas deste arquivo
router.use(autenticarToken);

// ─── EXTRATO DE MOVIMENTAÇÕES ───────────────────────────────────────────────────
// GET /api/estoque/movimentos?produto_id=5
// GET /api/estoque/movimentos?data_inicio=2025-01-01&data_fim=2025-01-31
router.get('/movimentos', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { produto_id, data_inicio, data_fim } = req.query;
        const { Op } = require('sequelize');

        const where = { empresa_id: idEmpresa };

        if (produto_id) where.produto_id = produto_id;

        if (data_inicio && data_fim) {
            where.data = { [Op.between]: [new Date(data_inicio), new Date(data_fim + ' 23:59:59')] };
        }

        const movimentos = await MovtoEstoque.findAll({
            where,
            include: [{ model: Produto, as: 'Produto', attributes: ['id', 'descricao', 'grupo'], required: false }],
            order: [['data', 'DESC']]
        });

        res.json({ success: true, data: movimentos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao listar movimentos', error: err.message });
    }
});

// ─── LANÇAMENTO MANUAL DE ESTOQUE ──────────────────────────────────────────────
// POST /api/estoque/lancamento
// Cria cabeçalho (LancEstoque) + itens (LancEstProduto) + atualiza saldo (MovtoEstoque + Produto.estoque)
// body: {
//   tipo: 'E' | 'S' | 'A',
//   observacao: '...',
//   itens: [ { produto_id, quantidade } ]
// }
router.post('/lancamento', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { idEmpresa, id: usuario_id } = req.user;
        const { tipo, observacao, itens } = req.body;

        if (!tipo || !['E', 'S', 'A'].includes(tipo)) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'tipo obrigatório: E=Entrada, S=Saída, A=Ajuste' });
        }

        if (!itens || !itens.length) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Informe ao menos um item' });
        }

        // 1. Cabeçalho do lançamento
        const lanc = await LancEstoque.create({
            empresa_id: idEmpresa,
            usuario_id,
            tipo,
            status: 'F', // já finaliza direto no app
            observacao
        }, { transaction: t });

        const movimentos = [];

        for (const item of itens) {
            const { produto_id, quantidade } = item;

            if (!produto_id || !quantidade || quantidade <= 0) continue;

            // 2. Busca saldo atual
            const produto = await Produto.findOne({ where: { id: produto_id, idEmpresa }, transaction: t });
            if (!produto) continue;

            const qtd_anterior = parseFloat(produto.estoque) || 0;
            const qtd = parseFloat(quantidade);

            let qtd_final;
            let ent_sai;

            if (tipo === 'E') {
                qtd_final = qtd_anterior + qtd;
                ent_sai = 'E';
            } else if (tipo === 'S') {
                qtd_final = qtd_anterior - qtd;
                ent_sai = 'S';
            } else {
                // Ajuste: quantidade informada é o novo saldo absoluto
                qtd_final = qtd;
                ent_sai = qtd >= qtd_anterior ? 'E' : 'S';
            }

            // 3. Item do lançamento
            await LancEstProduto.create({
                lancamento_id: lanc.id,
                produto_id,
                quantidade: qtd
            }, { transaction: t });

            // 4. Movimentação (extrato)
            movimentos.push(await MovtoEstoque.create({
                empresa_id: idEmpresa,
                produto_id,
                documento_id: lanc.id,
                tipo_documento: tipo === 'E' ? 'COMPRA' : tipo === 'S' ? 'ENTRADA_MANUAL' : 'AJUSTE',
                ent_sai,
                qtd_anterior,
                quantidade: qtd,
                qtd_final,
                usuario_id
            }, { transaction: t }));

            // 5. Atualiza saldo no produto
            await produto.update({ estoque: qtd_final }, { transaction: t });
        }

        await t.commit();
        res.status(201).json({ success: true, data: { lancamento: lanc, movimentos } });
    } catch (err) {
        await t.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao lançar estoque', error: err.message });
    }
});

// ─── SALDO ATUAL DOS PRODUTOS ───────────────────────────────────────────────────
// GET /api/estoque/saldo
router.get('/saldo', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { Op } = require('sequelize');

        const produtos = await Produto.findAll({
            where: { idEmpresa, ativo: true },
            attributes: ['id', 'descricao', 'grupo', 'estoque', 'est_min', 'preco', 'custo'],
            order: [['descricao', 'ASC']]
        });

        // Marca produtos com estoque abaixo do mínimo
        const data = produtos.map(p => ({
            ...p.toJSON(),
            alerta_minimo: p.estoque <= p.est_min
        }));

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar saldo', error: err.message });
    }
});

module.exports = router;