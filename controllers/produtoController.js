const Produto = require('../models/Produto');

const produtoController = {

    // 📌 Listar produtos (enviar para tela)
    async listar(req, res) {
        try {

            const idEmpresa = req.session.idEmpresa;

            const produtos = await Produto.findAll({
                where: { idEmpresa },
                order: [['createdAt', 'DESC']]
            });

            res.render('admin/produtos', {
                produtos: produtos.map(p => p.toJSON())
            });

        } catch (error) {
            console.error('Erro ao listar produtos:', error);
            res.status(500).send('Erro interno');
        }
    },


    // 📌 Criar produto
    async criar(req, res) {
        try {

            const { descricao, grupo, custo, preco, estoque, ativo } = req.body;

            const idEmpresa = req.session.idEmpresa;

            let imagem = null;
            if (req.file) {
                imagem = '/uploads/' + req.file.filename;
            }

            const novoProduto = await Produto.create({
                idEmpresa,
                descricao,
                grupo,
                custo,
                preco,
                estoque,
                ativo: ativo ? true : false,
                imagem
            });

            // Se for AJAX
            if (req.headers['content-type']?.includes('multipart/form-data')) {
                return res.json({
                    success: true,
                    produto: novoProduto
                });
            }

            res.redirect('/admin/produtos');

        } catch (error) {
            console.error('Erro ao criar produto:', error);
            res.status(500).send('Erro ao salvar produto');
        }
    },


    // 📌 Excluir produto
    async excluir(req, res) {
        try {

            const { id } = req.params;
            const idEmpresa = req.session.idEmpresa;

            await Produto.destroy({
                where: { id, idEmpresa }
            });

            res.redirect('/admin/produtos');

        } catch (error) {
            console.error('Erro ao excluir:', error);
            res.status(500).send('Erro ao excluir');
        }
    }

};

module.exports = produtoController;