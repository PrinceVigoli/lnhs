import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';

const database = process.env.DB_NAME || 'luna_enrollment';
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  multipleStatements: true
});

await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await connection.query(`USE \`${database}\``);
await connection.query(await fs.readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
await connection.query("ALTER TABLE users MODIFY role ENUM('student','teacher','registrar','admin') NOT NULL DEFAULT 'student'");

const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@lunanhs.local';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
const passwordHash = await bcrypt.hash(adminPassword, 12);
await connection.query('INSERT INTO users(username,email,password,role) VALUES(?,?,?,"admin") ON DUPLICATE KEY UPDATE role="admin"', [adminUsername, adminEmail, passwordHash]);

for (const [name, description] of [
  ['PSA Birth Certificate','Clear copy of the learner’s PSA birth certificate'],
  ['Grade 10 Report Card','Original or certified copy of Form 138'],
  ['Certificate of Good Moral Character','Issued by the previous school'],
  ['2×2 ID Picture','Recent photograph with a plain background']
]) await connection.query('INSERT INTO requirements(name,description) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM requirements WHERE name=?)', [name, description, name]);

console.log(`Database ${database} is ready.`);
console.log(`Admin username: ${adminUsername}`);
console.log('Change the seeded admin password after first login.');
await connection.end();
