const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); 
const bcrypt = require('bcryptjs');

const Admin = sequelize.define('Admin', {
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true
        }
    },
    nome: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ativo: {
        type: DataTypes.STRING,
        allowNull: false
    },
    senha: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
    type: DataTypes.STRING,
    defaultValue: 'admin'
}
})

 Admin.sync({ force: true });
module.exports = Admin;
