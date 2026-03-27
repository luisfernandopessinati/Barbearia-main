const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // ✅ 1. Se veio token → valida JWT
    if (authHeader) {
        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = decoded;
            return next();
        } catch (error) {
            return res.status(401).json({ erro: 'Token inválido' });
        }
    }

    // ✅ 2. Se NÃO veio token → tenta sessão (SaaS)
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    }

    // ❌ 3. Nada válido
    return res.status(401).json({ erro: 'Não autorizado' });
};