import 'dotenv/config';
import nodemailer from 'nodemailer';

if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST is empty. Configure SMTP in .env first.');
const recipient = process.env.SMTP_TEST_TO || process.env.ADMIN_EMAIL;
if (!recipient) throw new Error('Set SMTP_TEST_TO or ADMIN_EMAIL in .env.');

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});

await transport.verify();
const result = await transport.sendMail({
  from: process.env.MAIL_FROM || 'Luna NHS Enrollment <no-reply@luna.local>',
  to: recipient,
  subject: 'Luna NHS SMTP test',
  text: 'SMTP is configured correctly. Password-reset links can now be delivered by email.'
});

console.log(`SMTP connection passed. Test message sent to ${recipient}.`);
console.log(`Message ID: ${result.messageId}`);
