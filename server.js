require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "polls.json");
const USERS_FILE = path.join(__dirname, "users.json");
const JWT_SECRET = process.env.JWT_SECRET;

// Rate Limiter für Login & Registrierung (5 Versuche pro Minute pro IP)
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 Minute
  max: 5, // Maximal 5 Requests pro Minute
  message: { error: "Zu viele Versuche, bitte warte kurz." },
});

function sanitize(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    return jwt.verify(authHeader, JWT_SECRET);
  } catch {
    return null;
  }
}

function loadPolls() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function savePolls(polls) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(polls, null, 2));
}
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.use(cors());
app.use(bodyParser.json());

// GET /api/polls – Alle Abstimmungen (ohne VotesByUser)
app.get("/api/polls", (req, res) => {
  const polls = loadPolls();
  res.json(polls.map(({ votesByUser, ...rest }) => rest));
});

// GET /api/polls/:id – Abstimmung-Details inkl. Ergebnisse
app.get("/api/polls/:id", (req, res) => {
  const polls = loadPolls();
  const poll = polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: "Not found" });
  res.json(poll);
});

// POST /api/polls – Neue Abstimmung anlegen (inkl. Multiple-Choice)
app.post("/api/polls", (req, res) => {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Nicht eingeloggt" });

  const { title, description, options, multiple } = req.body;
  if (!title || !Array.isArray(options) || options.length < 2)
    return res.status(400).json({ error: "Ungültige Daten" });

  const polls = loadPolls();
  const id = (Date.now() + Math.random()).toString(36);
  const createdAt = new Date().toISOString();
  const poll = {
    id,
    title: sanitize(title),
    description: sanitize(description || ""),
    createdAt,
    creator: sanitize(payload.username),
    options: options.map((opt, idx) => ({
      id: idx.toString(),
      text: sanitize(typeof opt === "string" ? opt : opt.text),
      votes: 0,
    })),
    multiple: !!multiple,
    votesByUser: {},
  };

  polls.push(poll);
  savePolls(polls);
  res.status(201).json(poll);
});

// POST /api/polls/:id/vote – Stimme abgeben (Single/Multiple möglich)
app.post("/api/polls/:id/vote", (req, res) => {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Nicht eingeloggt" });

  const { optionIds } = req.body;
  if (!optionIds || !Array.isArray(optionIds) || optionIds.length === 0)
    return res.status(400).json({ error: "Keine Option gewählt" });

  const polls = loadPolls();
  const poll = polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: "Nicht gefunden" });

  // VotesByUser initialisieren, falls noch nicht da:
  if (!poll.votesByUser) poll.votesByUser = {};

  // 1. Alte Stimme entfernen (falls schon abgestimmt)
  const prev = poll.votesByUser[payload.username];
  if (prev) {
    // prev ist ein Array (Multiple-Choice) oder String (Single-Choice)
    (Array.isArray(prev) ? prev : [prev]).forEach((prevId) => {
      const o = poll.options.find((opt) => opt.id === prevId);
      if (o) o.votes = Math.max((o.votes || 0) - 1, 0);
    });
  }

  // 2. Neue Stimme zählen
  poll.options.forEach((opt) => {
    if (optionIds.includes(opt.id)) opt.votes = (opt.votes || 0) + 1;
  });

  // 3. User -> aktuelle Auswahl speichern
  poll.votesByUser[payload.username] = poll.multiple ? optionIds : optionIds[0];

  savePolls(polls);
  res.json({ success: true });
});

// Registrierung (mit Rate Limiting und starker Passwortprüfung)
app.post("/api/register", authLimiter, (req, res) => {
  const { username, email, password, avatarUrl } = req.body;

  // Username prüfen
  if (!username || username.length > 12 || /\s/.test(username))
    return res.status(400).json({ error: "Benutzername ungültig" });

  // Passwort-Validierung (sicher!)
  if (
    !password ||
    password.length < 12 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return res.status(400).json({
      error:
        "Passwort unsicher. Mindestens 12 Zeichen, Groß-/Kleinbuchstabe und Zahl!",
    });
  }

  let users = loadUsers();
  if (users.some((u) => u.email === email))
    return res.status(409).json({ error: "E-Mail existiert schon" });

  if (users.some((u) => u.username === username))
    return res.status(409).json({ error: "Benutzername existiert schon" });

  const hash = bcrypt.hashSync(password, 8);

  // avatarUrl speichern (leer wenn nicht angegeben)
  const user = {
    username: sanitize(username),
    email,
    password: hash,
    avatarUrl: avatarUrl || "",
  };

  users.push(user);
  saveUsers(users);
  res.status(201).json({ success: true });
});

// Login (mit Rate Limiting)
app.post("/api/login", authLimiter, (req, res) => {
  const { email, password } = req.body;
  let users = loadUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(401).json({ error: "Login fehlgeschlagen" });

  if (!bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Login fehlgeschlagen" });

  // JWT-Token erzeugen
  const token = jwt.sign(
    { username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
  // avatarUrl mitgeben
  res.json({ token, username: user.username, avatarUrl: user.avatarUrl || "" });
});

// DELETE /api/polls/:id – Abstimmung löschen (nur für den Ersteller)
app.delete("/api/polls/:id", (req, res) => {
  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Nicht eingeloggt" });

  const polls = loadPolls();
  const poll = polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ error: "Nicht gefunden" });

  if (poll.creator !== payload.username) {
    return res.status(403).json({ error: "Nur der Ersteller darf löschen!" });
  }

  const updated = polls.filter((p) => p.id !== req.params.id);
  savePolls(updated);
  res.json({ success: true });
});

// Statische Files für das Frontend
app.use(express.static(path.join(__dirname, "dist")));

app.listen(PORT, () => {
  console.log(`Vote-API läuft auf http://localhost:${PORT}/api/polls`);
});
