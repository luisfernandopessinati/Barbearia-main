// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ erro: 'Token não enviado' });
    }

    // Espera o header no formato:  Authorization: Bearer <token>
    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: 'Formato inválido — use: Bearer <token>' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // req.user estará disponível em todas as rotas protegidas com:
        // {
        //   id:        <id do admin/profissional>,
        //   idEmpresa: <id da empresa>,   ← isolamento multi-tenant
        //   nome:      <nome do usuário>,
        //   role:      <'admin' | ...>
        // }
        req.user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }
};