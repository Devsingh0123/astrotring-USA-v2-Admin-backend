import { connectDB, sequelize } from '../config/db.js';

async function migrateAdmins() {
  try {
    await connectDB();
    console.log('\n--- Step 1: Creating/aligning `admins` table ---');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`admins\` (
        \`id\` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`password\` VARCHAR(255) NOT NULL,
        \`name\` VARCHAR(100) NOT NULL DEFAULT 'Administrator',
        \`role\` ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin',
        \`avatar_url\` VARCHAR(500) NULL,
        \`is_blocked\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`deleted_at\` DATETIME NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_admins_email\` (\`email\`),
        KEY \`idx_admins_role\` (\`role\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure `id` has binary collation matching blogs.author_id (utf8mb4_bin)
    await sequelize.query(`
      ALTER TABLE \`admins\`
      MODIFY COLUMN \`id\` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
    `);

    // Check if `password` column exists in `admins` table
    const [pwdCol] = await sequelize.query(`
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admins'
        AND COLUMN_NAME = 'password'
    `);

    if (pwdCol.length === 0) {
      console.log('Adding missing `password` column to `admins` table...');
      await sequelize.query(`
        ALTER TABLE \`admins\`
        ADD COLUMN \`password\` VARCHAR(255) NOT NULL DEFAULT '$2b$12$0XCzRebNJ032tbYDePQ./.bqPidXRDzZw9VjkcV5ujI8p/Ea.V/Pa'
        AFTER \`email\`;
      `);
      console.log('✓ Added `password` column to `admins`.');
    }

    console.log('✓ `admins` table verified with utf8mb4_bin primary key and password column.');

    console.log('\n--- Step 2: Syncing admin records and passwords ---');
    // If any admin record has placeholder or empty password, set to valid fallback bcrypt hash
    await sequelize.query(`
      UPDATE \`admins\`
      SET \`password\` = '$2b$12$0XCzRebNJ032tbYDePQ./.bqPidXRDzZw9VjkcV5ujI8p/Ea.V/Pa'
      WHERE \`password\` IS NULL OR \`password\` = '';
    `);
    console.log('✓ Verified admin account password hash.');

    console.log('\n--- Step 3: Updating foreign key on `blogs.author_id` ---');
    const [fkRows] = await sequelize.query(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'blogs'
        AND COLUMN_NAME = 'author_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    for (const fk of fkRows) {
      if (fk.REFERENCED_TABLE_NAME === 'users') {
        console.log(`Dropping old foreign key constraint "${fk.CONSTRAINT_NAME}" referencing \`users\`...`);
        await sequelize.query(`ALTER TABLE \`blogs\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
        console.log(`✓ Dropped foreign key "${fk.CONSTRAINT_NAME}".`);
      }
    }

    // Check if new foreign key referencing admins already exists
    const [updatedFkRows] = await sequelize.query(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'blogs'
        AND COLUMN_NAME = 'author_id'
        AND REFERENCED_TABLE_NAME = 'admins'
    `);

    if (updatedFkRows.length === 0) {
      console.log('Adding new foreign key constraint `fk_blogs_author` referencing `admins(id)`...');
      await sequelize.query(`
        ALTER TABLE \`blogs\`
        ADD CONSTRAINT \`fk_blogs_author\`
        FOREIGN KEY (\`author_id\`) REFERENCES \`admins\` (\`id\`)
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
      console.log('✓ Added foreign key `fk_blogs_author` referencing `admins(id)`.');
    } else {
      console.log('✓ Foreign key constraint referencing `admins` already verified.');
    }

    console.log('\n--- Step 4: Cleaning up admin records from `users` table ---');
    await sequelize.query(`DELETE FROM \`otps\` WHERE \`user_id\` = 'e80b9f82-356e-4353-a2e6-2a7e96564e4b'`);
    await sequelize.query(`DELETE FROM \`refresh_tokens\` WHERE \`user_id\` = 'e80b9f82-356e-4353-a2e6-2a7e96564e4b'`);
    await sequelize.query(`DELETE FROM \`users\` WHERE \`id\` = 'e80b9f82-356e-4353-a2e6-2a7e96564e4b' OR \`role\` = 'admin'`);
    console.log('✓ Cleaned any admin records from `users` table.');

    console.log('\n=============================================');
    console.log('Migration Complete: Admins decoupled successfully!');
    console.log('=============================================\n');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    if (sequelize) {
      await sequelize.close();
    }
    process.exit(1);
  }
}

migrateAdmins();
