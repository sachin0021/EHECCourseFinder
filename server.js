import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.set("etag", false);
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersByEmail = new Map();
const usersById = new Map();
let nextUserId = 1;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => done(null, usersById.get(id) || null));

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback",
      },
      (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) return done(new Error("Google account has no email"));

        let user = usersByEmail.get(email);
        if (!user) {
          user = {
            id: String(nextUserId++),
            email,
            name: profile.displayName || email,
            provider: "google",
          };
          usersByEmail.set(email, user);
          usersById.set(user.id, user);
        }

        return done(null, user);
      }
    )
  );
}

app.use(passport.initialize());
app.use(passport.session());

const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Unauthorized" });
};

app.post("/auth/signup", async (req, res) => {
  const { email, password, name } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !password || password.length < 6) {
    return res.status(400).json({ error: "Provide valid email and password (min 6 chars)." });
  }

  if (usersByEmail.has(normalizedEmail)) {
    return res.status(409).json({ error: "User already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: String(nextUserId++),
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail,
    provider: "local",
    passwordHash,
  };
  usersByEmail.set(normalizedEmail, user);
  usersById.set(user.id, user);

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: "Failed to create session." });
    return res.json({ user: { email: user.email, name: user.name, provider: user.provider } });
  });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const user = usersByEmail.get(normalizedEmail);

  if (!user || user.provider !== "local") {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const ok = await bcrypt.compare(String(password || ""), user.passwordHash || "");
  if (!ok) return res.status(401).json({ error: "Invalid credentials." });

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: "Failed to create session." });
    return res.json({ user: { email: user.email, name: user.name, provider: user.provider } });
  });
});

app.post("/auth/forgot-password", async (req, res) => {
  const { email, newPassword } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const password = String(newPassword || "");
  const user = usersByEmail.get(normalizedEmail);

  if (!user || user.provider !== "local") {
    return res.status(404).json({ error: "No local account found for this email." });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  usersByEmail.set(normalizedEmail, user);
  usersById.set(user.id, user);

  return res.json({ ok: true });
});

app.get("/auth/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).send("Google OAuth is not configured on server.");
  }
  return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/?auth=failed" }), (_req, res) => {
  res.redirect("/");
});

app.post("/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

app.get("/auth/me", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
  const { email, name, provider } = req.user;
  return res.json({ user: { email, name, provider } });
});

app.use(express.static(__dirname));
app.get("/data/courses.csv", requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, "data", "courses.csv"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
