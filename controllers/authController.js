const jwt = require('jsonwebtoken');
const Empresa = require('../models/Empresa');
const bcrypt = require('bcrypt');

exports.login = async (req, res) => {
    const { email, senha } = req.body;

    try {
        const empresa = await Empresa.findOne({ where: { email } });

        if (!empresa) {
            return res.status(401).json({ erro: 'Empresa não encontrada' });
        }

        const senhaValida = await bcrypt.compare(senha, empresa.senha);

        if (!senhaValida) {
            return res.status(401).json({ erro: 'Senha inválida' });
        }

        const token = jwt.sign(
            { id: empresa.id },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token });

    } catch (error) {
        res.status(500).json({ erro: 'Erro no login' });
    }
};