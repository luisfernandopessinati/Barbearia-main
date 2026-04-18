const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = 'public/uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let pasta = 'public/uploads/';

        if (req.route.path.includes('empresa') || file.fieldname === 'logo') {
            pasta = 'public/uploads/logos/';

        } else if (file.fieldname === 'imagem') {
            const empresaId = req.user?.idEmpresa;

            if (!empresaId) {
                return cb(new Error('Empresa não identificada para upload de imagem.'));
            }

            pasta = `public/uploads/fotos/${empresaId}/`;
        }

        if (!fs.existsSync(pasta)) {
            fs.mkdirSync(pasta, { recursive: true });
        }

        cb(null, pasta);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const nome = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
        cb(null, nome);
    }
});

const fileFilter = function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const extensoesPermitidas = ['.jpg', '.jpeg', '.png', '.webp'];

    if (!extensoesPermitidas.includes(ext)) {
        return cb(new Error('Formato de imagem não permitido.'));
    }
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Arquivo precisa ser uma imagem.'));
    }

    cb(null, true);
};

module.exports = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }
});