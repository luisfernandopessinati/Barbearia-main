function isAdminAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/loginAdmin');
}

module.exports = { isAdminAuthenticated };

