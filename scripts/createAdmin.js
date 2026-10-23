import readline from 'readline';
import { User } from '../models/index.js';
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

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      await existingUser.update({
        role: 'admin',
        password: hashedPassword,
        is_blocked: false,
        is_email_verified: true,
        onboarding_completed: true
      });
      console.log(`\nSuccess: Existing user "${email}" updated to admin role with new password.`);
    } else {
      const newUser = await User.create({
        email,
        password: hashedPassword,
        role: 'admin',
        is_email_verified: true,
        onboarding_completed: true,
        is_blocked: false,
        credit_balance: 100
      });
      console.log(`\nSuccess: Created new admin user: ${newUser.email} (ID: ${newUser.id})`);
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
