import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { pool } from './config/db.js';
import { items } from './config/riasec.js';
import { scoreAnswers, computeCompatibility } from './lib/recommendation.js';
import { electives, catalog, validateElectives } from './config/electives.js';

const app = express();
const port = Number(process.env.APP_PORT || 3000);
const strands = ['STEM', 'ABM', 'HUMSS', 'TVL', 'GAS'];
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:5*1024*1024, files:1 } });
const uploadDirectory = path.resolve('uploads/documents');
await fs.mkdir(uploadDirectory, { recursive:true });
class MySQLSessionStore extends session.Store {
  get(sid, callback) { pool.query('SELECT data FROM app_sessions WHERE sid=? AND expires_at>NOW()', [sid]).then(([[row]]) => callback(null, row ? (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) : null)).catch(callback); }
  set(sid, value, callback=()=>{}) { const expires = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now()+86400000); pool.query('INSERT INTO app_sessions(sid,data,expires_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),expires_at=VALUES(expires_at)', [sid,JSON.stringify(value),expires]).then(()=>callback()).catch(callback); }
  destroy(sid, callback=()=>{}) { pool.query('DELETE FROM app_sessions WHERE sid=?', [sid]).then(()=>callback()).catch(callback); }
  touch(sid, value, callback=()=>{}) { const expires = value.cookie?.expires ? new Date(value.cookie.expires) : new Date(Date.now()+86400000); pool.query('UPDATE app_sessions SET expires_at=? WHERE sid=?', [expires,sid]).then(()=>callback()).catch(callback); }
}
const sessionStore = new MySQLSessionStore();

app.set('view engine', 'ejs');
app.set('views', './views');
app.use((req,res,next) => { res.locals.nonce = crypto.randomBytes(16).toString('base64'); next(); });
app.use(helmet({ contentSecurityPolicy:{ directives:{ defaultSrc:["'self'"], scriptSrc:["'self'",'https://cdn.jsdelivr.net',(req,res)=>`'nonce-${res.locals.nonce}'`], styleSrc:["'self'","'unsafe-inline'",'https://cdn.jsdelivr.net','https://fonts.googleapis.com'], fontSrc:["'self'",'https://cdn.jsdelivr.net','https://fonts.gstatic.com','data:'], imgSrc:["'self'",'data:'], objectSrc:["'none'"], baseUri:["'self'"], formAction:["'self'"], upgradeInsecureRequests:null } } }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'development-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.APP_URL?.startsWith('https://') || false }
}));

const verifyCsrf = (req,res,next) => {
  const supplied = Buffer.from(String(req.body?._csrf || ''));
  const expected = Buffer.from(req.session.csrf || '');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(403).send('Invalid or expired form token. Reload the page and try again.');
  req.session.csrf = crypto.randomBytes(32).toString('hex');
  next();
};
app.use((req, res, next) => {
  req.session.csrf ||= crypto.randomBytes(32).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.user = req.session.user;
  res.locals.message = req.session.message;
  delete req.session.message;
  if (req.method !== 'POST' || (req.path === '/documents' && req.is('multipart/form-data'))) return next();
  verifyCsrf(req,res,next);
});

const requireLogin = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const requireStudent = (req,res,next) => requireLogin(req,res,()=>req.session.user.role==='student'?next():res.redirect('/admin/dashboard'));
const requireStaff = (req, res, next) => requireLogin(req, res, () => ['admin', 'registrar', 'teacher'].includes(req.session.user.role) ? next() : res.sendStatus(403));
const requireAdmin = (req, res, next) => requireLogin(req, res, () => req.session.user.role === 'admin' ? next() : res.sendStatus(403));
const passwordValid = value => typeof value === 'string' && value.length >= 8 && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const rateLimit = (prefix, maximum, windowSeconds, identity) => async (req,res,next) => {
  const key = `${prefix}:${identity(req)}`.slice(0,191);
  await pool.query('INSERT INTO rate_limits(limit_key,points,reset_at) VALUES(?,1,DATE_ADD(NOW(),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE points=IF(reset_at<NOW(),1,points+1),reset_at=IF(reset_at<NOW(),DATE_ADD(NOW(),INTERVAL ? SECOND),reset_at)', [key,windowSeconds,windowSeconds]);
  const [[limit]] = await pool.query('SELECT points FROM rate_limits WHERE limit_key=?', [key]);
  if (limit.points > maximum) return res.status(429).send('Too many attempts. Please wait and try again.');
  next();
};

app.get('/', (req, res) => req.session.user ? res.redirect('/dashboard') : res.redirect('/login'));

app.get('/register', (req, res) => res.render('auth/register'));
app.post('/register', rateLimit('register',5,3600,req=>req.ip), async (req, res) => {
  const { username, email, password, confirm } = req.body;
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username || '') || !/^\S+@\S+\.\S+$/.test(email || '') || !passwordValid(password) || password !== confirm) {
    return res.status(400).render('auth/register', { error: 'Use a valid username and email. Password needs 8 characters, an uppercase letter, a number, and a special character.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const hash = await bcrypt.hash(password, 12);
    const [result] = await conn.query('INSERT INTO users(username,email,password) VALUES(?,?,?)', [username, email, hash]);
    await conn.query('INSERT INTO students(user_id) VALUES(?)', [result.insertId]);
    await conn.commit();
    req.session.message = 'Registration complete. Please log in.';
    res.redirect('/login');
  } catch (error) {
    await conn.rollback();
    res.status(400).render('auth/register', { error: 'Username or email is already registered.' });
  } finally { conn.release(); }
});

app.get('/login', (req, res) => res.render('auth/login'));
app.post('/login', rateLimit('login',10,900,req=>`${req.ip}:${String(req.body.identity||'').toLowerCase()}`), async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE username=? OR email=? LIMIT 1', [req.body.identity, req.body.identity]);
  if (!rows[0] || !await bcrypt.compare(req.body.password || '', rows[0].password)) return res.status(401).render('auth/login', { error: 'Invalid credentials.' });
  const user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
  req.session.regenerate(error => {
    if (error) return res.status(500).send('Could not start your session.');
    req.session.user = user;
    res.redirect(user.role === 'student' ? '/dashboard' : '/admin/dashboard');
  });
});
app.post('/logout', requireLogin, (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/forgot', (req, res) => res.render('auth/forgot'));
app.post('/forgot', rateLimit('forgot',5,3600,req=>`${req.ip}:${String(req.body.email||'').toLowerCase()}`), async (req, res) => {
  const [[user]] = await pool.query('SELECT id,email FROM users WHERE email=? LIMIT 1', [req.body.email]);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))', [user.id, tokenHash]);
    const link = `${process.env.APP_URL || `http://localhost:${port}`}/reset/${token}`;
    if (process.env.SMTP_HOST) {
      const mailer = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
      try { await mailer.sendMail({ from: process.env.MAIL_FROM || 'Luna NHS Enrollment <no-reply@luna.local>', to: user.email, subject: 'Reset your Luna NHS password', text: `Reset your password within one hour: ${link}` }); }
      catch (error) { console.error('Password reset email failed:', error.message); }
    } else console.log(`Password reset link for local testing: ${link}`);
  }
  res.render('auth/forgot', { sent: true });
});
app.get('/reset/:token', async (req, res) => {
  const hash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const [[row]] = await pool.query('SELECT id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW()', [hash]);
  res.render('auth/reset', { valid: Boolean(row), token: req.params.token });
});
app.post('/reset/:token', async (req, res) => {
  if (!passwordValid(req.body.password) || req.body.password !== req.body.confirm) return res.status(400).render('auth/reset', { valid: true, token: req.params.token, error: 'Passwords must match and meet the password policy.' });
  const hash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[reset]] = await conn.query('SELECT id,user_id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW() FOR UPDATE', [hash]);
    if (!reset) { await conn.rollback(); return res.status(400).render('auth/reset', { valid: false, token: req.params.token }); }
    await conn.query('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(req.body.password, 12), reset.user_id]);
    await conn.query('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL', [reset.user_id]);
    await conn.commit();
    req.session.message = 'Password updated. You can now sign in.';
    res.redirect('/login');
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
});

app.get('/dashboard', requireLogin, async (req, res) => {
  if (req.session.user.role !== 'student') return res.redirect('/admin/dashboard');
  const [[student]] = await pool.query('SELECT * FROM students WHERE user_id=?', [req.session.user.id]);
  const [enrollments] = student ? await pool.query('SELECT * FROM enrollments WHERE student_id=? ORDER BY id DESC', [student.id]) : [[]];
  res.render('student/dashboard', { student, enrollments });
});

app.get('/profile', requireStudent, async (req, res) => {
  const [[student]] = await pool.query('SELECT * FROM students WHERE user_id=?', [req.session.user.id]);
  for (const field of ['dl_modalities','sne_manifestations']) if (typeof student[field] === 'string') try { student[field] = JSON.parse(student[field]); } catch { student[field] = []; }
  res.render('student/profile', { student });
});
app.post('/profile', requireStudent, async (req, res) => {
  const fields = ['lrn','psa_birth_cert_no','extension_name','first_name','middle_name','last_name','birth_date','gender','place_of_birth','nationality','religion','mother_tongue','contact_number','fourps_household_id','ip_community','pwd_type','cur_house_no','cur_street','cur_barangay','cur_municipality','cur_province','cur_country','cur_zip','perm_house_no','perm_street','perm_barangay','perm_municipality','perm_province','perm_country','perm_zip','address','father_last','father_first','father_middle','father_contact','mother_last','mother_first','mother_middle','mother_contact','guardian_last','guardian_first','guardian_middle','guardian_contact','guardian_relationship','sne_diagnosis','last_grade_completed','last_sy_completed','last_school_attended','last_school_id','learner_type','previous_school','jhs_graduated','grade_level','semester'];
  const values = fields.map(field => req.body[field] || null);
  const modalities = [].concat(req.body.dl_modalities || []).filter(Boolean);
  const manifestations = [].concat(req.body.sne_manifestations || []).filter(Boolean);
  await pool.query(`UPDATE students SET ${fields.map(field => `${field}=?`).join(',')},is_4ps=?,is_ip=?,is_pwd=?,perm_same_as_current=?,sne_program=?,has_pwd_id=?,dl_modalities=?,sne_manifestations=? WHERE user_id=?`, [...values, req.body.is_4ps?1:0, req.body.is_ip?1:0, req.body.is_pwd?1:0, req.body.perm_same_as_current?1:0, req.body.sne_program?1:0, req.body.has_pwd_id?1:0, JSON.stringify(modalities), JSON.stringify(manifestations), req.session.user.id]);
  req.session.message = 'Profile saved.';
  res.redirect('/dashboard');
});

app.get('/documents', requireStudent, async (req, res) => {
  const [[student]] = await pool.query('SELECT id FROM students WHERE user_id=?', [req.session.user.id]);
  const [requirements] = await pool.query('SELECT * FROM requirements WHERE is_active=1 ORDER BY name');
  const [documents] = await pool.query('SELECT d.*,r.name requirement FROM student_documents d JOIN requirements r ON r.id=d.requirement_id WHERE d.student_id=? ORDER BY d.created_at DESC', [student.id]);
  res.render('student/documents', { requirements, documents });
});
app.post('/documents', requireStudent, upload.single('document'), verifyCsrf, async (req, res) => {
  if (!req.file) return res.status(400).send('Choose a document to upload.');
  const type = await fileTypeFromBuffer(req.file.buffer);
  const allowed = new Set(['image/jpeg','image/png','image/gif','image/webp','application/pdf']);
  if (!type || !allowed.has(type.mime)) return res.status(400).send('Only genuine JPG, PNG, GIF, WebP, and PDF files are accepted.');
  const [[student]] = await pool.query('SELECT id FROM students WHERE user_id=?', [req.session.user.id]);
  const [[requirement]] = await pool.query('SELECT id FROM requirements WHERE id=? AND is_active=1', [req.body.requirement_id]);
  if (!requirement) return res.status(400).send('Invalid requirement.');
  const storedName = `${crypto.randomUUID()}.${type.ext}`;
  await fs.writeFile(path.join(uploadDirectory, storedName), req.file.buffer, { flag:'wx' });
  await pool.query('INSERT INTO student_documents(student_id,requirement_id,file_path,original_name,mime_type) VALUES(?,?,?,?,?)', [student.id, requirement.id, storedName, req.file.originalname.slice(0,255), type.mime]);
  req.session.message = 'Document uploaded for review.';
  res.redirect('/documents');
});
app.get('/documents/:id/download', requireLogin, async (req, res) => {
  const ownership = req.session.user.role === 'student' ? 'AND s.user_id=?' : '';
  const params = req.session.user.role === 'student' ? [req.params.id, req.session.user.id] : [req.params.id];
  const [[document]] = await pool.query(`SELECT d.* FROM student_documents d JOIN students s ON s.id=d.student_id WHERE d.id=? ${ownership}`, params);
  if (!document) return res.sendStatus(404);
  res.type(document.mime_type || 'application/octet-stream');
  res.set('X-Content-Type-Options','nosniff');
  res.sendFile(path.join(uploadDirectory, path.basename(document.file_path)));
});

app.get('/notifications', requireStudent, async (req, res) => {
  const [notifications] = await pool.query('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC', [req.session.user.id]);
  res.render('student/notifications', { notifications });
});
app.post('/notifications/read', requireStudent, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.session.user.id]);
  res.redirect('/notifications');
});

app.get('/enroll', requireStudent, async (req, res) => {
  const [[student]] = await pool.query('SELECT first_name,last_name FROM students WHERE user_id=?', [req.session.user.id]);
  if (!student?.first_name || !student?.last_name) { req.session.message = 'Complete your profile before enrollment.'; return res.redirect('/profile'); }
  res.render('enroll/basic');
});
app.post('/enroll/basic', requireStudent, (req, res) => {
  if (!/^\d{4}-\d{4}$/.test(req.body.school_year || '') || !['11','12'].includes(req.body.grade_level)) return res.status(400).send('Invalid enrollment information.');
  req.session.enroll = { school_year:req.body.school_year, grade_level:req.body.grade_level, semester:req.body.semester, preferred_track:req.body.preferred_track, curriculum_exit:req.body.curriculum_exit };
  res.redirect('/enroll/riasec');
});
app.get('/enroll/riasec', requireStudent, (req, res) => req.session.enroll ? res.render('enroll/riasec', { items }) : res.redirect('/enroll'));
app.post('/enroll/riasec', requireStudent, (req, res) => {
  if (!req.session.enroll) return res.redirect('/enroll');
  if (items.some(item => !['yes','no'].includes(req.body[item.id]))) return res.status(400).render('enroll/riasec', { items, error:'Answer every statement before continuing.' });
  const answers = Object.fromEntries(items.map(item => [item.id, req.body[item.id]]));
  const scores = scoreAnswers(answers);
  req.session.enroll = { ...req.session.enroll, scores, answers, compatibility:computeCompatibility(scores) };
  res.redirect('/enroll/results');
});
app.get('/enroll/results', requireStudent, (req, res) => req.session.enroll?.compatibility ? res.render('enroll/results', req.session.enroll.compatibility) : res.redirect('/enroll'));
app.post('/enroll/strand', requireStudent, (req, res) => {
  if (!req.session.enroll?.compatibility) return res.redirect('/enroll');
  if (!strands.includes(req.body.strand)) return res.status(400).send('Invalid strand.');
  req.session.enroll.chosen_strand = req.body.strand;
  res.redirect('/enroll/electives');
});
app.get('/enroll/electives', requireStudent, (req, res) => {
  const flow = req.session.enroll;
  if (!flow?.chosen_strand) return res.redirect('/enroll/results');
  res.render('enroll/electives', { strand:flow.chosen_strand, electives:electives[flow.chosen_strand] || [] });
});
app.post('/enroll/submit', requireStudent, async (req, res) => {
  const flow = req.session.enroll;
  if (!flow?.chosen_strand) return res.redirect('/enroll');
  let selected = Array.isArray(req.body.electives) ? req.body.electives : [req.body.electives].filter(Boolean);
  const ranks = req.body.ranks || {};
  selected.sort((a,b) => Number(ranks[a] || 999) - Number(ranks[b] || 999));
  const rankValues = selected.map(key => Number(ranks[key]));
  const validation = validateElectives(flow.chosen_strand, selected);
  const invalidRanks = rankValues.some((rank, index) => !Number.isInteger(rank) || rank < 1 || rank > selected.length || rankValues.indexOf(rank) !== index);
  if (!validation.valid || invalidRanks) return res.status(400).render('enroll/electives', { strand:flow.chosen_strand, electives:electives[flow.chosen_strand] || [], error:validation.error || 'Give each selected elective a unique rank.' });
  const [[student]] = await pool.query('SELECT id FROM students WHERE user_id=?', [req.session.user.id]);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO enrollments(student_id,school_year,grade_level,semester,preferred_track,curriculum_exit,recommended_strand,chosen_strand) VALUES(?,?,?,?,?,?,?,?)', [student.id, flow.school_year, flow.grade_level, flow.semester, flow.preferred_track, flow.curriculum_exit, flow.compatibility.recommended, flow.chosen_strand]);
    const score = flow.scores;
    await conn.query('INSERT INTO riasec_results(enrollment_id,score_r,score_i,score_a,score_s,score_e,score_c,answers) VALUES(?,?,?,?,?,?,?,?)', [result.insertId, score.R, score.I, score.A, score.S, score.E, score.C, JSON.stringify(flow.answers)]);
    for (let index=0; index<selected.length; index++) {
      const item = electives[flow.chosen_strand].find(entry => entry.key === selected[index]);
      await conn.query('INSERT INTO student_electives(enrollment_id,elective_key,elective_rank) VALUES(?,?,?)', [result.insertId, item.key, index+1]);
      await conn.query('INSERT INTO plan_of_study(enrollment_id,elective_key,elective_name,elective_rank,hours,track_type,cluster) VALUES(?,?,?,?,?,?,?)', [result.insertId, item.key, item.name, index+1, item.hours, item.track, item.cluster]);
    }
    await conn.commit();
    delete req.session.enroll;
    res.redirect(`/result/${result.insertId}`);
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
});

app.get('/result/:id', requireLogin, async (req, res) => {
  const ownership = req.session.user.role === 'student' ? 'AND s.user_id=?' : '';
  const params = req.session.user.role === 'student' ? [req.params.id, req.session.user.id] : [req.params.id];
  const [[enrollment]] = await pool.query(`SELECT e.*,r.score_r,r.score_i,r.score_a,r.score_s,r.score_e,r.score_c FROM enrollments e JOIN students s ON s.id=e.student_id JOIN riasec_results r ON r.enrollment_id=e.id WHERE e.id=? ${ownership}`, params);
  if (!enrollment) return res.sendStatus(404);
  res.render('enroll/result', { enrollment, compatibility:computeCompatibility({R:enrollment.score_r,I:enrollment.score_i,A:enrollment.score_a,S:enrollment.score_s,E:enrollment.score_e,C:enrollment.score_c}) });
});
app.get('/print/enrollment/:id', requireLogin, async (req, res) => {
  const ownership = req.session.user.role === 'student' ? 'AND s.user_id=?' : '';
  const params = req.session.user.role === 'student' ? [req.params.id, req.session.user.id] : [req.params.id];
  const [[row]] = await pool.query(`SELECT e.*,e.id AS enrollment_id,s.* FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.id=? ${ownership}`, params);
  if (!row) return res.sendStatus(404);
  for (const field of ['dl_modalities','sne_manifestations']) {
    if (typeof row[field] === 'string') try { row[field] = JSON.parse(row[field]); } catch { row[field] = []; }
    if (!Array.isArray(row[field])) row[field] = [];
  }
  res.render('enroll/print', { row });
});
app.get('/print/plan-of-study/:id', requireLogin, async (req, res) => {
  const ownership = req.session.user.role === 'student' ? 'AND s.user_id=?' : '';
  const params = req.session.user.role === 'student' ? [req.params.id, req.session.user.id] : [req.params.id];
  const [[row]] = await pool.query(`SELECT e.*,s.first_name,s.middle_name,s.last_name,s.lrn,s.jhs_graduated FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.id=? ${ownership}`, params);
  if (!row) return res.sendStatus(404);
  const [subjects] = await pool.query('SELECT * FROM plan_of_study WHERE enrollment_id=? ORDER BY elective_rank', [req.params.id]);
  res.render('enroll/plan', { row, subjects, catalog });
});

app.get('/admin/dashboard', requireStaff, async (req, res) => {
  const [[stats]] = await pool.query("SELECT COUNT(*) AS enrollments,SUM(status='Pending') AS pending,SUM(status='Confirmed') AS confirmed,SUM(status='Rejected') AS rejected FROM enrollments");
  const [[students]] = await pool.query('SELECT COUNT(*) AS total FROM students');
  const [recent] = await pool.query('SELECT e.*,s.first_name,s.last_name FROM enrollments e JOIN students s ON s.id=e.student_id ORDER BY e.created_at DESC LIMIT 10');
  res.render('admin/dashboard', { stats, students, recent });
});
app.get('/admin/students', requireStaff, async (req, res) => {
  const [students] = await pool.query('SELECT s.*,u.username,u.email FROM students s JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC');
  res.render('admin/students', { students });
});
app.get('/admin/enrollments', requireStaff, async (req, res) => {
  const [enrollments] = await pool.query('SELECT e.*,s.first_name,s.last_name,s.lrn FROM enrollments e JOIN students s ON s.id=e.student_id ORDER BY e.created_at DESC');
  res.render('admin/enrollments', { enrollments });
});
app.post('/admin/enrollments/:id/status', requireStaff, async (req, res) => {
  const status = ['Pending','Confirmed','Incomplete','Rejected'].includes(req.body.status) ? req.body.status : 'Pending';
  const override = strands.includes(req.body.strand) ? req.body.strand : null;
  await pool.query('UPDATE enrollments SET status=?,admin_strand_override=?,admin_override_reason=?,remarks=? WHERE id=?', [status, override, req.body.reason || null, req.body.remarks || null, req.params.id]);
  const [[enrollment]] = await pool.query('SELECT s.user_id FROM enrollments e JOIN students s ON s.id=e.student_id WHERE e.id=?', [req.params.id]);
  if (enrollment) await pool.query('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)', [enrollment.user_id, 'Enrollment updated', `Your enrollment status is now ${status}.`]);
  await pool.query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)', [req.session.user.id, 'update_status', 'enrollment', req.params.id, JSON.stringify({status,override})]);
  res.redirect('/admin/enrollments');
});
app.get('/admin/documents', requireStaff, async (req, res) => {
  const [documents] = await pool.query('SELECT d.*,r.name requirement,s.first_name,s.last_name FROM student_documents d JOIN requirements r ON r.id=d.requirement_id JOIN students s ON s.id=d.student_id ORDER BY d.created_at DESC');
  res.render('admin/documents', { documents });
});
app.post('/admin/documents/:id/status', requireStaff, async (req, res) => {
  const status = ['Submitted','Verified','Rejected'].includes(req.body.status) ? req.body.status : 'Submitted';
  await pool.query('UPDATE student_documents SET status=?,admin_note=?,verified_at=IF(?="Verified",NOW(),NULL),verified_by=? WHERE id=?', [status, req.body.admin_note || null, status, req.session.user.id, req.params.id]);
  const [[document]] = await pool.query('SELECT s.user_id,r.name FROM student_documents d JOIN students s ON s.id=d.student_id JOIN requirements r ON r.id=d.requirement_id WHERE d.id=?', [req.params.id]);
  if (document) await pool.query('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)', [document.user_id, 'Document reviewed', `${document.name} was marked ${status}.`]);
  await pool.query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)', [req.session.user.id, 'review_document', 'document', req.params.id, JSON.stringify({status})]);
  res.redirect('/admin/documents');
});
app.get('/admin/requirements', requireAdmin, async (req, res) => {
  const [requirements] = await pool.query('SELECT * FROM requirements ORDER BY name');
  res.render('admin/requirements', { requirements });
});
app.post('/admin/requirements', requireAdmin, async (req, res) => {
  if (!String(req.body.name || '').trim()) return res.status(400).send('Requirement name is required.');
  await pool.query('INSERT INTO requirements(name,description,is_required,is_active) VALUES(?,?,?,1)', [req.body.name.trim(), req.body.description || null, req.body.is_required ? 1 : 0]);
  await pool.query('INSERT INTO audit_logs(user_id,action,entity_type,details) VALUES(?,?,?,?)', [req.session.user.id, 'create_requirement', 'requirement', JSON.stringify({name:req.body.name.trim()})]);
  res.redirect('/admin/requirements');
});
app.post('/admin/requirements/:id/toggle', requireAdmin, async (req, res) => {
  await pool.query('UPDATE requirements SET is_active=NOT is_active WHERE id=?', [req.params.id]);
  res.redirect('/admin/requirements');
});
app.get('/admin/users', requireAdmin, async (req, res) => {
  const [users] = await pool.query('SELECT id,username,email,role,created_at FROM users ORDER BY created_at DESC');
  res.render('admin/users', { users });
});
app.post('/admin/users/:id/role', requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.session.user.id) return res.status(400).send('You cannot change your own role.');
  if (!['student','teacher','registrar','admin'].includes(req.body.role)) return res.status(400).send('Invalid role.');
  await pool.query('UPDATE users SET role=? WHERE id=?', [req.body.role, req.params.id]);
  await pool.query('INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)', [req.session.user.id, 'change_role', 'user', req.params.id, JSON.stringify({role:req.body.role})]);
  res.redirect('/admin/users');
});
app.get('/admin/audit', requireAdmin, async (req, res) => {
  const [logs] = await pool.query('SELECT a.*,u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200');
  res.render('admin/audit', { logs });
});

app.use((error, req, res, next) => { console.error(error); res.status(500).send('Server error'); });
app.listen(port, () => console.log(`Luna NHS running on http://localhost:${port}`));
