const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Pacote = sequelize.define('Pacote', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    servico_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cliente_nome: {
        type: DataTypes.STRING,
        allowNull: false
    },
    cliente_telefone: {
        type: DataTypes.STRING,
        allowNull: false
    },
    total_sessoes: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    sessoes_realizadas: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    pago: {
        type: DataTypes.TINYINT(1),
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('pendente', 'confirmado', 'cancelado'),
        defaultValue: 'pendente'
    }
}, {
    tableName: 'Pacotes',
    timestamps: true
});

module.exports = Pacote;