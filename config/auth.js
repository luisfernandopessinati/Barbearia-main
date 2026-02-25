const bcrypt = require('bcryptjs');
const localStrategy = require('passport-local').Strategy;
const Admin = require('../models/Admin');
const Empresa = require('../models/Empresas'); // 👈 importa o model

module.exports = function (passport) {
    passport.use('admin-local', new localStrategy({
        usernameField: 'email',
        passwordField: 'senha',
        passReqToCallback: true // 👈 permite acessar req (e o dominio)
    }, async (req, email, senha, done) => {
        try {
            const dominio = req.body.dominio || 'localhost';
            console.log('Domínio recebido:', dominio);

            // 1. Valida a empresa pelo domínio
            const empresa = await Empresa.findOne({ where: { dominio } });
            if (!empresa) {
                console.log('Empresa não encontrada para o domínio:', dominio);
                return done(null, false, { message: 'Empresa não encontrada.' });
            }

            console.log('Empresa encontrada:', empresa.id);

            // 2. Busca o admin dentro dessa empresa
            const user = await Admin.findOne({ 
                where: { email, idEmpresa: empresa.id } 
            });

            if (!user) {
                console.log('Usuário não encontrado:', email);
                return done(null, false, { message: 'Usuário não encontrado.' });
            }

            // 3. Valida a senha
            const isValidPassword = await bcrypt.compare(senha, user.senha);
            if (!isValidPassword) {
                return done(null, false, { message: 'Senha incorreta.' });
            }

            console.log('Autenticação bem-sucedida! Empresa:', empresa.idEmpresa);
            return done(null, user);

        } catch (error) {
            console.error('Erro durante a autenticação:', error);
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
            done(error, null);
        }
    });
};