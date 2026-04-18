const { Op } = require('sequelize');
const Produto = require('../models/produto');

const produtoController = {

    // Listar produtos
    async listar(req, res) {
        try {
            const { busca, formato } = req.query;
            const idEmpresa = req.user.idEmpresa;

            const where = { idEmpresa };

            if (busca && busca.trim()) {
                where[Op.or] = [
                    { descricao: { [Op.like]: `%${busca.trim()}%` } },
                    { codbarras: { [Op.like]: `%${busca.trim()}%` } },
                ];
            }

            const raw = await Produto.findAll({ where, order: [['descricao', 'ASC']], raw: true });
            const produtos = raw;

            // Calcula stats para a view
            const totalProdutos  = produtos.length;
            const totalAtivos    = produtos.filter(p => p.ativo).length;
            const estoqueBaixo   = produtos.filter(p => p.estoque < 5).length;

            if (formato === 'json') {
                return res.json({ data: produtos });
            }

            return res.render('produtos', { produtos, totalProdutos, totalAtivos, estoqueBaixo });
        } catch (error) {
            console.error('Erro ao listar produtos:', error);
            res.status(500).send('Erro ao listar produtos');
        }
    },

    // Criar produto
    async criar(req, res) {
        try {
            const { descricao, grupo, custo, preco, estoque, est_min, ativo, codbarras } = req.body;
            const idEmpresa = req.user.idEmpresa;

            let imagem = null;
            if (req.file) {
                imagem = `/uploads/fotos/${idEmpresa}/` + req.file.filename; // ← alterado
            }

            await Produto.create({
                idEmpresa,
                descricao,
                grupo,
                custo:     custo    || null,
                preco,
                estoque:   estoque  || 0,
                codbarras: codbarras || null,
                est_min:   est_min   || 0,
                ativo:     ativo ? true : false,
                imagem
            });

            res.redirect('/admin/produtos');
        } catch (error) {
            console.error('Erro ao criar produto:', error);
            res.status(500).send('Erro ao salvar produto');
        }
    },

    // Excluir produto
    async excluir(req, res) {
        try {
            const { id }    = req.params;
            const idEmpresa = req.user.idEmpresa;
            await Produto.destroy({ where: { id, idEmpresa } });
            res.redirect('/admin/produtos');
        } catch (error) {
            console.error('Erro ao excluir:', error);
            res.status(500).send('Erro ao excluir');
        }
    },

    // Editar produto
    async editar(req, res) {
        try {
            const { id }     = req.params;
            const { descricao, grupo, custo, preco, estoque, est_min, ativo, codbarras } = req.body;
            const idEmpresa  = req.user.idEmpresa;

            const dados = {
                descricao,
                grupo,
                custo:     custo    || null,
                preco,
                estoque:   estoque  || 0,
                codbarras: codbarras || null,
                est_min:   est_min   || 0,
                ativo:     ativo ? true : false,
            };

            if (req.file) {
                dados.imagem = `/uploads/fotos/${idEmpresa}/` + req.file.filename;
            }

            await Produto.update(dados, { where: { id, idEmpresa } });
            res.redirect('/admin/produtos');
        } catch (error) {
            console.error('Erro ao editar produto:', error);
            res.status(500).send('Erro ao editar produto');
        }
    }
};

module.exports = produtoController;