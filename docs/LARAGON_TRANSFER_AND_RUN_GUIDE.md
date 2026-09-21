# Transfer and Run Luna NHS Enrollment on Laragon

This guide is for moving the Node.js version of the system to another Windows computer and running MySQL through Laragon.

The application folder to transfer is `lnhs-node`. Do not use the legacy PHP folder named `lnhs`.

## 1. What the new computer needs

Install these before copying the application:

1. **Laragon** with MySQL 8 or newer.
2. **Node.js 22 LTS or newer** from the official Node.js installer.
3. A modern browser such as Chrome, Edge, or Firefox.

Start Laragon, click **Start All**, and confirm that MySQL is running. Apache or Nginx is optional because this application is served by Node.js on port 3000.

Open **Laragon > Terminal** and check the installed versions:

```bat
node --version
npm.cmd --version
mysql --version
```

The Node.js version must be `v22` or newer. All database commands in this guide are intended to be run from **Laragon > Terminal**. phpMyAdmin is not required.

## 2. Choose the type of transfer

Use one of these approaches:

- **Fresh installation:** transfers the program and creates a new empty database with one administrator account.
- **Complete transfer:** transfers the program, current database records, and uploaded student documents.

The system does not import data from the old PHP/XAMPP application.

## 3. Copy the application

On the old computer, stop the running Node server by pressing `Ctrl+C` in its terminal.

Copy this folder:

```text
C:\xampp\htdocs\lnhs-node
```

Place it on the new computer at:

```text
C:\laragon\www\lnhs-node
```

You can omit these items from the copy:

```text
node_modules
.env
```

Do copy `package.json`, `package-lock.json`, `server.js`, `config`, `lib`, `public`, `scripts`, `sql`, `views`, and `uploads`.

For a complete transfer, make sure `uploads\documents` is included because the database contains only the stored filenames, not the uploaded file contents.

## 4A. Fresh installation

Open **Laragon > Terminal** and enter the copied folder:

```bat
cd /d C:\laragon\www\lnhs-node
npm.cmd ci
copy .env.example .env
notepad .env
```

Set these values in `.env` before creating the database:

```dotenv
APP_PORT=3000
APP_URL=http://localhost:3000
SESSION_SECRET=replace-this-with-a-random-secret
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=luna_enrollment
DB_USER=root
DB_PASS=
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@lunanhs.local
ADMIN_PASSWORD=ChooseAStrongPassword1!
SMTP_HOST=
```

If the Laragon MySQL root account has a password, put it in `DB_PASS`. Keep `DB_PASS` empty when the root account has no password.

Generate a session secret with this command and paste its output into `SESSION_SECRET`:

```bat
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Create the database, tables, requirements, and administrator account directly from Laragon Terminal:

```bat
npm.cmd run db:setup
```

You do not need to create the database manually. The setup command creates `luna_enrollment` through MySQL and then builds all required tables.

Confirm that the database exists:

```bat
mysql -u root -e "SHOW DATABASES LIKE 'luna_enrollment';"
mysql -u root -e "USE luna_enrollment; SHOW TABLES;"
```

If the MySQL root account has a password, add `-p` after `root` and enter the password when prompted.

The administrator password is taken from `.env` only when the account is first created. Set the desired password before running this command.

Continue at [Verify and start the system](#5-verify-and-start-the-system).

## 4B. Complete transfer with existing records

### Export on the old computer

Stop the Node server first so no enrollment or document upload changes during the transfer.

From **XAMPP Shell** on the old computer, create a database backup. If the old computer also uses Laragon, use **Laragon > Terminal** instead. This command is for a root account with no password:

```bat
mysqldump -u root --single-transaction --default-character-set=utf8mb4 luna_enrollment > C:\Transfer\luna_enrollment.sql
```

If MySQL has a root password, use `-u root -p` instead. Copy these items to the transfer drive:

```text
C:\Transfer\luna_enrollment.sql
C:\xampp\htdocs\lnhs-node\uploads\documents
```

### Restore on the new computer

Install the Node packages and create the local environment file:

```bat
cd /d C:\laragon\www\lnhs-node
npm.cmd ci
copy .env.example .env
notepad .env
```

Configure `.env` with the new computer's MySQL credentials. Keep `DB_NAME=luna_enrollment`. Generate a new `SESSION_SECRET`; users will need to sign in again, but their accounts and data remain intact.

Open **Laragon > Terminal** on the new computer. Create the empty database using Laragon's usual blank-password root account:

```bat
mysql -u root -e "CREATE DATABASE luna_enrollment CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

Import the backup in the same Laragon Terminal:

```bat
mysql -u root --default-character-set=utf8mb4 luna_enrollment < C:\Transfer\luna_enrollment.sql
```

If MySQL has a root password, add `-p` after `root` in both commands. If Laragon Terminal is currently using PowerShell and rejects the `<` symbol, run the import through `cmd`:

```bat
cmd /c "mysql -u root --default-character-set=utf8mb4 luna_enrollment < C:\Transfer\luna_enrollment.sql"
```

Confirm that the imported tables are present:

```bat
mysql -u root -e "USE luna_enrollment; SHOW TABLES; SELECT COUNT(*) AS users FROM users;"
```

Copy the saved document files into:

```text
C:\laragon\www\lnhs-node\uploads\documents
```

Do not run `npm.cmd run db:setup` for a normal complete transfer. The imported SQL already contains the schema and accounts.

## 5. Verify and start the system

Make sure Laragon's MySQL service is running, then run:

```bat
cd /d C:\laragon\www\lnhs-node
npm.cmd test
npm.cmd start
```

The terminal should display:

```text
Luna NHS running on http://localhost:3000
```

Open this address in a browser:

```text
http://localhost:3000
```

Keep the terminal open while the system is running. Press `Ctrl+C` to stop the application.

You can also double-click `start-luna.bat` in the project folder after starting MySQL in Laragon.

## 6. Normal daily startup and shutdown

To start the system each day:

1. Open Laragon and click **Start All**.
2. Wait until MySQL shows as running.
3. Double-click `start-luna.bat`, or run `npm.cmd start` in the project folder.
4. Open `http://localhost:3000`.

To shut it down:

1. Press `Ctrl+C` in the Node terminal.
2. Close the terminal.
3. Click **Stop** or **Stop All** in Laragon.

Do not run `npm.cmd run db:setup` during normal daily use.

## 7. Access from other computers on the school network

Find the server computer's IPv4 address:

```powershell
ipconfig
```

For example, if the address is `192.168.1.50`, change `.env` to:

```dotenv
APP_URL=http://192.168.1.50:3000
```

Restart the Node server after changing `.env`. Other computers on the same network can then open:

```text
http://192.168.1.50:3000
```

When Windows asks about network access for Node.js, allow access on **Private networks**. If no prompt appears, an administrator can create a private-network firewall rule in an elevated PowerShell window:

```powershell
New-NetFirewallRule -DisplayName "Luna NHS Enrollment" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

Use a reserved or static local IP address so bookmarks and password-reset links do not change. Internet-facing use should be placed behind HTTPS and a properly configured reverse proxy.

## 8. Password-reset email

With `SMTP_HOST` empty, password-reset links are printed in the Node terminal. This is suitable for local setup and testing.

For Gmail, use an account with two-step verification and an app password, then configure:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-account@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM="Luna NHS Enrollment <your-account@gmail.com>"
SMTP_TEST_TO=your-test-recipient@gmail.com
```

Verify the connection and send a test message:

```bat
cd /d C:\laragon\www\lnhs-node
npm.cmd run smtp:test
```

After the test message arrives, restart the Node server and test the **Forgot password** screen before making the system available to students.

## 9. Backups

A complete backup needs both the MySQL database and uploaded documents.

Stop the Node server, then export the database from Laragon Terminal:

```bat
mysqldump -u root --single-transaction --default-character-set=utf8mb4 luna_enrollment > D:\LunaBackup\luna_enrollment.sql
```

Add `-p` after `root` only when the MySQL root account has a password.

Also copy:

```text
C:\laragon\www\lnhs-node\uploads\documents
C:\laragon\www\lnhs-node\.env
```

Store `.env` securely because it contains database, email, and session configuration. Create dated backups and test restoring them on a separate machine periodically.

## 10. Common problems

### `npm.ps1 cannot be loaded because running scripts is disabled`

Use `npm.cmd` instead of `npm`:

```powershell
npm.cmd ci
npm.cmd start
```

### `ECONNREFUSED 127.0.0.1:3306`

MySQL is not running or is using a different port. Start MySQL in Laragon and confirm `DB_PORT` in `.env`.

### `Access denied for user 'root'`

The `DB_USER` or `DB_PASS` value in `.env` does not match Laragon's MySQL account.

### `Unknown database 'luna_enrollment'`

For a fresh install, run:

```powershell
npm.cmd run db:setup
```

For a complete transfer, create the database and import the SQL backup again.

### Port 3000 is already in use

Stop the other process or change both settings in `.env`, for example:

```dotenv
APP_PORT=3001
APP_URL=http://localhost:3001
```

Restart the app and open the new address.

### Uploaded document records exist but files do not open

Copy the old `uploads\documents` directory to the same location on the new computer. Database restoration alone does not restore uploaded files.

### Forgot-password request succeeds but no email arrives

Check the Node terminal for an SMTP error. Verify the SMTP username, app password, sender address, and firewall connection. When `SMTP_HOST` is empty, use the reset link printed in the terminal.
