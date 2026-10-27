import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * ChatThread Model (`chat_threads` table)
 * Shared with backend service for monitoring AI conversations.
 */
export const ChatThread = sequelize.define('ChatThread', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  chart_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  engine: {
    type: DataTypes.ENUM('jyotish', 'shastra'),
    allowNull: false,
    defaultValue: 'jyotish'
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  }
}, {
  tableName: 'chat_threads',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['chart_id'] },
    { fields: ['engine'] }
  ]
});
