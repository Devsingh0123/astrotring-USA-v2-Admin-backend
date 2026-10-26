import { User } from './User.js';
import { Order } from './Order.js';
import { Invoice } from './Invoice.js';
import { Coupon } from './Coupon.js';
import { ChatThread } from './ChatThread.js';
import { BirthDetail } from './BirthDetail.js';
import { QuestionPack } from './QuestionPack.js';
import { ReportPack } from './ReportPack.js';
import { Blog } from './Blog.js';

// User <-> Order
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Invoice
User.hasMany(Invoice, { foreignKey: 'user_id', as: 'invoices' });
Invoice.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Order <-> Invoice
Order.hasOne(Invoice, { foreignKey: 'order_id', as: 'invoice' });
Invoice.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// User <-> ChatThread
User.hasMany(ChatThread, { foreignKey: 'user_id', as: 'chat_threads' });
ChatThread.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> BirthDetail
User.hasMany(BirthDetail, { foreignKey: 'user_id', as: 'birth_details' });
BirthDetail.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Blog
User.hasMany(Blog, { foreignKey: 'author_id', as: 'blogs' });
Blog.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

export {
  User,
  Order,
  Invoice,
  Coupon,
  ChatThread,
  BirthDetail,
  QuestionPack,
  ReportPack,
  Blog
};
