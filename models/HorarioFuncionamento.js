const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const HorarioFuncionamento = sequelize.define('HorariosFuncionamento', {
    profissional_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    dia_semana: {
        type: DataTypes.TINYINT,
        allowNull: false,
        comment: '0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab'
    },
    hora_inicio: {
        type: DataTypes.TIME,
        allowNull: false
    },
    hora_fim: {
        type: DataTypes.TIME,
        allowNull: false
    },
    ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

 HorarioFuncionamento.sync({ alter: true }); // rodar uma vez
module.exports = HorarioFuncionamento;