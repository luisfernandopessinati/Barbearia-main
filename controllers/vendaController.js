// controllers/vendaController.js
const { Op } = require('sequelize');
const sequelize = require('../config/db');

const Venda        = require('../models/Venda');
const VendaItem    = require('../models/VendaItem');
const Produto      = require('../models/produto');
const MovtoEstoque = require('../models/MovtoEstoque');
const Pagamento    = require('../models/Pagamento');
const Despesa      = require('../models/Despesa');

/* ─────────────────────────────────────────────────────────────────
   Associações locais (caso não estejam definidas em um index.js)
   ─────────────────────────────────────────────────────────────── */
if (!Venda.associations.Itens) {
    Venda.hasMany(VendaItem,  { foreignKey: 'venda_id', as: 'Itens' });
    VendaItem.belongsTo(Produto, { foreignKey: 'produto_id', as: 'Produto' });
}
if (!Venda.associations.Pagamentos) {
    Venda.hasMany(Pagamento, { foreignKey: 'venda_id', as: 'Pagamentos' });
    Pagamento.belongsTo(Venda, { foreignKey: 'venda_id' });
}

/* ─────────────────────────────────────────────────────────────────
   Helpers
   ─────────────────────────────────────────────────────────────── */

/**
 * Normaliza o identificador de forma de pagamento vindo do frontend.
 * Aceita tanto a chave direta ('dinheiro') quanto o label legado ('Dinheiro').
 */
const FORMAS_VALIDAS = new Set([
    'dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'crediario', 'misto', 'outro',
]);

const MAPA_LEGADO = {
    'Dinheiro':       'dinheiro',
    'Pix':            'pix',
    'Cartao Debito':  'cartao_debito',
    'Cartao Credito': 'cartao_credito',
};

function normalizarForma(forma) {
    if (!forma) return 'outro';
    if (FORMAS_VALIDAS.has(forma)) return forma;
    return MAPA_LEGADO[forma] || 'outro';
}

/**
 * Determina a forma_pagamento resumida para o cabeçalho da Venda.
 * - 1 forma distinta  → a própria forma
 * - 2+ formas distintas → 'misto'
 */
function formaResumida(pagamentos) {
    const formas = [...new Set(pagamentos.map(p => p.forma_pagamento))];
    return formas.length === 1 ? formas[0] : 'misto';
}

/* ─────────────────────────────────────────────────────────────────
   GET /admin/vendas/produtos?busca=TERMO
   Busca produtos ativos para o PDV.
   ─────────────────────────────────────────────────────────────── */
exports.buscarProdutos = async (req, res) => {
    try {
        const { busca } = req.query;
        const idEmpresa  = req.user.idEmpresa;

        const where = { idEmpresa, ativo: true };
        if (busca && busca.trim()) {
            where[Op.or] = [
                { descricao:  { [Op.like]: `%${busca.trim()}%` } },
                { codbarras:  { [Op.like]: `%${busca.trim()}%` } },
            ];
        }

        const produtos = await Produto.findAll({
            where,
            attributes: ['id', 'descricao', 'preco', 'estoque', 'codbarras', 'imagem'],
            limit: 30,
            order: [['descricao', 'ASC']],
        });

        return res.json({ data: produtos });
    } catch (err) {
        console.error('[buscarProdutos]', err);
        return res.status(500).json({ message: 'Erro ao buscar produtos' });
    }
};

/* ─────────────────────────────────────────────────────────────────
   POST /admin/vendas
   Payload esperado:
   {
     pagamentos: [
       { forma_pagamento: 'dinheiro', valor: 50.00 },
       { forma_pagamento: 'pix',      valor: 30.00 }
     ],
     desconto: 5.00,          // opcional, aplicado no cabeçalho
     itens: [
       { produto_id, quantidade, preco_unitario }
     ]
   }

   Compatibilidade legada: se vier "forma_pagamento" (string) em vez
   de "pagamentos" (array), cria automaticamente um único pagamento.
   ─────────────────────────────────────────────────────────────── */
exports.criar = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { desconto = 0, itens } = req.body;
        const idEmpresa  = req.user.idEmpresa;
        const usuario_id = req.user.id;

        /* ── Validação básica ── */
        if (!itens || !itens.length) {
            await t.rollback();
            return res.status(400).json({ message: 'Nenhum item informado' });
        }

        /* ── Normaliza pagamentos ────────────────────────────────
           Aceita o novo formato (array) ou o legado (string única).
           ────────────────────────────────────────────────────── */
        let pagamentosRaw = req.body.pagamentos;

        if (!pagamentosRaw || !pagamentosRaw.length) {
            // compatibilidade legada
            if (req.body.forma_pagamento) {
                pagamentosRaw = [{ forma_pagamento: req.body.forma_pagamento, valor: null }];
            } else {
                await t.rollback();
                return res.status(400).json({ message: 'Informe ao menos uma forma de pagamento' });
            }
        }

        /* ── Totais ── */
        const total      = itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0);
        const totalFinal = Math.max(0, total - parseFloat(desconto));

        /* ── Ajusta valor dos pagamentos quando não informado ────
           Se vier valor null/0 (legado) ou quando há apenas 1 forma,
           assume o total_final como valor pago.
           ────────────────────────────────────────────────────── */
        const somaPagamentos = pagamentosRaw.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);
        const pagamentosNorm = pagamentosRaw.map((p, idx) => ({
            forma_pagamento: normalizarForma(p.forma_pagamento),
            valor:           parseFloat(p.valor) || (somaPagamentos === 0 ? totalFinal : 0),
            desconto:        parseFloat(p.desconto) || 0,
            juros:           parseFloat(p.juros)    || 0,
            parcela:         p.parcela        || 1,
            total_parcelas:  p.total_parcelas  || 1,
            origem:          p.origem          || 'pdv',
            observacao:      p.observacao      || null,
        }));

        const somaFinal    = pagamentosNorm.reduce((s, p) => s + p.valor, 0);
        const statusPagamento = somaFinal >= totalFinal ? 'pago' : 'pendente';

        /* ── Cria cabeçalho da venda ── */
        const venda = await Venda.create({
            idEmpresa,
            usuario_id,
            total,
            desconto,
            total_final:      totalFinal,
            forma_pagamento:  formaResumida(pagamentosNorm),
            status_pagamento: statusPagamento,
        }, { transaction: t });

        /* ── Cria itens + movimenta estoque ── */
        for (const item of itens) {
            const subtotal = item.preco_unitario * item.quantidade;

            await VendaItem.create({
                venda_id:       venda.id,
                produto_id:     item.produto_id,
                quantidade:     item.quantidade,
                preco_unitario: item.preco_unitario,
                subtotal,
            }, { transaction: t });

            const produto = await Produto.findOne({
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
                lock: true,
            });

            if (produto) {
                const qtdAnterior = parseFloat(produto.estoque) || 0;
                const quantidade  = parseFloat(item.quantidade);
                const qtdFinal    = Math.max(0, qtdAnterior - quantidade);

                await produto.update({ estoque: qtdFinal }, { transaction: t });

                await MovtoEstoque.create({
                    empresa_id:     idEmpresa,
                    produto_id:     item.produto_id,
                    documento_id:   venda.id,
                    tipo_documento: 'VENDA',
                    ent_sai:        'S',
                    qtd_anterior:   qtdAnterior,
                    quantidade,
                    qtd_final:      qtdFinal,
                    usuario_id,
                }, { transaction: t });
            }
        }

        /* ── Cria registros de pagamento ── */
        let saldoAcumulado = totalFinal;

        for (const pag of pagamentosNorm) {
            saldoAcumulado = Math.max(0, saldoAcumulado - pag.valor);

            await Pagamento.create({
                venda_id:        venda.id,
                usuario_id,
                forma_pagamento: pag.forma_pagamento,
                valor:           pag.valor,
                desconto:        pag.desconto,
                juros:           pag.juros,
                saldo:           saldoAcumulado,
                parcela:         pag.parcela,
                total_parcelas:  pag.total_parcelas,
                origem:          pag.origem,
                observacao:      pag.observacao,
                data_recebimento: new Date(),
            }, { transaction: t });
        }

        await t.commit();

        return res.status(201).json({
            data: {
                id:              venda.id,
                total_final:     totalFinal,
                status_pagamento: statusPagamento,
                formas:          pagamentosNorm.map(p => p.forma_pagamento),
            },
        });

    } catch (err) {
        await t.rollback();
        console.error('[vendaController.criar]', err);
        return res.status(500).json({ message: 'Erro ao registrar venda' });
    }
};

/* ─────────────────────────────────────────────────────────────────
   GET /admin/fechamento/dados?data=YYYY-MM-DD
   Retorna vendas do dia + pagamentos para o fechamento de caixa.
   ─────────────────────────────────────────────────────────────── */

exports.fechamento = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const data = req.query.data || new Date().toISOString().slice(0, 10);
 
        const inicio = new Date(data + 'T00:00:00');
        const fim    = new Date(data + 'T23:59:59');
 
        const vendas = await Venda.findAll({
            where: {
                idEmpresa,
                createdAt: { [Op.between]: [inicio, fim] },
            },
            include: [
                {
                    model: VendaItem,
                    as: 'Itens',
                    include: [{ model: Produto, as: 'Produto', attributes: ['descricao'] }],
                },
                {
                    model: Pagamento,
                    as: 'Pagamentos',
                    attributes: ['id', 'forma_pagamento', 'valor', 'saldo', 'desconto', 'juros', 'origem', 'createdAt'],
                },
            ],
            order: [['createdAt', 'DESC']],
        });
 
        const despesas = await Despesa.findAll({
            where: {
                idEmpresa,
                createdAt: { [Op.between]: [inicio, fim] },
            },
            order: [['createdAt', 'DESC']],
        });
 
        const totalDespesas = despesas.reduce((s, d) => s + parseFloat(d.valor || 0), 0);
 
        return res.json({
            data:          vendas,
            despesas:      despesas,
            totalDespesas: totalDespesas.toFixed(2),
        });
 
    } catch (err) {
        console.error('[vendaController.fechamento]', err);
        return res.status(500).json({ message: 'Erro ao buscar fechamento' });
    }
};

/* ─────────────────────────────────────────────────────────────────
   PATCH /admin/vendas/:id/cancelar
   Cancela a venda, estorna estoque e cria pagamentos de estorno.
   ─────────────────────────────────────────────────────────────── */
exports.cancelar = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const idEmpresa  = req.user.idEmpresa;
        const { id }     = req.params;

        const venda = await Venda.findOne({
            where: { id, idEmpresa },
            include: [
                { model: VendaItem, as: 'Itens' },
                { model: Pagamento, as: 'Pagamentos' },
            ],
        });

        if (!venda) {
            await t.rollback();
            return res.status(404).json({ message: 'Venda não encontrada' });
        }

        if (venda.status_pagamento === 'cancelado') {
            await t.rollback();
            return res.status(400).json({ message: 'Venda já cancelada' });
        }

        /* ── Estorna estoque ── */
        for (const item of venda.Itens) {
            const produto = await Produto.findOne({
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
                lock: true,
            });
            if (!produto) continue;

            const qtdAnterior = parseFloat(produto.estoque) || 0;
            const quantidade  = parseFloat(item.quantidade);
            const qtdFinal    = qtdAnterior + quantidade;

            await produto.update({ estoque: qtdFinal }, { transaction: t });

            await MovtoEstoque.create({
                empresa_id:     idEmpresa,
                produto_id:     item.produto_id,
                documento_id:   venda.id,
                tipo_documento: 'ESTORNO_VENDA',
                ent_sai:        'E',
                qtd_anterior:   qtdAnterior,
                quantidade,
                qtd_final:      qtdFinal,
                usuario_id:     req.user.id,
            }, { transaction: t });
        }

        /* ── Cria pagamentos de estorno (um por pagamento original) ── */
        for (const pag of venda.Pagamentos) {
            await Pagamento.create({
                venda_id:        venda.id,
                usuario_id:      req.user.id,
                forma_pagamento: pag.forma_pagamento,
                valor:           -Math.abs(parseFloat(pag.valor)),  // valor negativo = devolução
                desconto:        0,
                juros:           0,
                saldo:           0,
                parcela:         pag.parcela,
                total_parcelas:  pag.total_parcelas,
                origem:          'estorno',
                observacao:      `Estorno da venda #${venda.id}`,
                data_recebimento: new Date(),
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

/* ─────────────────────────────────────────────────────────────────
   GET /admin/vendas/:id/pagamentos
   Lista os pagamentos de uma venda específica.
   ─────────────────────────────────────────────────────────────── */
exports.listarPagamentos = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const { id }    = req.params;

        const venda = await Venda.findOne({ where: { id, idEmpresa } });
        if (!venda) return res.status(404).json({ message: 'Venda não encontrada' });

        const pagamentos = await Pagamento.findAll({
            where: { venda_id: id },
            order: [['createdAt', 'ASC']],
        });

        return res.json({ data: pagamentos });
    } catch (err) {
        console.error('[listarPagamentos]', err);
        return res.status(500).json({ message: 'Erro ao listar pagamentos' });
    }
};

/* ─────────────────────────────────────────────────────────────────
   Renders (sem alteração de lógica)
   ─────────────────────────────────────────────────────────────── */
exports.viewFechamento      = (req, res) => res.render('fechamento_caixa');
exports.viewDashboardVendas = (req, res) => res.render('dashboard_vendas');

/* ─────────────────────────────────────────────────────────────────
   GET /admin/dashboard/vendas/dados?inicio=&fim=
   Analytics — agora usa a tabela Pagamentos para valores reais.
   ─────────────────────────────────────────────────────────────── */
exports.dashboardVendas = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const fim    = req.query.fim    ? new Date(req.query.fim    + 'T23:59:59') : new Date();
        const inicio = req.query.inicio ? new Date(req.query.inicio + 'T00:00:00')
                                        : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

        const vendas = await Venda.findAll({
            where: {
                idEmpresa,
                status_pagamento: { [Op.ne]: 'cancelado' },
                createdAt: { [Op.between]: [inicio, fim] },
            },
            include: [
                {
                    model: VendaItem,
                    as: 'Itens',
                    include: [{ model: Produto, as: 'Produto', attributes: ['descricao'] }],
                },
                {
                    model: Pagamento,
                    as: 'Pagamentos',
                    attributes: ['forma_pagamento', 'valor', 'origem'],
                },
            ],
            order: [['createdAt', 'ASC']],
        });

        const lista = vendas.map(v => v.get({ plain: true }));

        /* ── KPIs ── */
        const totalVendas      = lista.length;
        const faturamentoTotal = lista.reduce((s, v) => s + parseFloat(v.total_final || 0), 0);
        const totalDesconto    = lista.reduce((s, v) => s + parseFloat(v.desconto    || 0), 0);
        const ticketMedio      = totalVendas > 0 ? faturamentoTotal / totalVendas : 0;

        /* ── Evolução diária ── */
        const evolucao = {};
        lista.forEach(v => {
            const d   = new Date(v.createdAt);
            const dia = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if (!evolucao[dia]) evolucao[dia] = { faturamento: 0, quantidade: 0 };
            evolucao[dia].faturamento += parseFloat(v.total_final || 0);
            evolucao[dia].quantidade  += 1;
        });

        /* ── Formas de pagamento — agora lê de Pagamentos ── */
        const formasPagamento = {};
        lista.forEach(v => {
            (v.Pagamentos || []).forEach(p => {
                if (p.origem === 'estorno') return; // ignora estornos nas estatísticas
                const forma = p.forma_pagamento || 'outro';
                if (!formasPagamento[forma]) formasPagamento[forma] = { count: 0, valor: 0 };
                formasPagamento[forma].count += 1;
                formasPagamento[forma].valor += parseFloat(p.valor || 0);
            });
        });

        /* ── Top produtos ── */
        const produtosMap = {};
        lista.forEach(v => {
            (v.Itens || []).forEach(item => {
                const nome = item.Produto?.descricao || `Produto #${item.produto_id}`;
                if (!produtosMap[nome]) produtosMap[nome] = { quantidade: 0, faturamento: 0 };
                produtosMap[nome].quantidade  += parseFloat(item.quantidade || 0);
                produtosMap[nome].faturamento += parseFloat(item.subtotal   || 0);
            });
        });
        const topProdutos = Object.entries(produtosMap)
            .sort((a, b) => b[1].faturamento - a[1].faturamento)
            .slice(0, 10)
            .map(([nome, d]) => ({ nome, ...d }));

        return res.json({
            periodo: {
                inicio: inicio.toISOString().split('T')[0],
                fim:    fim.toISOString().split('T')[0],
            },
            kpis: {
                totalVendas,
                faturamentoTotal: faturamentoTotal.toFixed(2),
                ticketMedio:      ticketMedio.toFixed(2),
                totalDesconto:    totalDesconto.toFixed(2),
                topProduto:       topProdutos[0] || null,
            },
            evolucao,
            formasPagamento,
            topProdutos,
        });

    } catch (err) {
        console.error('[dashboardVendas]', err);
        return res.status(500).json({ erro: err.message });
    }
};