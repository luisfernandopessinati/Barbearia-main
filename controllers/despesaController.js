// controllers/despesaController.js
const { Op } = require('sequelize');
const Despesa = require('../models/Despesa');

/* ─────────────────────────────────────────────────────────────────
   POST /admin/despesas
   Cria um lançamento de despesa/saída de caixa.
   Body: { categoria, descricao, valor, forma_pagamento, observacao? }
   ─────────────────────────────────────────────────────────────── */
exports.criar = async (req, res) => {
    try {
        const { categoria, descricao, valor, forma_pagamento, observacao } = req.body;
        const idEmpresa  = req.user.idEmpresa;
        const usuario_id = req.user.id;

        if (!descricao || !descricao.trim()) {
            return res.status(400).json({ message: 'Informe a descrição da despesa' });
        }
        if (!valor || parseFloat(valor) <= 0) {
            return res.status(400).json({ message: 'Informe um valor válido' });
        }

        const despesa = await Despesa.create({
            idEmpresa,
            usuario_id,
            categoria:       categoria       || 'outros',
            descricao:       descricao.trim(),
            valor:           parseFloat(parseFloat(valor).toFixed(2)),
            forma_pagamento: forma_pagamento || 'dinheiro',
            observacao:      observacao      || null,
        });

        return res.status(201).json({ data: despesa });
    } catch (err) {
        console.error('[despesaController.criar]', err);
        return res.status(500).json({ message: 'Erro ao registrar despesa' });
    }
};

/* ─────────────────────────────────────────────────────────────────
   GET /admin/despesas?data=YYYY-MM-DD
   Lista despesas de um dia específico (default: hoje).
   Usado pelo fechamento de caixa.
   ─────────────────────────────────────────────────────────────── */
exports.listar = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const data = req.query.data || new Date().toISOString().slice(0, 10);

        const inicio = new Date(data + 'T00:00:00');
        const fim    = new Date(data + 'T23:59:59');

        const despesas = await Despesa.findAll({
            where: {
                idEmpresa,
                createdAt: { [Op.between]: [inicio, fim] },
            },
            order: [['createdAt', 'DESC']],
        });

        const total = despesas.reduce((s, d) => s + parseFloat(d.valor || 0), 0);

        return res.json({
            data:  despesas,
            total: total.toFixed(2),
        });
    } catch (err) {
        console.error('[despesaController.listar]', err);
        return res.status(500).json({ message: 'Erro ao listar despesas' });
    }
};

/* ─────────────────────────────────────────────────────────────────
   DELETE /admin/despesas/:id
   Remove uma despesa (apenas do mesmo dia para evitar inconsistências).
   ─────────────────────────────────────────────────────────────── */
exports.remover = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const { id }    = req.params;

        const despesa = await Despesa.findOne({ where: { id, idEmpresa } });
        if (!despesa) {
            return res.status(404).json({ message: 'Despesa não encontrada' });
        }

        await despesa.destroy();
        return res.json({ message: 'Despesa removida com sucesso' });
    } catch (err) {
        console.error('[despesaController.remover]', err);
        return res.status(500).json({ message: 'Erro ao remover despesa' });
    }
};
