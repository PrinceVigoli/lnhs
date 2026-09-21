# Luna NHS Enrollment System

Node.js and MySQL refactor of the legacy PHP application in `C:\xampp\htdocs\lnhs`.
The legacy folder remains unchanged and is used only as a UI and workflow reference.

## Included

- Student registration, login, profile, password reset, and persistent sessions
- 42-item RIASEC assessment with normalized compatibility scores
- Student-selected strand after the recommendation
- Full DepEd elective catalog enabled across STEM, ABM, HUMSS, TVL, and GAS
- Ranked elective selection and transactional enrollment submission
- Student document upload with magic-byte validation and staff review
- Notifications, enrollment status review, strand override, requirements, users, and audit logs
- Printable Basic Education Enrollment Form
- Fresh database setup with one seeded administrator and no legacy-data migration

## Run locally

Requirements: Node.js 22 or newer and MySQL 8.4.

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run db:setup
npm.cmd start
```

Open `http://localhost:3000`.

For complete Windows and Laragon instructions, including moving the database and
uploaded documents to another computer, see
[Transfer and Run on Laragon](docs/LARAGON_TRANSFER_AND_RUN_GUIDE.md).

For a clone-first walkthrough covering database creation, SMTP, roles, enrollment,
LAN access, updates, and backups, see [TUTORIAL.md](TUTORIAL.md).

The development seed uses username `admin` and password `Admin123!`. Change the
password values in `.env` before setup for a real deployment, and change the
account password after the first login.

Configure the SMTP variables documented in `.env.example` to send password-reset
links by email. Without SMTP settings, reset links are printed in the local server
console for development.

## Verify

```powershell
npm.cmd test
npm.cmd audit --omit=dev
```
