const Produto = require('../models/produto');

const produtoController = {

    // 📌 Listar produtos (enviar para tela)
    async listar(req, res) {
        try {
            const idEmpresa = req.user.idEmpresa;

            const produtos = await Produto.findAll({
                where: { idEmpresa },
                order: [['createdAt', 'DESC']]
            });

            const lista = produtos.map(p => p.toJSON());

            res.render('produtos', {
                produtos: lista,
                totalProdutos: lista.length,
                totalAtivos: lista.filter(p => p.ativo).length,
                estoqueBaixo: lista.filter(p => p.estoque < 5).length
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
            const idEmpresa = req.user.idEmpresa;

            let imagem = null;
            if (req.file) {
                imagem = '/uploads/' + req.file.filename;
            }

            await Produto.create({
                idEmpresa,
                descricao,
                grupo,
                custo,
                preco,
                estoque,
                ativo: ativo ? true : false,
                imagem
            });

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
            const idEmpresa = req.user.idEmpresa;

            await Produto.destroy({
                where: { id, idEmpresa }
            });

            res.redirect('/admin/produtos');

        } catch (error) {
            console.error('Erro ao excluir:', error);
            res.status(500).send('Erro ao excluir');
        }
    },
    // editar
    async editar(req, res) {
    try {
        const { id } = req.params;
        const { descricao, grupo, custo, preco, estoque, ativo } = req.body;
        const idEmpresa = req.user.idEmpresa;

        const dados = { descricao, grupo, custo, preco, estoque, ativo: ativo ? true : false };

        if (req.file) {
            dados.imagem = '/uploads/' + req.file.filename;
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