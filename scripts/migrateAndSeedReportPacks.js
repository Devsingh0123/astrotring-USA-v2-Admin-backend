import { v4 as uuidv4 } from 'uuid';
import { sequelize } from '../config/db.js';

const INITIAL_REPORT_PACKS = [
  {
    code: 'report_silver_1',
    name: 'Silver',
    title: 'Silver Report Pack (1 Report Credit)',
    tier: 'silver',
    credits: 1,
    prices: {
      INR: { originalPrice: 2999, offerPrice: 1999 },
      USD: { originalPrice: 29.99, offerPrice: 19.99 },
      GBP: { originalPrice: 24.99, offerPrice: 16.99 },
      EUR: { originalPrice: 27.99, offerPrice: 18.99 }
    },
    is_active: true,
    sort_order: 1
  },
  {
    code: 'report_gold_2',
    name: 'Gold',
    title: 'Gold Report Pack (2 Report Credits)',
    tier: 'gold',
    credits: 2,
    prices: {
      INR: { originalPrice: 5999, offerPrice: 2299 },
      USD: { originalPrice: 59.99, offerPrice: 24.99 },
      GBP: { originalPrice: 49.99, offerPrice: 20.99 },
      EUR: { originalPrice: 54.99, offerPrice: 22.99 }
    },
    is_active: true,
    sort_order: 2
  },
  {
    code: 'report_diamond_4',
    name: 'Diamond',
    title: 'Diamond Report Pack (4 Report Credits)',
    tier: 'diamond',
    credits: 4,
    prices: {
      INR: { originalPrice: 11999, offerPrice: 2499 },
      USD: { originalPrice: 99.99, offerPrice: 29.99 },
      GBP: { originalPrice: 79.99, offerPrice: 24.99 },
      EUR: { originalPrice: 89.99, offerPrice: 27.99 }
    },
    is_active: true,
    sort_order: 3
  }
];

export async function migrateAndSeedReportPacks() {
  try {
    await sequelize.authenticate();
    console.log('Connected to MySQL database.');

    // 1. Create table if not exists
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS report_packs (
        id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        title VARCHAR(150) NULL,
        tier ENUM('silver', 'gold', 'diamond', 'custom') NOT NULL DEFAULT 'silver',
        credits INT NOT NULL,
        prices JSON NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        deleted_at DATETIME NULL,
        PRIMARY KEY (id),
        INDEX idx_report_packs_code (code),
        INDEX idx_report_packs_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `;

    await sequelize.query(createTableQuery);
    console.log('Table `report_packs` verified / created.');

    // 2. Seed initial packs if not present
    for (const pack of INITIAL_REPORT_PACKS) {
      const [existing] = await sequelize.query(
        'SELECT id FROM report_packs WHERE code = ? LIMIT 1',
        { replacements: [pack.code] }
      );

      if (existing.length === 0) {
        const id = uuidv4();
        const now = new Date();
        await sequelize.query(
          `INSERT INTO report_packs 
            (id, code, name, title, tier, credits, prices, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          {
            replacements: [
              id,
              pack.code,
              pack.name,
              pack.title,
              pack.tier,
              pack.credits,
              JSON.stringify(pack.prices),
              pack.is_active,
              pack.sort_order,
              now,
              now
            ]
          }
        );
        console.log(`Seeded report pack: ${pack.code} (${pack.name})`);
      } else {
        console.log(`Report pack ${pack.code} already exists in DB. Skipping.`);
      }
    }

    console.log('Migration and seeding of report packs completed successfully.');
  } catch (error) {
    console.error('Error during report packs migration:', error);
    throw error;
  }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('migrateAndSeedReportPacks.js')) {
  migrateAndSeedReportPacks()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
