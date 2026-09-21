# Luna NHS Enrollment System — Node.js + MySQL Rebuild

**Design specification**
Date: 2026-09-20
Location: `C:\xampp\htdocs\lnhs-node`
Old system (reference, kept intact): `C:\xampp\htdocs\lnhs` (PHP + MariaDB)

---

## 1. Purpose and context

Rebuild the existing PHP + MySQL Senior High School enrollment portal for Luna
National High School as a Node.js + MySQL application that runs under Laragon.
The rebuild keeps the current look and the bulk of the current features, and
introduces four revisions requested by the school:

1. **RIASEC-based compatibility scores.** The student takes a RIASEC (Holland
   Code) test inside the enrollment flow. The system scores it and shows a
   strand compatibility result before the student chooses a strand.
2. **Strand choice after the score.** The student selects their strand from the
   compatibility screen. The recommended strand is highlighted but not forced.
3. **Electives step.** After choosing a strand, the student selects and ranks
   electives from that strand's available DepEd cluster.
4. **Printable enrollment form.** After submitting, the student can print the
   official DepEd forms, pre-filled from their data.
5. **Password reset by email.** A forgot-password flow emails a one-time reset
   link over SMTP.

### Success criteria

- The app runs on Node under Laragon against Laragon's MySQL 8.4, reachable in a
  browser at a local port, with no PHP or Apache dependency.
- A student can register, verify their email is theirs via password reset,
  complete their profile, take the RIASEC test, see compatibility scores, choose
  a strand, choose STEM electives when applicable, submit, and print the forms.
- Staff can review enrollments, override strands, verify documents, manage
  requirements and users, and read the audit trail, as they can today.
- The printed enrollment form matches the DepEd Basic Education Enrollment Form
  layout and is populated from the student's saved data.

### Non-goals

- No data migration from the old system. Existing XAMPP/MariaDB data is test
  data and is discarded. A fresh database is created and seeded with one admin.
- No single-page-application front end and no build pipeline.
- Grade-10 grade entry and the career-interest card step are removed. The
  compatibility score is derived from RIASEC only. (The database keeps room to
  reintroduce other signals later, but they are not built now.)
- Elective selection is enabled for all strands. The catalog is organized by
  DepEd cluster so each strand presents its own electives and can be expanded
  later without rework.

---

## 2. Technology stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20+ | Laragon bundles node-v22; system has v24. Either works. |
| Web framework | Express 4 | Server-rendered multi-page app. |
| Templating | EJS + express-ejs-layouts | One route ≈ one template, mirroring the PHP pages. |
| Database driver | mysql2 (promise pool) | Native support for MySQL 8.4 `caching_sha2_password`. |
| Sessions | express-session + express-mysql-session | Session store in MySQL so logins survive restarts. |
| Password hashing | bcrypt | Cost 12, matching the old system's policy. |
| Email | nodemailer | SMTP transport from environment config. |
| File uploads | multer + file-type | Server-side MIME detection by magic bytes. |
| Security headers | helmet | CSP with a per-request nonce. |
| Rate limiting | rate-limiter-flexible (MySQL store) | Persistent login/register/reset throttling. |
| Charts | Chart.js (CDN) | Admin dashboard, unchanged from today. |
| CSS | Ported `style.css` (Bootstrap 5 CDN) | Same visual design system. |
| Config | dotenv | `.env` in the app root. |

Rejected alternatives: an Express API plus a React/Vue SPA (doubles the surface
and adds a build step for a form-driven CRUD app); Next.js (heavier framework
whose conventions fight a Laragon setup). Both violate YAGNI here.

---

## 3. Project structure

```
lnhs-node/
  server.js                  # app bootstrap: middleware, routes, listen
  package.json
  .env                       # real config (gitignored)
  .env.example               # template
  /config
    db.js                    # mysql2 pool from env
    mailer.js                # nodemailer transport from env
    session.js               # express-session + MySQL store
    riasec.js                # 42 items + scoring + letter→strand mapping
    electives.js             # full elective catalog (from the PDF)
    strands.js               # strand metadata (name, color, icon, careers)
    requirements-seed.js     # default document requirements
  /middleware
    auth.js                  # requireLogin / requireStaff / requireAdmin
    csrf.js                  # per-session token, rotated, verified on POST
    security.js              # helmet + CSP nonce
    rateLimit.js             # login / register / reset limiters
    flash.js                 # flash messages via session
    locals.js                # inject user, csrf token, base URL into views
  /lib
    recommendation.js        # RIASEC scoring + strand compatibility engine
    audit.js                 # write audit_logs rows
    notifications.js         # create / count / mark-read notifications
    validators.js            # shared input validation helpers
  /db
    users.js students.js enrollments.js documents.js
    requirements.js riasec.js electives.js notifications.js
    audit.js passwordResets.js   # thin query modules (one per table area)
  /routes
    auth.js                  # login, register, logout, forgot, reset
    student.js               # dashboard, profile, documents, notifications
    enroll.js                # RIASEC test, results, strand, electives, submit
    result.js                # enrollment result view
    print.js                 # printable enrollment form + plan of study
    admin.js                 # dashboard, students, enrollments, docs, reqs,
                             # users, audit
  /views
    layouts/main.ejs         # shared HTML shell
    partials/                # navbar, sidebar, footer, flash
    auth/  student/  enroll/  admin/  print/
  /public
    css/style.css  js/main.js  img/
  /uploads/documents         # uploaded files, served only via a route
  /sql
    schema.sql               # full DDL
    seed.sql                 # default admin + default requirements
  /scripts
    setup-db.js              # create schema + seed (npm run db:setup)
    hash-password.js         # helper to generate a bcrypt hash
  /test
    riasec.test.js  electives.test.js  auth.test.js  ...
```

---

## 4. Data model

MySQL 8.4, InnoDB, utf8mb4. Tables carried over from the old schema keep their
shape unless noted. New and changed tables are described below.

### 4.1 users (carried over)

Unchanged: `id, username, email, password, role, created_at`.
`role` ENUM('student','registrar','admin').

### 4.2 students (expanded)

The old `students` table is expanded so the printed enrollment form can be filled
entirely from stored data. New/changed columns:

- Identity: `psa_birth_cert_no`, `extension_name`, `place_of_birth`, keep
  `lrn, first_name, middle_name, last_name, birth_date, gender`.
- Add `age` is computed from `birth_date` at print time (not stored).
- Socio: `is_4ps` TINYINT, `fourps_household_id`; keep `is_ip, ip_community,
  is_pwd, pwd_type`.
- Current address (split): `cur_house_no, cur_street, cur_barangay,
  cur_municipality, cur_province, cur_country, cur_zip`.
- Permanent address: `perm_same_as_current` TINYINT, plus `perm_*` mirror of the
  current-address columns.
- Contact/personal: keep `contact_number, nationality, religion, mother_tongue,
  address` (address kept as a free-text fallback).
- Parents/guardian (split into parts, each with contact):
  `father_last, father_first, father_middle, father_contact`,
  `mother_last, mother_first, mother_middle, mother_contact`,
  `guardian_last, guardian_first, guardian_middle, guardian_contact,
   guardian_relationship`. (Old single-name columns are dropped.)
- Special Needs Education: `sne_program` TINYINT, `sne_diagnosis` VARCHAR
  (a1 category), `sne_manifestations` JSON (a2 checkboxes), `has_pwd_id` TINYINT.
- Returning learner: `last_grade_completed, last_sy_completed,
  last_school_attended, last_school_id`.
- SHS: `semester` VARCHAR, keep `grade_level, learner_type, previous_school,
  jhs_graduated`.
- Distance-learning preference: `dl_modalities` JSON (multi-select).

`user_id` unique FK to `users` with cascade delete, as today.

### 4.3 enrollments (carried over, minor add)

Keep: `id, student_id, school_year, grade_level, recommended_strand,
chosen_strand, curriculum_exit, preferred_track, status, remarks,
admin_strand_override, admin_override_reason, created_at, updated_at`.
`status` ENUM('Pending','Confirmed','Incomplete','Rejected').
Add `semester` VARCHAR to carry the SHS semester onto the form.
`recommended_strand` is now the RIASEC top strand.

### 4.4 riasec_results (new)

Per enrollment (one row):
`id, enrollment_id (FK, cascade), score_r, score_i, score_a, score_s, score_e,
score_c, answers JSON, computed_at`. `answers` stores the 42 item responses for
audit. Per-strand compatibility percentages are computed on read from the six
scores and the mapping; they are not stored, so a mapping change re-derives them.

### 4.5 student_electives + plan_of_study (carried over)

Used for elective selection for every strand. `student_electives(enrollment_id,
elective_key, elective_rank)` and `plan_of_study(enrollment_id, elective_key,
elective_name, elective_rank, hours, track_type, cluster)` as today.

### 4.6 requirements + student_documents (carried over)

Unchanged from the old schema, including document status
ENUM('Submitted','Verified','Rejected'), `admin_note, verified_at, verified_by`.

### 4.7 notifications + audit_logs (carried over)

Unchanged.

### 4.8 password_resets (new)

`id, user_id (FK, cascade), token_hash CHAR(64), expires_at DATETIME,
used_at DATETIME NULL, created_at`. Only the SHA-256 hash of the token is
stored. A row is single-use and expires one hour after creation.

### 4.9 rate_limits (new, managed by rate-limiter-flexible)

Table created and maintained by the limiter library for login, registration, and
password-reset throttling. Replaces the old hand-rolled `login_attempts` table.

### 4.10 Removed

`student_grades` and `career_interests` are not created. Grade entry and the
interest-card step are removed from the product.

---

## 5. RIASEC compatibility engine

All of the following lives in `config/riasec.js` and `lib/recommendation.js` and
is editable without touching route code.

### 5.1 Items (config)

`config/riasec.js` exports `items`: an array of 42 objects
`{ id, text, letter }`, seven items for each of R, I, A, S, E, C. Each item is a
yes/no statement ("I like to work on cars", etc.). The seed set is a standard
Holland-style inventory; the school can edit text, add, or remove items. Scoring
adapts to however many items exist per letter.

### 5.2 Scoring

- Each "yes" adds 1 to that item's letter. Result: six letter totals
  `s_R … s_C`, each in `[0, itemsPerLetter]`.
- Letter→strand mapping (config, from the school's decision):

  | Letter | Strand(s) |
  |---|---|
  | R (Realistic) | TVL |
  | I (Investigative) | STEM |
  | A (Artistic) | HUMSS |
  | S (Social) | HUMSS |
  | E (Enterprising) | ABM |
  | C (Conventional) | ABM, GAS |

- A letter's score is split equally among the strands it maps to. Contribution
  to strand `T` from letter `L` is `s_L / |mapping[L]|` when `T ∈ mapping[L]`.
  So C contributes `s_C / 2` to each of ABM and GAS.
- `strandScore[T] = Σ_L contribution(L, T)`.
- `maxPossible[T] = Σ_{L: T ∈ mapping[L]} (itemsPerLetter / |mapping[L]|)`.
- **Compatibility %** for display: `pct[T] = round(strandScore[T] /
  maxPossible[T] * 100)`. This makes each strand a fair 0–100% of its own
  possible signal, so strands with more contributing letters are not inflated.
- **Recommended strand** = the `T` with the highest `pct[T]`; ties broken by a
  fixed strand order (STEM, ABM, HUMSS, TVL, GAS). If all scores are zero, the
  recommendation is GAS.

### 5.3 Output

`computeCompatibility(scores)` returns `{ strandScores, percentages, ranked,
recommended }`, consumed by the results screen and stored indirectly (the six raw
scores are persisted; percentages recompute on read).

---

## 6. Enrollment flow (revised)

A multi-step flow, one server round-trip per major step, state carried in the
form and session. Prerequisite: a completed profile (redirect to profile if
missing), same guard as today.

1. **Step 1 — Basic info.** School year, grade level (11/12), semester,
   preferred track, curriculum exit. Track can be auto-suggested from the strand
   later but is selectable.
2. **Step 2 — RIASEC test.** The 42 yes/no items rendered from config, grouped
   by nothing visible (letters not shown to the student). All items required.
   On submit, the six letter scores are computed.
3. **Step 3 — Compatibility results.** Five strand bars with compatibility %,
   ranked, recommended strand highlighted with a star. Explains that the score
   comes from the RIASEC test.
4. **Step 4 — Strand choice.** Radio selection of the strand. Default selection
   is the recommended strand; the student may pick any strand.
5. **Step 5 — Electives.** Shown for every chosen strand. The electives from
   that strand's DepEd cluster are listed with hours and prerequisite rules (a
   "3-4" subject requires its "1-2" subject; the UI warns and the server
   validates). Student checks up to 10 and ranks them 1..N, mirroring the
   DepEd instruction.
6. **Submit.** In one transaction: insert `enrollments` (status Pending,
   `recommended_strand` = RIASEC top, `chosen_strand` = selection), insert
   `riasec_results` (six scores + answers JSON), and for STEM insert
   `student_electives` + `plan_of_study` for the selected strand. Redirect to
   the result page.
7. **Print.** From the result page, links to the printable enrollment form and
   plan of study.

Editing an Incomplete enrollment (`enroll_edit` equivalent) lets the student
change the chosen strand, curriculum exit, and note, and resubmit, as today. The
RIASEC answers are preserved; re-taking the test is a separate action.

---

## 7. Authentication and password reset

### 7.1 Login / register / logout

- Login by username or email + password; bcrypt verify; `req.session.regenerate`
  on success to prevent fixation; generic error on failure; rate-limited.
- Register: student self-registration with the same validations as today
  (username 3–30 `[A-Za-z0-9_]`, valid email, password ≥8 with upper, digit,
  special, confirmation match), generic "already exists" message, rate-limited.
- Logout destroys the session and clears the cookie.

### 7.2 Forgot password (new)

1. `GET /forgot` shows an email field.
2. `POST /forgot`: always responds with the same generic "if that email exists,
   a link has been sent" message (no enumeration). If the email matches a user,
   generate a 32-byte random token, store its SHA-256 hash + 1-hour expiry in
   `password_resets`, and email a link `${APP_URL}/reset/<token>` via SMTP.
   Rate-limited per email and per IP.
3. `GET /reset/:token`: validate the token (exists, unused, not expired); show a
   new-password form or an "invalid or expired" page.
4. `POST /reset/:token`: re-validate, enforce the password policy, update the
   hash, mark the token used, invalidate other outstanding tokens for that user,
   and redirect to login with a success flash.

SMTP settings (`SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS,
MAIL_FROM`) live in `.env`. A Gmail address with an app password is sufficient
for testing. The login page gains a "Forgot password?" link.

---

## 8. Printable forms

Two print routes, HTML re-creations of the DepEd forms with an A4 print
stylesheet, pre-filled from stored data. Access control: the owning student or
any staff member.

- `GET /print/enrollment/:id` — the **Basic Education Enrollment Form** (revised
  06/01/2025): grade level, LRN, learner personal information, IP and 4Ps,
  current and permanent address, parents and guardian, Special Needs section,
  returning-learner block, SHS semester/track/strand, distance-learning
  preferences, and the certification with blank signature and date lines.
- `GET /print/plan-of-study/:id` — the **Senior High School Plan of Study**:
  Part I learner info, Part II the ranked selected electives with hours, marked
  track, and curriculum exit, and a Part III teacher's-assessment block with the
  core-subject hours and per-track totals.

Rebuilding the forms as clean HTML (rather than overlaying text on the skewed
scans) keeps them maintainable and correctly aligned. The layout follows the DepEd
originals closely enough to be recognizable and acceptable to the registrar.

---

## 9. Staff features (ported)

Ported from the old system with equivalent behavior:

- **Dashboard**: stat cards, strand distribution donut, enrollment trend,
  recommendation-acceptance rate (chosen == RIASEC-recommended), documents
  awaiting review, recent enrollments. Grade-related stats removed.
- **Students**: searchable/filterable list; detail view with profile, enrollment
  history, RIASEC result, plan of study, and documents; admin delete (cascades).
- **Enrollments**: filter/search, single status update with strand override and
  student notification, bulk status update, admin delete, all audit-logged.
- **Documents**: verify/reject with note and notification, controlled file
  serving with server-side MIME detection, admin delete.
- **Requirements**: CRUD of the document checklist (admin only).
- **Users**: role changes, admin password reset, delete, with the "cannot remove
  the last admin / cannot change own role" guards, audit-logged.
- **Audit logs**: filterable, paginated, read-only trail.

Role model unchanged: `student`, `registrar` (documents + enrollment status),
`admin` (everything).

---

## 10. Security

- **Sessions**: httpOnly, sameSite=strict, secure when `APP_URL` is https;
  stored in MySQL; regenerated on login.
- **CSRF**: per-session token injected into every form and verified (constant-
  time compare) on every POST; rotated after each successful verification.
- **Passwords**: bcrypt cost 12; policy enforced on register, admin reset, and
  self-reset.
- **Headers/CSP**: helmet with a per-request nonce for inline scripts; the CSP
  whitelists only the CDN hosts used (jsDelivr, Google Fonts), matching today.
- **Rate limiting**: persistent limiters on login (per username+IP), registration
  (per IP), and password reset (per email and per IP).
- **File uploads**: magic-byte MIME detection, extension whitelist (jpg, jpeg,
  png, gif, webp, pdf), 5 MB cap, randomized stored filename, served only through
  a route with `X-Content-Type-Options: nosniff` and a locked-down content type.
  Node does not execute uploads as code, but validation still applies.
- **SQL**: mysql2 parameterized queries throughout; no string interpolation of
  user input into SQL.
- **Output**: EJS `<%= %>` auto-escapes; unescaped `<%- %>` only for trusted
  markup.
- **Access control**: `requireLogin/requireStaff/requireAdmin` middleware;
  ownership checks on result and print routes (the old IDOR fix, preserved).
- **Audit**: every staff mutation writes an `audit_logs` row.

---

## 11. Configuration and running under Laragon

`.env` (with `.env.example` committed):

```
APP_URL=http://localhost:3000
APP_PORT=3000
SESSION_SECRET=<random>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=luna_enrollment
DB_USER=root
DB_PASS=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<address>
SMTP_PASS=<app password>
MAIL_FROM="Luna NHS Enrollment <no-reply@luna.example>"
```

Setup:

1. `npm install`
2. `npm run db:setup` — creates the `luna_enrollment` database, applies
   `schema.sql`, and seeds one admin plus the default requirements against
   Laragon's MySQL 8.4 (root, empty password by default).
3. `npm start` — Express listens on `APP_PORT`; open `http://localhost:3000`.

Laragon runs it as a Node process. A pretty host via Laragon's reverse proxy is
optional; the direct port works out of the box. The old PHP app stays untouched
in `C:\xampp\htdocs\lnhs`.

Default admin is seeded with a known username and a bcrypt-hashed password
(printed by `db:setup` or documented in the README), to be changed on first
login.

---

## 12. Testing strategy

Implementation follows test-driven development. Coverage focuses on logic that is
easy to get wrong:

- **Unit** (`node:test` or Jest): RIASEC scoring and compatibility math against
  known inputs (all-yes, all-no, single-letter, ties); the letter→strand mapping
  and normalization; STEM elective prerequisite validation; password-reset token
  generation, hashing, expiry, and single-use; input validators.
- **Integration** (supertest against a test database): register → login →
  profile → enroll (RIASEC → results → strand → electives → submit) → result;
  forgot/reset password happy path and expired/used-token paths; CSRF rejection;
  access-control rejections (IDOR, role guards); document upload accept/reject by
  MIME.
- **Manual smoke** under Laragon before hand-off: full student journey, staff
  review, print output, and a real SMTP send.

---

## 13. Build order

Three phases, each independently testable. Phases 2 and 3 depend on the DepEd
PDF, which is in hand.

1. **Foundation + accounts + profile + staff port.** Project scaffold, config,
   DB, sessions, security, layout/partials, auth including password reset over
   SMTP, expanded profile, and the ported staff features.
2. **Revised enrollment flow.** RIASEC config and engine, the five-step flow,
   compatibility results, STEM electives, submission, and the result view.
3. **Printable forms.** The enrollment form and plan of study print routes and
   stylesheets.

Each phase gets its own implementation plan and its own review before merge.

---

## 14. Open items

- None blocking. The RIASEC item wording ships as a standard set in config and
  can be revised by the school at any time.
- Version control is not yet initialized in the new folder; recommended before
  implementation so each phase can be reviewed as a diff.
