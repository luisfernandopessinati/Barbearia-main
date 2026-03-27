// controllers/estoqueController.js
const { Op } = require('sequelize');
const sequelize  = require('../config/db');

const LancEstoque   = require('../models/LancEstoque');
const LancEstProduto = require('../models/lancEstProduto');
const MovtoEstoque  = require('../models/MovtoEstoque');
const Produto       = require('../models/produto');

/* ─────────────────────────────────────────────
   Associações locais (caso não estejam no app.js)
───────────────────────────────────────────── */
if (!LancEstoque.associations.Itens) {
    LancEstoque.hasMany(LancEstProduto, { foreignKey: 'lancamento_id', as: 'Itens' });
    LancEstProduto.belongsTo(LancEstoque, { foreignKey: 'lancamento_id' });
    LancEstProduto.belongsTo(Produto,     { foreignKey: 'produto_id', as: 'Produto' });
}

/* ─────────────────────────────────────────────
   GET /admin/estoque
   Página do PDV de estoque
───────────────────────────────────────────── */
exports.view = (req, res) => {
    res.render('estoque');
};

/* ─────────────────────────────────────────────
   GET /admin/estoque/produtos?busca=TERMO
   Busca produtos para o lançamento
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
        console.error('[estoqueController.buscarProdutos]', err);
        return res.status(500).json({ message: 'Erro ao buscar produtos' });
    }
};

/* ─────────────────────────────────────────────
   POST /admin/estoque
   Finaliza o lançamento:
   - Cria LancEstoque
   - Cria LancEstProduto para cada item
   - Atualiza estoque do produto
   - Grava MovtoEstoque para rastreabilidade
───────────────────────────────────────────── */
exports.criar = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { tipo, observacao, itens } = req.body;
        const idEmpresa  = req.user.idEmpresa;
        const usuario_id = req.user.id;

        if (!itens || !itens.length) {
            await t.rollback();
            return res.status(400).json({ message: 'Nenhum item informado' });
        }

        if (!['E', 'S', 'A'].includes(tipo)) {
            await t.rollback();
            return res.status(400).json({ message: 'Tipo inválido' });
        }

        // Cria o cabeçalho do lançamento
        const lanc = await LancEstoque.create({
            empresa_id: idEmpresa,
            usuario_id,
            tipo,
            status: 'F', // Finalizado direto
            observacao: observacao || null,
        }, { transaction: t });

        // Processa cada item
        for (const item of itens) {
            const produto = await Produto.findOne({
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
                lock: true,
            });

            if (!produto) continue;

            const qtdAnterior = parseFloat(produto.estoque) || 0;
            const quantidade  = parseFloat(item.quantidade);
            const entSai      = tipo === 'S' ? 'S' : 'E'; // Ajuste conta como Entrada
            const qtdFinal    = entSai === 'E'
                ? qtdAnterior + quantidade
                : Math.max(0, qtdAnterior - quantidade);

            // Item do lançamento
            await LancEstProduto.create({
                lancamento_id: lanc.id,
                produto_id:    item.produto_id,
                quantidade,
            }, { transaction: t });

            // Movimentação rastreável
            await MovtoEstoque.create({
                empresa_id:    idEmpresa,
                produto_id:    item.produto_id,
                documento_id:  lanc.id,
                tipo_documento: tipo === 'E' ? 'ENTRADA_MANUAL' : tipo === 'S' ? 'AJUSTE' : 'AJUSTE',
                ent_sai:       entSai,
                qtd_anterior:  qtdAnterior,
                quantidade,
                qtd_final:     qtdFinal,
                usuario_id,
            }, { transaction: t });

            // Atualiza estoque
            await produto.update({ estoque: qtdFinal }, { transaction: t });
        }

        await t.commit();
        return res.status(201).json({ data: { id: lanc.id } });

    } catch (err) {
        await t.rollback();
        console.error('[estoqueController.criar]', err);
        return res.status(500).json({ message: 'Erro ao registrar lançamento' });
    }
};

/* ─────────────────────────────────────────────
   GET /admin/estoque/consulta/dados?data=YYYY-MM-DD
   Retorna lançamentos do dia com seus itens
───────────────────────────────────────────── */
exports.consultaDados = async (req, res) => {
    try {
        const idEmpresa = req.user.idEmpresa;
        const data      = req.query.data || new Date().toISOString().slice(0, 10);

        const inicio = new Date(data + 'T00:00:00');
        const fim    = new Date(data + 'T23:59:59');

        const lancamentos = await LancEstoque.findAll({
            where: {
                empresa_id: idEmpresa,
                data: { [Op.between]: [inicio, fim] },
            },
            include: [{
                model: LancEstProduto,
                as:    'Itens',
                include: [{ model: Produto, as: 'Produto', attributes: ['descricao'] }],
            }],
            order: [['data', 'DESC']],
        });

        return res.json({ data: lancamentos });
    } catch (err) {
        console.error('[estoqueController.consultaDados]', err);
        return res.status(500).json({ message: 'Erro ao buscar lançamentos' });
    }
};

/* ─────────────────────────────────────────────
   PATCH /admin/estoque/:id/cancelar
   Cancela o lançamento e estorna o estoque
───────────────────────────────────────────── */
exports.cancelar = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const idEmpresa = req.user.idEmpresa;
        const { id }    = req.params;

        const lanc = await LancEstoque.findOne({
            where:   { id, empresa_id: idEmpresa },
            include: [{ model: LancEstProduto, as: 'Itens' }],
        });

        if (!lanc) {
            await t.rollback();
            return res.status(404).json({ message: 'Lançamento não encontrado' });
        }

        if (lanc.status === 'C') {
            await t.rollback();
            return res.status(400).json({ message: 'Lançamento já cancelado' });
        }

        // Estorna o estoque de cada item
        for (const item of lanc.Itens) {
            const produto = await Produto.findOne({
                where: { id: item.produto_id, idEmpresa },
                transaction: t,
                lock: true,
            });
            if (!produto) continue;

            const qtdAnterior = parseFloat(produto.estoque) || 0;
            const quantidade  = parseFloat(item.quantidade);

            // Inverte: se foi Entrada, estorna subtraindo; se Saída, estorna somando
            const entSaiEstorno = lanc.tipo === 'S' ? 'E' : 'S';
            const qtdFinal = lanc.tipo === 'S'
                ? qtdAnterior + quantidade
                : Math.max(0, qtdAnterior - quantidade);

            await MovtoEstoque.create({
                empresa_id:    idEmpresa,
                produto_id:    item.produto_id,
                documento_id:  lanc.id,
                tipo_documento: 'AJUSTE',
                ent_sai:       entSaiEstorno,
                qtd_anterior:  qtdAnterior,
                quantidade,
                qtd_final:     qtdFinal,
                usuario_id:    req.user.id,
            }, { transaction: t });

            await produto.update({ estoque: qtdFinal }, { transaction: t });
        }

        await lanc.update({ status: 'C' }, { transaction: t });
        await t.commit();

        return res.json({ message: 'Lançamento cancelado e estoque estornado' });
    } catch (err) {
        await t.rollback();
        console.error('[estoqueController.cancelar]', err);
        return res.status(500).json({ message: 'Erro ao cancelar lançamento' });
    }
};