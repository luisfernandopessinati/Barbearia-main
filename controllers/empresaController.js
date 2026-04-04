const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const Empresa = require('../models/Empresas');
const Admin = require('../models/Admin');

function validarCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]/g, '');
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false;

    const calc = (cnpj, len) => {
        let sum = 0;
        let pos = len - 7;
        for (let i = len; i >= 1; i--) {
            sum += parseInt(cnpj.charAt(len - i)) * pos--;
            if (pos < 2) pos = 9;
        }
        return sum % 11 < 2 ? 0 : 11 - (sum % 11);
    };

    if (calc(cnpj, 12) !== parseInt(cnpj.charAt(12))) return false;
    if (calc(cnpj, 13) !== parseInt(cnpj.charAt(13))) return false;
    return true;
}

module.exports = {

    exibirCadastro: (req, res) => {
        res.render('cadastro');
    },

    cadastrar: async (req, res) => {
        const { nome, fantasia, cnpj, celular, endereco, numero, bairro, cidade, segmento, email, senha } = req.body;

        if (!email || !senha)
            return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });

        if (senha.length < 6)
            return res.status(400).json({ erro: 'A senha precisa ter no mínimo 6 caracteres.' });

        if (!validarCNPJ(cnpj))
            return res.status(400).json({ erro: 'CNPJ inválido.' });

        try {
            const cnpjLimpo = cnpj.replace(/[^\d]/g, '');
            const emailNormalizado = email.trim().toLowerCase();

            const cnpjExiste = await Empresa.findOne({ where: { cnpj: cnpjLimpo } });
            if (cnpjExiste) return res.status(409).json({ erro: 'CNPJ já cadastrado.' });

            const emailExiste = await Admin.findOne({ where: { email: emailNormalizado } });
            if (emailExiste) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

            const token_agendamento = crypto.randomBytes(16).toString('hex');
            const hashSenha = await bcrypt.hash(senha, 10);

            const empresa = await Empresa.create({
                nome, fantasia, cnpj: cnpjLimpo, celular,
                endereco, numero, bairro, cidade, segmento,
                ativo: 'S', token_agendamento
            });

            await Admin.create({
                nome: fantasia,
                email: emailNormalizado,
                senha: hashSenha,
                telefone: celular,
                idEmpresa: empresa.id,
                ativo: 'S',
                role: 'owner'
            });

            res.json({ sucesso: true });

        } catch (error) {
            res.status(500).json({ erro: 'Erro ao cadastrar: ' + error.message });
        }
    },

    // GET /api/empresa — retorna dados da empresa logada
    getDados: async (req, res) => {
        try {
            const empresa = await Empresa.findByPk(req.user.idEmpresa, {
                attributes: ['id', 'nome', 'fantasia', 'cnpj', 'celular',
                             'endereco', 'numero', 'bairro', 'cidade',
                             'segmento', 'observacao', 'logo', 'estilo']
            });

            if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada.' });

            res.json(empresa);
        } catch (error) {
            res.status(500).json({ erro: 'Erro ao buscar dados: ' + error.message });
        }
    },

    // PUT /api/empresa — atualiza dados + logo
    atualizarDados: async (req, res) => {
        try {   
            const empresa = await Empresa.findByPk(req.user.idEmpresa);
            if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada.' });

            const { nome, fantasia, celular, endereco, numero, bairro, cidade, segmento, observacao, estilo } = req.body;

            // Se veio um novo logo, apaga o anterior (se existir e não for externo)
            if (req.file && empresa.logo) {
                const logoAntigo = path.join(__dirname, '../public', empresa.logo);
                if (fs.existsSync(logoAntigo)) fs.unlinkSync(logoAntigo);
            }

            await empresa.update({
                nome,
                fantasia,
                celular,
                endereco,
                numero,
                bairro,
                cidade,
                segmento,
                observacao,
                estilo,
                ...(req.file && { logo: `/uploads/logos/${req.file.filename}` })
            });

            res.json({ sucesso: true, logo: empresa.logo });

        } catch (error) {
            res.status(500).json({ erro: 'Erro ao salvar: ' + error.message });
        }
    }
};
