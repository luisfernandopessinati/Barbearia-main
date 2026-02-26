const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Garante que a pasta existe
const uploadDir = 'public/uploads/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const nome = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
        cb(null, nome);
    }
});

// Tipos permitidos
const tiposPermitidos = /jpeg|jpg|png|webp/;

const fileFilter = function (req, file, cb) {
    const extOk = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = tiposPermitidos.test(file.mimetype);

    if (extOk && mimeOk) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens JPG, PNG e WEBP são permitidas.'));
    }
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});