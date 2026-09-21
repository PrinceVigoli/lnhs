# Luna NHS Enrollment System: Laragon Setup Tutorial

This tutorial installs a fresh copy of the system from GitHub on a Windows computer running Laragon.

## Requirements

Install the following first:

- Laragon with MySQL 8 or newer
- Node.js 22 or newer
- Git for Windows
- Chrome, Edge, or Firefox

The application uses Laragon for MySQL. Node.js serves the website directly on port 3000, so an Apache virtual host is not required.

## 1. Clone the project

Start Laragon and click **Start All**. Open **Laragon > Terminal**, then run:

```bat
cd /d C:\laragon\www
git clone https://github.com/PrinceVigoli/lnhs.git
cd lnhs
```

## 2. Install the Node.js packages

```bat
npm.cmd ci
```

Use `npm.cmd` on Windows to avoid PowerShell execution-policy errors.

## 3. Create the environment file

```bat
copy .env.example .env
notepad .env
```

At minimum, review these settings:

```dotenv
APP_PORT=3000
APP_URL=http://localhost:3000
SESSION_SECRET=replace-with-a-random-secret
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=luna_enrollment
DB_USER=root
DB_PASS=
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@lunanhs.local
ADMIN_PASSWORD=ChooseAStrongPassword1!
```

Laragon normally uses the MySQL `root` account with no password, so `DB_PASS` can remain empty. If your MySQL account has a password, enter it there.

Generate a secure session secret:

```bat
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `SESSION_SECRET`.

Set the administrator username, email, and password before creating the database. The password must have at least eight characters, one uppercase letter, one number, and one special character.

## 4. Create the database from Laragon Terminal

Run:

```bat
npm.cmd run db:setup
```

This command creates the `luna_enrollment` database, all tables, the document requirements, and the first administrator account. phpMyAdmin is not required.

Verify the database:

```bat
mysql -u root -e "SHOW DATABASES LIKE 'luna_enrollment';"
mysql -u root -e "USE luna_enrollment; SHOW TABLES;"
```

If MySQL has a password, use `mysql -u root -p` instead.

## 5. Run the automated checks

```bat
npm.cmd test
```

All tests should pass before starting the server.

## 6. Start the system

```bat
npm.cmd start
```

When the terminal displays `Luna NHS running on http://localhost:3000`, open:

```text
http://localhost:3000
```

Keep the terminal open while using the system. Press `Ctrl+C` to stop it.

For daily use, start MySQL in Laragon and then double-click `start-luna.bat` in the project folder.

## 7. First administrator tasks

Sign in with the administrator credentials configured in `.env`. From **Users & Roles**, the administrator can assign these roles:

- **Student:** completes the profile, RIASEC test, strand selection, electives, and enrollment.
- **Teacher:** reviews completed enrollments and prints the enrollment form and Plan of Study.
- **Registrar:** manages enrollment and document-review operations.
- **Administrator:** has all staff functions and manages users, requirements, and audit records.

## 8. Configure password-reset email

For Gmail, enable two-step verification and create a Google app password. Add the following to `.env`:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM="Luna NHS Enrollment <your-email@gmail.com>"
SMTP_TEST_TO=your-email@gmail.com
```

Test the SMTP connection and delivery:

```bat
npm.cmd run smtp:test
```

Restart the application after changing `.env`. The Forgot Password page will then email a one-hour, single-use reset link.

## 9. Use the enrollment workflow

The student workflow is:

1. Register and sign in.
2. Complete the learner profile.
3. Enter the school year, grade, semester, preferred track, and curriculum exit.
4. Complete all 42 RIASEC questions.
5. Review the normalized compatibility percentage for each strand.
6. Select STEM, ABM, HUMSS, TVL, or GAS.
7. Select and rank electives available for the chosen strand.
8. Submit the enrollment.
9. Print the two-page Basic Education Enrollment Form and four-page Senior High School Plan of Study.

Teachers can print the same documents from **Staff > Enrollments**.

## 10. Open the system on other school computers

Find the server computer's IPv4 address:

```bat
ipconfig
```

If the address is `192.168.1.50`, set:

```dotenv
APP_URL=http://192.168.1.50:3000
```

Restart the server. Other computers on the same private network can open `http://192.168.1.50:3000`.

Allow Node.js through Windows Firewall on private networks when Windows asks. Use a static or reserved local IP so the address and email reset links remain stable.

## 11. Update a cloned installation

Back up the database and uploaded documents first. Then run:

```bat
cd /d C:\laragon\www\lnhs
git pull
npm.cmd ci
npm.cmd run db:setup
npm.cmd test
npm.cmd start
```

The database setup is safe to rerun for this project. It keeps existing enrollment data and applies the current role schema and default requirements.

## 12. Back up the system

Stop the Node server and export the database from Laragon Terminal:

```bat
mysqldump -u root --single-transaction --default-character-set=utf8mb4 luna_enrollment > D:\LunaBackup\luna_enrollment.sql
```

Also back up:

```text
C:\laragon\www\lnhs\uploads\documents
C:\laragon\www\lnhs\.env
```

The database and `uploads\documents` directory are both required for a complete restore.

For database transfer, restoration, troubleshooting, and more detailed deployment instructions, see [docs/LARAGON_TRANSFER_AND_RUN_GUIDE.md](docs/LARAGON_TRANSFER_AND_RUN_GUIDE.md).
