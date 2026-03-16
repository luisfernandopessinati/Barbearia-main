const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = 'public/uploads/admins/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const nome = `admin-${req.params.id}-${Date.now()}${ext}`;
        cb(null, nome);
    }
});

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
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB — foto de perfil não precisa de 5MB
});