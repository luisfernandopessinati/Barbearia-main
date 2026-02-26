const bcrypt = require('bcryptjs');
const localStrategy = require('passport-local').Strategy;
const Admin = require('../models/Admin');
const Empresa = require('../models/Empresas'); // 👈 importa o model

module.exports = function (passport) {
    passport.use('admin-local', new localStrategy({
        usernameField: 'email',
        passwordField: 'senha',
    }, async (email, senha, done) => {
        try {
            // 1. Busca o admin pelo email (já é chave única)
            const user = await Admin.findOne({ where: { email } });

            if (!user) {
                return done(null, false, { message: 'Usuário não encontrado.' });
            }

            // 2. Valida a senha
            const isValidPassword = await bcrypt.compare(senha, user.senha);
            if (!isValidPassword) {
                return done(null, false, { message: 'Senha incorreta.' });
            }

            return done(null, user); // user já tem idEmpresa dentro dele
        } catch (error) {
            return done(error, false);
        }
    }));

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await Admin.findByPk(id);
            done(null, user);
        } catch (error) {
            done(null, false);
        }
    });
};