import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  is_email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  onboarding_completed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    allowNull: false,
    defaultValue: 'user'
  },
  is_blocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  credit_balance: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  report_credits: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  tier: {
    type: DataTypes.ENUM('free', 'silver', 'gold', 'diamond'),
    allowNull: false,
    defaultValue: 'free'
  }
}, {
  tableName: 'users',
  timestamps: true,
  paranoid: true,
  underscored: true
});
