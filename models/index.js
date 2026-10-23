import { User } from './User.js';
import { Order } from './Order.js';
import { ChatThread } from './ChatThread.js';
import { BirthDetail } from './BirthDetail.js';

// User <-> Order
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> ChatThread
User.hasMany(ChatThread, { foreignKey: 'user_id', as: 'chat_threads' });
ChatThread.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> BirthDetail
User.hasMany(BirthDetail, { foreignKey: 'user_id', as: 'birth_details' });
BirthDetail.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export {
  User,
  Order,
  ChatThread,
  BirthDetail
};
