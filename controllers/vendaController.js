// controllers/vendaController.js
const { Op } = require('sequelize');
const sequelize = require('../config/db');

const Venda     = require('../models/Venda');
const VendaItem = require('../models/VendaItem');
const Produto   = require('../models/produto');

/* ─────────────────────────────────────────────
   GET /admin/vendas/produtos?busca=TERMO
   Busca produtos ativos para o PDV.
───────────────────────────────────────────── */
exports.buscarProdutos = async (req, res) => {
    try {
        const { busca } = req.query;
        const idEmpresa = req.user.idEmpresa;

        const where = { idEmpresa, ativo: true };

        if (busca && busca.trim()) {
            where[Op.or] = [
                { descricao: { [Op.like]: `%${busca.trim()}%` } },
                { codbarras: { [Op.like]: `%${busca.trim()}%` } },
            ];
        }

        const produtos = await Produto.findAll({
            where,
            attributes: ['id', 'descricao', 'preco', 'estoque', 'codbarras'],
            limit: 30,
            order: [['descricao', 'ASC']],
        });

        return res.json({ data: produtos });
    } catch (err) {
        console.error('[buscarProdutos]', err);
        return res.status(500).json({ message: 'Erro ao buscar produtos' });
    }
};

/* ─────────────────────────────────────────────
   POST /admin/vendas
   Cria venda + itens em transação, desconta estoque.
───────────────────────────────────────────── */
exports.criar = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { forma_pagamento, desconto = 0, itens } = req.body;
        const idEmpresa  = req.user.idEmpresa;
        const usuario_id = req.user.id;

        if (!itens || !itens.length) {
            await t.rollback();
            return res.status(400).json({ message: 'Nenhum item informado' });
        }

        const mapaForma = {
            'Dinheiro':      'dinheiro',
            'Pix':           'pix',
            'Cartao Debito': 'cartao_debito',
            'Cartao Credito':'cartao_credito',
        };
        const formaNormalizada = mapaForma[forma_pagamento] || 'outro';

        const total       = itens.reduce((acc, i) => acc + (i.preco_unitario * i.quantidade), 0);
        const total_final = Math.max(0, total - parseFloat(desconto));

        const venda = await Venda.create({
            idEmpresa,
            usuario_id,
            total,
            desconto,
            total_final,
            forma_pagamento:  formaNormalizada,
            status_pagamento: 'pago',
        }, { transaction: t });

        for (const item of itens) {
            const subtotal = item.preco_unitario * item.quantidade;
            await VendaItem.create({
                venda_id:       venda.id,
                produto_id:     item.produto_id,
                quantidade:     item.quantidade,
                preco_unitario: item.preco_unitario,
                subtotal,
            }, { transaction: t });

            await Produto.decrement('estoque', {
                by: item.quantidade,
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
            });
        }

        await t.commit();
        return res.status(201).json({ data: { id: venda.id, total_final } });

    } catch (err) {
        await t.rollback();
        console.error('[vendaController.criar]', err);
        return res.status(500).json({ message: 'Erro ao registrar venda' });
    }
};

/* ─────────────────────────────────────────────
   GET /admin/fechamento?data=YYYY-MM-DD
   Retorna vendas do dia para o fechamento de caixa.
───────────────────────────────────────────── */
exports.fechamento = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const data      = req.query.data || new Date().toISOString().slice(0, 10);

        const inicio = new Date(data + 'T00:00:00');
        const fim    = new Date(data + 'T23:59:59');

        const vendas = await Venda.findAll({
            where: {
                idEmpresa,
                createdAt: { [Op.between]: [inicio, fim] },
            },
            include: [{
                model:      VendaItem,
                as:         'Itens',
                include:    [{ model: Produto, as: 'Produto', attributes: ['descricao'] }],
            }],
            order: [['createdAt', 'DESC']],
        });

        return res.json({ data: vendas });
    } catch (err) {
        console.error('[vendaController.fechamento]', err);
        return res.status(500).json({ message: 'Erro ao buscar fechamento' });
    }
};

/* ─────────────────────────────────────────────
   PATCH /admin/vendas/:id/cancelar
   Cancela a venda e estorna o estoque.
───────────────────────────────────────────── */
exports.cancelar = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const idEmpresa = req.user.idEmpresa;
        const { id }    = req.params;

        const venda = await Venda.findOne({
            where:   { id, idEmpresa },
            include: [{ model: VendaItem, as: 'Itens' }],
        });

        if (!venda) {
            await t.rollback();
            return res.status(404).json({ message: 'Venda não encontrada' });
        }

        if (venda.status_pagamento === 'cancelado') {
            await t.rollback();
            return res.status(400).json({ message: 'Venda já cancelada' });
        }

        // Estorna estoque de cada item
        for (const item of venda.Itens) {
            await Produto.increment('estoque', {
                by: item.quantidade,
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
            });
        }

        await venda.update({ status_pagamento: 'cancelado' }, { transaction: t });
        await t.commit();

        return res.json({ message: 'Venda cancelada com sucesso' });
    } catch (err) {
        await t.rollback();
        console.error('[vendaController.cancelar]', err);
        return res.status(500).json({ message: 'Erro ao cancelar venda' });
    }
};

/* ─────────────────────────────────────────────
   GET /admin/fechamento/view
   Renderiza a página de fechamento de caixa.
───────────────────────────────────────────── */
exports.viewFechamento = (req, res) => {
    res.render('fechamento_caixa');
};