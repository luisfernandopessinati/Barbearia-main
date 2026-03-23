// Routes/Api/apiVendas.js
const express = require('express');
const router = express.Router();
const sequelize = require('../../config/db');
const autenticarToken = require('../../middlewares/authMiddleware');

const Venda = require('../../models/Venda');
const VendaItem = require('../../models/VendaItem');
const Produto = require('../../models/produto');
const MovtoEstoque = require('../../models/MovtoEstoque');
const Cliente = require('../../models/Cliente');

// Aplica JWT em todas as rotas deste arquivo
router.use(autenticarToken);

// ─── LISTAR VENDAS ──────────────────────────────────────────────────────────────
// GET /api/vendas
// GET /api/vendas?data_inicio=2025-01-01&data_fim=2025-01-31
// GET /api/vendas?status_pagamento=pendente
router.get('/', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { data_inicio, data_fim, status_pagamento } = req.query;
        const { Op } = require('sequelize');

        const where = { idEmpresa };

        if (status_pagamento) where.status_pagamento = status_pagamento;

        if (data_inicio && data_fim) {
            where.createdAt = {
                [Op.between]: [new Date(data_inicio), new Date(data_fim + ' 23:59:59')]
            };
        }

        const vendas = await Venda.findAll({
            where,
            include: [
                { model: Cliente, as: 'Cliente', attributes: ['id', 'nome', 'telefone'], required: false },
                {
                    model: VendaItem, as: 'Itens',
                    include: [{ model: Produto, as: 'Produto', attributes: ['id', 'descricao', 'grupo'], required: false }]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json({ success: true, data: vendas });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao listar vendas', error: err.message });
    }
});

// ─── BUSCAR POR ID ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const { idEmpresa } = req.user;

        const venda = await Venda.findOne({
            where: { id: req.params.id, idEmpresa },
            include: [
                { model: Cliente, as: 'Cliente', attributes: ['id', 'nome', 'telefone'], required: false },
                {
                    model: VendaItem, as: 'Itens',
                    include: [{ model: Produto, as: 'Produto', attributes: ['id', 'descricao', 'grupo', 'preco'], required: false }]
                }
            ]
        });

        if (!venda) return res.status(404).json({ success: false, message: 'Venda não encontrada' });

        res.json({ success: true, data: venda });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao buscar venda', error: err.message });
    }
});

// ─── CRIAR VENDA ────────────────────────────────────────────────────────────────
// POST /api/vendas
// body: {
//   cliente_id: 5,                      (opcional)
//   forma_pagamento: 'pix',
//   desconto: 10.00,                    (opcional)
//   observacao: '...',                  (opcional)
//   itens: [
//     { produto_id: 3, quantidade: 2, preco_unitario: 25.00 }
//   ]
// }
// A baixa de estoque é feita automaticamente para cada item.
router.post('/', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { idEmpresa, id: usuario_id } = req.user;
        const { cliente_id, forma_pagamento, desconto, observacao, itens } = req.body;

        if (!itens || !itens.length) {
            await t.rollback();
            return res.status(400).json({ success: false, message: 'Informe ao menos um item na venda' });
        }

        // 1. Calcula totais
        let total = 0;
        for (const item of itens) {
            if (!item.produto_id || !item.quantidade || !item.preco_unitario) {
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Cada item precisa de produto_id, quantidade e preco_unitario' });
            }
            item.subtotal = parseFloat(item.quantidade) * parseFloat(item.preco_unitario);
            total += item.subtotal;
        }

        const desc = parseFloat(desconto) || 0;
        const total_final = total - desc;

        // 2. Cria cabeçalho da venda
        const venda = await Venda.create({
            idEmpresa,
            cliente_id: cliente_id || null,
            usuario_id,
            total,
            desconto: desc,
            total_final,
            forma_pagamento: forma_pagamento || null,
            status_pagamento: forma_pagamento ? 'pago' : 'pendente',
            observacao
        }, { transaction: t });

        // 3. Cria itens + baixa estoque automaticamente
        for (const item of itens) {
            // 3a. Item da venda
            await VendaItem.create({
                venda_id: venda.id,
                produto_id: item.produto_id,
                quantidade: item.quantidade,
                preco_unitario: item.preco_unitario,
                subtotal: item.subtotal
            }, { transaction: t });

            // 3b. Busca saldo atual do produto
            const produto = await Produto.findOne({ where: { id: item.produto_id, idEmpresa }, transaction: t });
            if (!produto) continue;

            const qtd_anterior = parseFloat(produto.estoque) || 0;
            const qtd = parseFloat(item.quantidade);
            const qtd_final = qtd_anterior - qtd;

            // 3c. Registra movimentação de saída
            await MovtoEstoque.create({
                empresa_id: idEmpresa,
                produto_id: item.produto_id,
                documento_id: venda.id,
                tipo_documento: 'VENDA',
                ent_sai: 'S',
                qtd_anterior,
                quantidade: qtd,
                qtd_final,
                usuario_id
            }, { transaction: t });

            // 3d. Atualiza saldo no produto
            await produto.update({ estoque: qtd_final }, { transaction: t });
        }

        await t.commit();
        res.status(201).json({ success: true, data: venda });
    } catch (err) {
        await t.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao registrar venda', error: err.message });
    }
});

// ─── ATUALIZAR PAGAMENTO ────────────────────────────────────────────────────────
// PATCH /api/vendas/:id/pagamento
// body: { forma_pagamento: 'dinheiro', status_pagamento: 'pago' }
router.patch('/:id/pagamento', async (req, res) => {
    try {
        const { idEmpresa } = req.user;
        const { forma_pagamento, status_pagamento } = req.body;

        const venda = await Venda.findOne({ where: { id: req.params.id, idEmpresa } });
        if (!venda) return res.status(404).json({ success: false, message: 'Venda não encontrada' });

        await venda.update({ forma_pagamento, status_pagamento });

        res.json({ success: true, data: venda });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar pagamento', error: err.message });
    }
});

// ─── CANCELAR VENDA ─────────────────────────────────────────────────────────────
// PATCH /api/vendas/:id/cancelar
// Cancela a venda e estorna o estoque automaticamente
router.patch('/:id/cancelar', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { idEmpresa, id: usuario_id } = req.user;

        const venda = await Venda.findOne({
            where: { id: req.params.id, idEmpresa },
            include: [{ model: VendaItem, as: 'Itens' }]
        });

        if (!venda) { await t.rollback(); return res.status(404).json({ success: false, message: 'Venda não encontrada' }); }
        if (venda.status_pagamento === 'cancelado') { await t.rollback(); return res.status(400).json({ success: false, message: 'Venda já está cancelada' }); }

        // Estorna estoque de cada item
        for (const item of venda.Itens) {
            const produto = await Produto.findOne({ where: { id: item.produto_id, idEmpresa }, transaction: t });
            if (!produto) continue;

            const qtd_anterior = parseFloat(produto.estoque) || 0;
            const qtd = parseFloat(item.quantidade);
            const qtd_final = qtd_anterior + qtd; // devolve ao estoque

            await MovtoEstoque.create({
                empresa_id: idEmpresa,
                produto_id: item.produto_id,
                documento_id: venda.id,
                tipo_documento: 'AJUSTE',
                ent_sai: 'E',
                qtd_anterior,
                quantidade: qtd,
                qtd_final,
                usuario_id
            }, { transaction: t });

            await produto.update({ estoque: qtd_final }, { transaction: t });
        }

        await venda.update({ status_pagamento: 'cancelado' }, { transaction: t });
        await t.commit();

        res.json({ success: true, message: 'Venda cancelada e estoque estornado' });
    } catch (err) {
        await t.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao cancelar venda', error: err.message });
    }
});

module.exports = router;