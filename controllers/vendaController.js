// controllers/vendaController.js
const { Op } = require('sequelize');
const sequelize = require('../config/db');

const Venda = require('../models/Venda');
const VendaItem = require('../models/VendaItem');
const Produto = require('../models/produto');
const MovtoEstoque = require('../models/MovtoEstoque');

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
        const idEmpresa = req.user.idEmpresa;
        const usuario_id = req.user.id;

        if (!itens || !itens.length) {
            await t.rollback();
            return res.status(400).json({ message: 'Nenhum item informado' });
        }

        const mapaForma = {
            'Dinheiro': 'dinheiro',
            'Pix': 'pix',
            'Cartao Debito': 'cartao_debito',
            'Cartao Credito': 'cartao_credito',
        };
        const formaNormalizada = mapaForma[forma_pagamento] || 'outro';

        const total = itens.reduce((acc, i) => acc + (i.preco_unitario * i.quantidade), 0);
        const total_final = Math.max(0, total - parseFloat(desconto));

        const venda = await Venda.create({
            idEmpresa,
            usuario_id,
            total,
            desconto,
            total_final,
            forma_pagamento: formaNormalizada,
            status_pagamento: 'pago',
        }, { transaction: t });

        for (const item of itens) {
            const subtotal = item.preco_unitario * item.quantidade;
            await VendaItem.create({
                venda_id: venda.id,
                produto_id: item.produto_id,
                quantidade: item.quantidade,
                preco_unitario: item.preco_unitario,
                subtotal,
            }, { transaction: t });

            // ── Substitui o decrement para ter qtd_anterior disponível ──
            const produto = await Produto.findOne({
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
                lock: true,
            });

            if (produto) {
                const qtdAnterior = parseFloat(produto.estoque) || 0;
                const quantidade = parseFloat(item.quantidade);
                const qtdFinal = Math.max(0, qtdAnterior - quantidade);

                await produto.update({ estoque: qtdFinal }, { transaction: t });

                await MovtoEstoque.create({
                    empresa_id: idEmpresa,
                    produto_id: item.produto_id,
                    documento_id: venda.id,
                    tipo_documento: 'VENDA',
                    ent_sai: 'S',
                    qtd_anterior: qtdAnterior,
                    quantidade,
                    qtd_final: qtdFinal,
                    usuario_id,
                }, { transaction: t });
            }
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
        const data = req.query.data || new Date().toISOString().slice(0, 10);

        const inicio = new Date(data + 'T00:00:00');
        const fim = new Date(data + 'T23:59:59');

        const vendas = await Venda.findAll({
            where: {
                idEmpresa,
                createdAt: { [Op.between]: [inicio, fim] },
            },
            include: [{
                model: VendaItem,
                as: 'Itens',
                include: [{ model: Produto, as: 'Produto', attributes: ['descricao'] }],
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
        const { id } = req.params;

        const venda = await Venda.findOne({
            where: { id, idEmpresa },
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
            const produto = await Produto.findOne({
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
                lock: true,
            });
            if (!produto) continue;

            const qtdAnterior = parseFloat(produto.estoque) || 0;
            const quantidade = parseFloat(item.quantidade);
            const qtdFinal = qtdAnterior + quantidade;

            await produto.update({ estoque: qtdFinal }, { transaction: t });

            await MovtoEstoque.create({
                empresa_id: idEmpresa,
                produto_id: item.produto_id,
                documento_id: venda.id,
                tipo_documento: 'ESTORNO_VENDA',
                ent_sai: 'E',
                qtd_anterior: qtdAnterior,
                quantidade,
                qtd_final: qtdFinal,
                usuario_id: req.user.id,
            }, { transaction: t });
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

/* ─────────────────────────────────────────────
   GET /admin/dashboard/vendas
   Renderiza a página do dashboard de vendas.
───────────────────────────────────────────── */
exports.viewDashboardVendas = (req, res) => {
    res.render('dashboard_vendas');
};

/* ─────────────────────────────────────────────
   GET /admin/dashboard/vendas/dados?inicio=&fim=
   Retorna dados analytics de vendas.
───────────────────────────────────────────── */
exports.dashboardVendas = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const fim = req.query.fim ? new Date(req.query.fim + 'T23:59:59') : new Date();
        const inicio = req.query.inicio ? new Date(req.query.inicio + 'T00:00:00')
            : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

        const vendas = await Venda.findAll({
            where: {
                idEmpresa,
                status_pagamento: { [Op.ne]: 'cancelado' },
                createdAt: { [Op.between]: [inicio, fim] }
            },
            include: [{
                model: VendaItem,
                as: 'Itens',
                include: [{ model: Produto, as: 'Produto', attributes: ['descricao'] }]
            }],
            order: [['createdAt', 'ASC']]
        });

        const lista = vendas.map(v => v.get({ plain: true }));

        // ── KPIs ──────────────────────────────────────────
        const totalVendas = lista.length;
        const faturamentoTotal = lista.reduce((s, v) => s + parseFloat(v.total_final || 0), 0);
        const totalDesconto = lista.reduce((s, v) => s + parseFloat(v.desconto || 0), 0);
        const ticketMedio = totalVendas > 0 ? faturamentoTotal / totalVendas : 0;

        // ── Evolução diária ────────────────────────────────
        const evolucao = {};
        lista.forEach(v => {
            const d = new Date(v.createdAt);
            const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!evolucao[dia]) evolucao[dia] = { faturamento: 0, quantidade: 0 };
            evolucao[dia].faturamento += parseFloat(v.total_final || 0);
            evolucao[dia].quantidade += 1;
        });

        // ── Formas de pagamento ────────────────────────────
        const formasPagamento = {};
        lista.forEach(v => {
            const forma = v.forma_pagamento || 'outro';
            if (!formasPagamento[forma]) formasPagamento[forma] = { count: 0, valor: 0 };
            formasPagamento[forma].count += 1;
            formasPagamento[forma].valor += parseFloat(v.total_final || 0);
        });

        // ── Top produtos ───────────────────────────────────
        const produtosMap = {};
        lista.forEach(v => {
            (v.Itens || []).forEach(item => {
                const nome = item.Produto?.descricao || `Produto #${item.produto_id}`;
                if (!produtosMap[nome]) produtosMap[nome] = { quantidade: 0, faturamento: 0 };
                produtosMap[nome].quantidade += parseFloat(item.quantidade || 0);
                produtosMap[nome].faturamento += parseFloat(item.subtotal || 0);
            });
        });
        const topProdutos = Object.entries(produtosMap)
            .sort((a, b) => b[1].faturamento - a[1].faturamento)
            .slice(0, 10)
            .map(([nome, d]) => ({ nome, ...d }));

        const topProduto = topProdutos[0] || null;

        res.json({
            periodo: {
                inicio: inicio.toISOString().split('T')[0],
                fim: fim.toISOString().split('T')[0]
            },
            kpis: {
                totalVendas,
                faturamentoTotal: faturamentoTotal.toFixed(2),
                ticketMedio: ticketMedio.toFixed(2),
                totalDesconto: totalDesconto.toFixed(2),
                topProduto
            },
            evolucao,
            formasPagamento,
            topProdutos
        });

    } catch (err) {
        console.error('[dashboardVendas]', err);
        res.status(500).json({ erro: err.message });
    }
};