import readline from 'readline';
import { Admin } from '../models/index.js';
import { hashPassword } from '../utils/bcrypt.js';
import { connectDB, sequelize } from '../config/db.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const main = async () => {
  try {
    await connectDB();

    let email = process.argv[2];
    let password = process.argv[3];
    let name = process.argv[4];

    if (!email) {
      email = await askQuestion('Enter Admin Email: ');
    }
    if (!password) {
      password = await askQuestion('Enter Admin Password: ');
    }

    email = email?.trim().toLowerCase();
    password = password?.trim();

    if (!email || !password) {
      console.error('Error: Both email and password are required.');
      rl.close();
      process.exit(1);
    }

    const hashedPassword = await hashPassword(password);

    const existingAdmin = await Admin.findOne({ where: { email } });

    if (existingAdmin) {
      await existingAdmin.update({
        password: hashedPassword,
        name: name?.trim() || existingAdmin.name || 'Administrator',
        is_blocked: false
      });
      console.log(`\nSuccess: Existing admin "${email}" updated with new password.`);
    } else {
      const newAdmin = await Admin.create({
        email,
        password: hashedPassword,
        name: name?.trim() || 'Administrator',
        role: 'admin',
        is_blocked: false
      });
      console.log(`\nSuccess: Created new administrator: ${newAdmin.email} (ID: ${newAdmin.id})`);
    }

    rl.close();
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to create/update admin:', error.message);
    rl.close();
    process.exit(1);
  }
};

main();
