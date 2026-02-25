const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Produto = sequelize.define('Produtos', {

    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    descricao: {
        type: DataTypes.STRING,
        allowNull: false
    },

    grupo: {
        type: DataTypes.STRING,
        allowNull: true
    },

    custo: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },

    preco: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },

    estoque: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },

    imagem: {
        type: DataTypes.STRING,
        allowNull: true
    },

    ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }

}, {
    timestamps: true
});

// Produto.sync({ alter: true });

module.exports = Produto;