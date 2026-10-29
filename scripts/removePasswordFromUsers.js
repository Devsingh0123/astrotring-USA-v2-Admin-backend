import { connectDB, sequelize } from '../config/db.js';

async function removePasswordFromUsers() {
  try {
    await connectDB();
    console.log('--- Step 1: Checking `password` in `admins` table ---');
    const [adminCols] = await sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admins'
        AND COLUMN_NAME = 'password'
    `);

    if (adminCols.length === 0) {
      console.log('Adding missing `password` column to `admins` table...');
      await sequelize.query(`
        ALTER TABLE \`admins\`
        ADD COLUMN \`password\` VARCHAR(255) NOT NULL AFTER \`email\`;
      `);
      console.log('✓ Added `password` column to `admins`.');
    } else {
      console.log('✓ Verified: `password` column exists in `admins` table:', adminCols[0]);
    }

    console.log('\n--- Step 2: Checking `password` in `users` table ---');
    const [userCols] = await sequelize.query(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'password'
    `);

    if (userCols.length > 0) {
      console.log('Dropping `password` column from `users` table...');
      await sequelize.query(`
        ALTER TABLE \`users\`
        DROP COLUMN \`password\`;
      `);
      console.log('✓ Successfully dropped `password` column from `users` table.');
    } else {
      console.log('ℹ `password` column already absent from `users` table.');
    }

    console.log('\n--- Step 3: Verifying updated `users` table columns ---');
    const [updatedUserCols] = await sequelize.query(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('Current `users` columns:', updatedUserCols.map(c => c.COLUMN_NAME).join(', '));

    console.log('\n=============================================');
    console.log('Schema Update Complete!');
    console.log('=============================================\n');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    if (sequelize) {
      await sequelize.close();
    }
    process.exit(1);
  }
}

removePasswordFromUsers();
