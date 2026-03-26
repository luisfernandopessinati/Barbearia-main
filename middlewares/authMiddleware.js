const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ erro: 'Token não enviado' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 🔥 CORRETO
        req.user = decoded;

        next();
    } catch (error) {
        return res.status(401).json({ erro: 'Token inválido' });
    }
};
