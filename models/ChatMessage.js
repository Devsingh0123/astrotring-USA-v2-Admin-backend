import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * ChatMessage Model (`chat_messages` table)
 * Stores individual turns (user prompt or AI response) within a ChatThread.
 */
export const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  thread_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'chat_threads',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  structured_data: {
    type: DataTypes.JSON,
    allowNull: true
  },
  feedback: {
    type: DataTypes.ENUM('yes', 'no'),
    allowNull: true,
    defaultValue: null
  },
  tokens_used: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  credits_debited: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'chat_messages',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { fields: ['thread_id'] },
    { fields: ['role'] }
  ]
});
