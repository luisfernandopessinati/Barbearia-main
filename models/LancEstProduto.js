// models/lancEstProduto.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LancEstProduto = sequelize.define('LancEstProduto', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    lancamento_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    produto_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    quantidade: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false
    }
}, {
    tableName: 'lanc_est_produtos',
    timestamps: false
});

module.exports = LancEstProduto;