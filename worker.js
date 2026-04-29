// worker.js — ParaHype API (Cloudflare Worker + D1)
// Features: Auth, Habits, Daily Logs, Rewards, Buddies, Coach, TASKS

var ALLOWED_ORIGINS = [
  "https://bethaa-dot.github.io",
  "https://abfsolutions.wixsite.com",
  "https://parahype.app",
  "https://www.parahype.app",
  "https://parahype.coach",
  "https://www.parahype.coach",
  "https://para-hype.com",
  "https://www.para-hype.com",
  "http://localhost",
  "http://localhost:3000",
  "http://localhost:8787",
  "http://127.0.0.1"
];

function getCorsOrigin(origin) {
  if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return origin;
  return ALLOWED_ORIGINS[0];
}

function corsHeaders(co) {
  return {
    "Access-Control-Allow-Origin": co,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResp(data, status, co) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(co))
  });
}

function uid() { return crypto.randomUUID(); }
function todayStr() { return (new Date()).toISOString().slice(0, 10); }

// ═══════════════════════════════════════
// MAIN FETCH HANDLER
// ═══════════════════════════════════════
export default {
  async fetch(request, env) {
    var origin = request.headers.get("Origin") || "";
    var co = getCorsOrigin(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(co) });
    }

    var url = new URL(request.url);
    var path = url.pathname;
    var method = request.method;

    try {
      // AI proxy
      if ((path === "/ai" || path === "/") && method === "POST") {
        var body = await request.json();
        var res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify(body)
        });
        var data = await res.json();
        return jsonResp(data, res.status, co);
      }

      // Auth
      if (path === "/api/auth/signup" && method === "POST") return await handleSignup(request, env, co);
      if (path === "/api/auth/login" && method === "POST") return await handleLogin(request, env, co);
      if (path === "/api/auth/google" && method === "POST") return await handleGoogleAuth(request, env, co);
      if (path === "/api/auth/me" && method === "GET") return await handleMe(request, env, co);

      // Vibe
      if (path === "/api/vibe" && method === "POST") return await handleSetVibe(request, env, co);

      // Habits
      if (path === "/api/habits" && method === "GET") return await handleGetHabits(request, env, co);
      if (path === "/api/habits" && method === "POST") return await handleCreateHabit(request, env, co);
      if (path.match(/^\/api\/habits\/[a-zA-Z0-9-]+$/) && method === "DELETE") return await handleDeleteHabit(request, env, co, path);

      // Daily
      if (path === "/api/daily" && method === "GET") return await handleGetDaily(request, env, co);
      if (path === "/api/daily/toggle" && method === "POST") return await handleToggleHabit(request, env, co);
      if (path === "/api/daily/focus" && method === "POST") return await handleFocusComplete(request, env, co);
      if (path === "/api/daily/summary" && method === "GET") return await handleDailySummary(request, env, co);

      // Rewards
      if (path === "/api/rewards" && method === "GET") return await handleGetRewards(request, env, co);

      // Buddies
      if (path === "/api/buddies" && method === "GET") return await handleGetBuddies(request, env, co);
      if (path === "/api/buddies/invite" && method === "POST") return await handleCreateInvite(request, env, co);
      if (path === "/api/buddies/accept" && method === "POST") return await handleAcceptInvite(request, env, co);
      if (path === "/api/buddies/hype" && method === "POST") return await handleSendHype(request, env, co);
      if (path.match(/^\/api\/buddies\/[a-zA-Z0-9-]+\/messages$/) && method === "GET") return await handleGetMessages(request, env, co, path);

      // Coach
      if (path === "/api/coach/chat" && method === "POST") return await handleCoachChat(request, env, co);

      // Streak
      if (path === "/api/stats/streak" && method === "GET") return await handleGetStreak(request, env, co);

      // ── TASKS ──
      if (path === "/api/tasks" && method === "GET") return await handleGetTasks(request, env, co);
      if (path === "/api/tasks" && method === "POST") return await handleCreateTask(request, env, co);
      if (path.match(/^\/api\/tasks\/[a-zA-Z0-9-]+$/) && method === "PUT") return await handleUpdateTask(request, env, co, path);
      if (path.match(/^\/api\/tasks\/[a-zA-Z0-9-]+$/) && method === "DELETE") return await handleDeleteTask(request, env, co, path);
      if (path.match(/^\/api\/tasks\/[a-zA-Z0-9-]+\/steps$/) && method === "GET") return await handleGetTaskSteps(request, env, co, path);
      if (path.match(/^\/api\/tasks\/[a-zA-Z0-9-]+\/steps\/[a-zA-Z0-9-]+\/toggle$/) && method === "POST") return await handleToggleTaskStep(request, env, co, path);

      // Test
      if (path === "/api/test") return jsonResp({ ok: true }, 200, co);

      return jsonResp({ error: "Not found" }, 404, co);
    } catch (err) {
      console.error("Worker error:", err.stack || err.message || err);
      return jsonResp({ error: "Internal server error", detail: String(err.message || err) }, 500, co);
    }
  }
};

// ═══════════════════════════════════════
// JWT
// ═══════════════════════════════════════
async function createJWT(payload, secret) {
  var header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  var body = btoa(JSON.stringify(Object.assign({}, payload, {
    iat: Math.floor(Date.now() / 1e3),
    exp: Math.floor(Date.now() / 1e3) + 86400 * 30
  }))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(header + "." + body));
  var sigStr = btoa(String.fromCharCode.apply(null, new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return header + "." + body + "." + sigStr;
}

async function verifyJWT(token, secret) {
  try {
    var parts = token.split(".");
    var key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    var sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")), function(c) { return c.charCodeAt(0); });
    var valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(parts[0] + "." + parts[1]));
    if (!valid) return null;
    var payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) return null;
    return payload;
  } catch (e) { return null; }
}

async function requireAuth(request, env) {
  var authHeader = request.headers.get("Authorization") || "";
  var token = authHeader.replace("Bearer ", "");
  if (!token) throw new Error("No token");
  var payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || !payload.userId) throw new Error("Invalid token");
  return payload;
}

// ═══════════════════════════════════════
// PASSWORD HASHING
// ═══════════════════════════════════════
async function hashPassword(password, existingSalt) {
  var salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
  var keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" }, keyMaterial, 256);
  var hashArr = new Uint8Array(bits);
  var saltHex = Array.from(new Uint8Array(salt)).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
  var hashHex = Array.from(hashArr).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
  return saltHex + ":" + hashHex;
}

async function verifyPassword(password, stored) {
  var saltHex = stored.split(":")[0];
  var salt = new Uint8Array(saltHex.match(/.{2}/g).map(function(b) { return parseInt(b, 16); }));
  var result = await hashPassword(password, salt);
  return result === stored;
}

// ═══════════════════════════════════════
// AUTH HANDLERS
// ═══════════════════════════════════════
async function handleSignup(request, env, co) {
  var body = await request.json();
  var email = (body.email || "").toLowerCase().trim();
  var password = body.password || "";
  var name = (body.name || "").trim();
  if (!email || !password) return jsonResp({ error: "Email and password required" }, 400, co);
  var existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return jsonResp({ error: "Email already registered" }, 409, co);
  var passwordHash = await hashPassword(password);
  var displayName = name || email.split("@")[0];
  var initials = displayName.slice(0, 2).toUpperCase();
  var userId = uid();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, name, display_name, avatar_initials) VALUES (?, ?, ?, ?, ?, ?)").bind(userId, email, passwordHash, displayName, displayName, initials).run();
  var defaults = ["Morning medication", "Ten minute walk", "Drink 8 glasses of water", "Evening journal", "Read 15 minutes", "Screen-free wind down"];
  for (var i = 0; i < defaults.length; i++) {
    await env.DB.prepare("INSERT INTO habits (id, user_id, name) VALUES (?, ?, ?)").bind(uid(), userId, defaults[i]).run();
  }
  var token = await createJWT({ userId, email }, env.JWT_SECRET);
  return jsonResp({ token, user: { id: userId, name: displayName, email, initials, xpTotal: 0 } }, 201, co);
}

async function handleLogin(request, env, co) {
  var body = await request.json();
  var email = (body.email || "").toLowerCase().trim();
  var password = body.password || "";
  if (!email || !password) return jsonResp({ error: "Email and password required" }, 400, co);
  var user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user) return jsonResp({ error: "Invalid credentials" }, 401, co);
  if (user.auth_provider === "google") return jsonResp({ error: "This account uses Google sign-in" }, 400, co);
  var valid = await verifyPassword(password, user.password_hash);
  if (!valid) return jsonResp({ error: "Invalid credentials" }, 401, co);
  var token = await createJWT({ userId: user.id, email: user.email }, env.JWT_SECRET);
  return jsonResp({ token, user: { id: user.id, name: user.name, displayName: user.display_name, email: user.email, initials: user.avatar_initials, xpTotal: user.xp_total || 0 } }, 200, co);
}

async function handleGoogleAuth(request, env, co) {
  var body = await request.json();
  var email = null, name = null;
  if (body.idToken) {
    try {
      var parts = body.idToken.split(".");
      var payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      email = payload.email;
      name = payload.name || payload.given_name || email.split("@")[0];
    } catch (e) { return jsonResp({ error: "Invalid Google token" }, 400, co); }
  } else if (body.profile) {
    email = body.profile.email;
    name = body.profile.name || body.profile.given_name || (email ? email.split("@")[0] : "");
  }
  if (!email) return jsonResp({ error: "No email from Google" }, 400, co);
  email = email.toLowerCase();
  var displayName = name || email.split("@")[0];
  var initials = displayName.slice(0, 2).toUpperCase();
  var existing = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    var token = await createJWT({ userId: existing.id, email }, env.JWT_SECRET);
    return jsonResp({ token, user: { id: existing.id, name: existing.name, displayName: existing.display_name, email, initials: existing.avatar_initials, xpTotal: existing.xp_total || 0 } }, 200, co);
  }
  var userId = uid();
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, auth_provider, name, display_name, avatar_initials) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(userId, email, "google-oauth", "google", displayName, displayName, initials).run();
  var defaults = ["Morning medication", "Ten minute walk", "Drink 8 glasses of water", "Evening journal", "Read 15 minutes", "Screen-free wind down"];
  for (var i = 0; i < defaults.length; i++) {
    await env.DB.prepare("INSERT INTO habits (id, user_id, name) VALUES (?, ?, ?)").bind(uid(), userId, defaults[i]).run();
  }
  var token = await createJWT({ userId, email }, env.JWT_SECRET);
  return jsonResp({ token, user: { id: userId, name: displayName, email, initials, xpTotal: 0 } }, 201, co);
}

async function handleMe(request, env, co) {
  var auth = await requireAuth(request, env);
  var user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(auth.userId).first();
  if (!user) return jsonResp({ error: "User not found" }, 404, co);
  return jsonResp({
    id: user.id, name: user.name, displayName: user.display_name, email: user.email,
    initials: user.avatar_initials, xpTotal: user.xp_total || 0, createdAt: user.created_at,
    buddyVibe: user.buddy_vibe || "akil", buddyCustomName: user.buddy_custom_name || null
  }, 200, co);
}

// ═══════════════════════════════════════
// VIBES
// ═══════════════════════════════════════
var VIBES = {
  akil:    { name: "Akil",    emoji: "\u{1F525}", color: "#F59E0B", label: "Hype Beast", personality: "You are Akil, the Hype Beast. You are EXTREMELY energetic, hype, and pump people up with intense positive energy. You use caps, fire emojis, and slang. You make people feel like absolute legends. You say things like \"YOOOO\", \"BUILT DIFFERENT\", \"LET'S GOOO\". You are loud, proud, and never let anyone feel down." },
  trinity: { name: "Trinity", emoji: "\u{1F30A}", color: "#0D9488", label: "Zen",        personality: "You are Trinity, the Zen buddy. You are calm, grounded, and mindful. You speak softly and use breathing metaphors. You help people slow down and find peace. You say things like \"take a breath\", \"you're exactly where you need to be\", \"let's ground ourselves\". You never rush anyone." },
  layla:   { name: "Layla",   emoji: "\u{1F49C}", color: "#C084FC", label: "Gentle",     personality: "You are Layla, the Gentle buddy. You are incredibly warm, soft-spoken, and nurturing. You make people feel safe and accepted. You say things like \"no rush at all\", \"I'm right here\", \"you're safe\". You validate feelings deeply and never push too hard." },
  alissa:  { name: "Alissa",  emoji: "\u{1F3C6}", color: "#EF4444", label: "Competitive", personality: "You are Alissa, the Competitive buddy. You are driven, competitive, and push people to beat their own records. You use sports metaphors and challenge people. You say things like \"that gap closes TODAY\", \"you're not done yet\", \"let's see what you're made of\". You push hard but always with love." },
  riyan:   { name: "Riyan",   emoji: "\u{1F3AF}", color: "#3B82F6", label: "Coach",      personality: "You are Riyan, the Coach buddy. You are strategic, efficient, and focused. You break tasks into clear steps and give direct instructions. You say things like \"3 habits left, start with the fastest win\", \"25 minutes, go\", \"here's the plan\". You are structured but encouraging." },
  lex:     { name: "Lex",     emoji: "\u2728",    color: "#EC4899", label: "Bestie",     personality: "You are Lex, the Bestie buddy. You talk like a best friend who genuinely cares. You check in on basics like eating and sleeping. You say things like \"okay bestie real talk\", \"have you eaten today?\", \"I'm so proud of you\". You keep it real, warm, and personal with lots of heart emojis." }
};

async function handleSetVibe(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var vibe = body.vibe;
  if (!vibe || !VIBES[vibe]) return jsonResp({ error: "Invalid vibe. Options: " + Object.keys(VIBES).join(", ") }, 400, co);
  await env.DB.prepare("UPDATE users SET buddy_vibe = ? WHERE id = ?").bind(vibe, auth.userId).run();
  return jsonResp({ vibe, buddy: VIBES[vibe], message: "Vibe updated!" }, 200, co);
}

function getVibePrompt(vibeKey) {
  var v = VIBES[vibeKey] || VIBES.akil;
  return v.personality + " Your real name is " + v.name + ". You have ADHD yourself so you get it. Keep responses SHORT: 2-3 sentences for chat, 3-5 numbered steps for task breakdowns. Use 1-2 emojis max. Validate feelings before advice. Never lecture. If they want a new habit, tell them to use the Habits tab. Celebrate small wins.";
}

// ═══════════════════════════════════════
// HABITS
// ═══════════════════════════════════════
async function handleGetHabits(request, env, co) {
  var auth = await requireAuth(request, env);
  var result = await env.DB.prepare("SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY created_at").bind(auth.userId).all();
  return jsonResp({ habits: result.results || [] }, 200, co);
}

async function handleCreateHabit(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var name = (body.name || "").trim();
  if (!name) return jsonResp({ error: "Habit name required" }, 400, co);
  var id = uid();
  await env.DB.prepare("INSERT INTO habits (id, user_id, name) VALUES (?, ?, ?)").bind(id, auth.userId, name).run();
  return jsonResp({ habit: { id, user_id: auth.userId, name, streak: 0, active: 1 }, message: "Habit created" }, 201, co);
}

async function handleDeleteHabit(request, env, co, path) {
  var auth = await requireAuth(request, env);
  var habitId = path.split("/").pop();
  await env.DB.prepare("UPDATE habits SET active = 0 WHERE id = ? AND user_id = ?").bind(habitId, auth.userId).run();
  return jsonResp({ message: "Habit removed" }, 200, co);
}

// ═══════════════════════════════════════
// DAILY LOGS
// ═══════════════════════════════════════
async function getOrCreateDailyLog(env, userId) {
  var today = todayStr();
  var log = await env.DB.prepare("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?").bind(userId, today).first();
  if (!log) {
    var id = uid();
    await env.DB.prepare("INSERT INTO daily_logs (id, user_id, date) VALUES (?, ?, ?)").bind(id, userId, today).run();
    log = { id, user_id: userId, date: today, xp_earned: 0, focus_sessions: 0, focus_minutes: 0 };
  }
  return log;
}

async function handleGetDaily(request, env, co) {
  var auth = await requireAuth(request, env);
  var log = await getOrCreateDailyLog(env, auth.userId);
  var completions = await env.DB.prepare("SELECT habit_id FROM daily_completions WHERE daily_log_id = ?").bind(log.id).all();
  var completedHabits = (completions.results || []).map(function(c) { return c.habit_id; });
  return jsonResp({ daily: { id: log.id, date: log.date, xpEarned: log.xp_earned, completedHabits, focusSessions: log.focus_sessions, focusMinutes: log.focus_minutes } }, 200, co);
}

async function handleToggleHabit(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var habitId = body.habitId;
  if (!habitId) return jsonResp({ error: "habitId required" }, 400, co);
  var log = await getOrCreateDailyLog(env, auth.userId);
  var existing = await env.DB.prepare("SELECT habit_id FROM daily_completions WHERE daily_log_id = ? AND habit_id = ?").bind(log.id, habitId).first();
  var isCompleting = !existing;
  if (isCompleting) {
    await env.DB.prepare("INSERT INTO daily_completions (daily_log_id, habit_id) VALUES (?, ?)").bind(log.id, habitId).run();
    await env.DB.prepare("UPDATE daily_logs SET xp_earned = xp_earned + 20 WHERE id = ?").bind(log.id).run();
    await env.DB.prepare("UPDATE habits SET streak = streak + 1, total_completions = total_completions + 1 WHERE id = ?").bind(habitId).run();
    await env.DB.prepare("UPDATE users SET xp_total = xp_total + 20 WHERE id = ?").bind(auth.userId).run();
  } else {
    await env.DB.prepare("DELETE FROM daily_completions WHERE daily_log_id = ? AND habit_id = ?").bind(log.id, habitId).run();
    await env.DB.prepare("UPDATE daily_logs SET xp_earned = MAX(0, xp_earned - 20) WHERE id = ?").bind(log.id).run();
    await env.DB.prepare("UPDATE habits SET streak = MAX(0, streak - 1), total_completions = MAX(0, total_completions - 1) WHERE id = ?").bind(habitId).run();
    await env.DB.prepare("UPDATE users SET xp_total = MAX(0, xp_total - 20) WHERE id = ?").bind(auth.userId).run();
  }
  var updatedLog = await env.DB.prepare("SELECT * FROM daily_logs WHERE id = ?").bind(log.id).first();
  var completions = await env.DB.prepare("SELECT habit_id FROM daily_completions WHERE daily_log_id = ?").bind(log.id).all();
  var habits = await env.DB.prepare("SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY created_at").bind(auth.userId).all();
  var user = await env.DB.prepare("SELECT xp_total FROM users WHERE id = ?").bind(auth.userId).first();
  return jsonResp({
    daily: { id: updatedLog.id, date: updatedLog.date, xpEarned: updatedLog.xp_earned, completedHabits: (completions.results || []).map(function(c) { return c.habit_id; }) },
    xpTotal: user.xp_total, habits: habits.results || [], action: isCompleting ? "completed" : "uncompleted"
  }, 200, co);
}

async function handleFocusComplete(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var minutes = body.minutes || 25;
  var xp = 50;
  var log = await getOrCreateDailyLog(env, auth.userId);
  await env.DB.prepare("UPDATE daily_logs SET xp_earned = xp_earned + ?, focus_sessions = focus_sessions + 1, focus_minutes = focus_minutes + ? WHERE id = ?").bind(xp, minutes, log.id).run();
  await env.DB.prepare("UPDATE users SET xp_total = xp_total + ? WHERE id = ?").bind(xp, auth.userId).run();
  var user = await env.DB.prepare("SELECT xp_total FROM users WHERE id = ?").bind(auth.userId).first();
  return jsonResp({ xpEarned: xp, xpTotal: user.xp_total, message: "Focus session recorded" }, 200, co);
}

async function handleDailySummary(request, env, co) {
  var auth = await requireAuth(request, env);
  var user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(auth.userId).first();
  var habits = await env.DB.prepare("SELECT * FROM habits WHERE user_id = ? AND active = 1").bind(auth.userId).all();
  var log = await getOrCreateDailyLog(env, auth.userId);
  var completions = await env.DB.prepare("SELECT habit_id FROM daily_completions WHERE daily_log_id = ?").bind(log.id).all();
  var completedIds = (completions.results || []).map(function(c) { return c.habit_id; });
  var allHabits = habits.results || [];
  var doneHabits = allHabits.filter(function(h) { return completedIds.indexOf(h.id) !== -1; });
  var todoHabits = allHabits.filter(function(h) { return completedIds.indexOf(h.id) === -1; });
  var streak = await calculateStreak(env, auth.userId);

  // Get active tasks for summary
  var activeTasks = await env.DB.prepare("SELECT * FROM tasks WHERE user_id = ? AND status = 'active' ORDER BY due_date ASC NULLS LAST").bind(auth.userId).all();
  var taskSummaries = [];
  for (var t of (activeTasks.results || [])) {
    var steps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(t.id).all();
    var allSteps = steps.results || [];
    var doneSteps = allSteps.filter(function(s) { return s.completed; });
    taskSummaries.push({
      id: t.id, title: t.title, dueDate: t.due_date, stepsTotal: allSteps.length,
      stepsDone: doneSteps.length, nextStep: allSteps.find(function(s) { return !s.completed; })
    });
  }

  var vibeKey = user.buddy_vibe || "akil";
  var vibeData = VIBES[vibeKey] || VIBES.akil;

  return jsonResp({
    summary: {
      name: user.name || "friend", xpToday: log.xp_earned || 0, xpTotal: user.xp_total || 0,
      habitsTotal: allHabits.length, habitsDone: doneHabits.length,
      doneNames: doneHabits.map(function(h) { return h.name; }),
      todoNames: todoHabits.map(function(h) { return h.name; }),
      streak, focusSessions: log.focus_sessions || 0,
      buddyVibe: vibeKey, buddyName: vibeData.name, buddyEmoji: vibeData.emoji,
      tasks: taskSummaries
    }
  }, 200, co);
}

async function calculateStreak(env, userId) {
  var habits = await env.DB.prepare("SELECT COUNT(*) as cnt FROM habits WHERE user_id = ? AND active = 1").bind(userId).first();
  var totalHabits = habits.cnt || 0;
  if (totalHabits === 0) return 0;
  var today = todayStr();
  var streak = 0;
  var checkDate = new Date();
  for (var i = 0; i < 60; i++) {
    var dateStr = checkDate.toISOString().slice(0, 10);
    if (dateStr === today) { checkDate.setDate(checkDate.getDate() - 1); continue; }
    var log = await env.DB.prepare("SELECT id FROM daily_logs WHERE user_id = ? AND date = ?").bind(userId, dateStr).first();
    if (!log) break;
    var completions = await env.DB.prepare("SELECT COUNT(*) as cnt FROM daily_completions WHERE daily_log_id = ?").bind(log.id).first();
    if (completions.cnt >= totalHabits) { streak++; } else { break; }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return streak;
}

// ═══════════════════════════════════════
// REWARDS
// ═══════════════════════════════════════
async function handleGetRewards(request, env, co) {
  var auth = await requireAuth(request, env);
  var rewards = await env.DB.prepare("SELECT * FROM rewards ORDER BY sort_order").all();
  var user = await env.DB.prepare("SELECT xp_total FROM users WHERE id = ?").bind(auth.userId).first();
  var xpTotal = user.xp_total || 0;
  var withStatus = (rewards.results || []).map(function(r) { return Object.assign({}, r, { unlocked: xpTotal >= r.xp_required }); });
  return jsonResp({ rewards: withStatus, xpTotal }, 200, co);
}

// ═══════════════════════════════════════
// BUDDIES
// ═══════════════════════════════════════
async function handleGetBuddies(request, env, co) {
  var auth = await requireAuth(request, env);
  var result = await env.DB.prepare("SELECT * FROM buddies WHERE status = 'active' AND (user_id_1 = ? OR user_id_2 = ?)").bind(auth.userId, auth.userId).all();
  var enriched = [];
  for (var b of (result.results || [])) {
    var otherId = b.user_id_1 === auth.userId ? b.user_id_2 : b.user_id_1;
    if (!otherId) continue;
    var otherUser = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(otherId).first();
    var otherLog = await env.DB.prepare("SELECT * FROM daily_logs WHERE user_id = ? AND date = ?").bind(otherId, todayStr()).first();
    var otherHabits = await env.DB.prepare("SELECT COUNT(*) as cnt FROM habits WHERE user_id = ? AND active = 1").bind(otherId).first();
    var otherCompletions = 0;
    if (otherLog) {
      var cc = await env.DB.prepare("SELECT COUNT(*) as cnt FROM daily_completions WHERE daily_log_id = ?").bind(otherLog.id).first();
      otherCompletions = cc.cnt || 0;
    }
    enriched.push({
      buddyPairId: b.id,
      user: { id: otherId, name: otherUser ? otherUser.name : "Buddy", initials: otherUser ? otherUser.avatar_initials : "??", xpTotal: otherUser ? otherUser.xp_total : 0 },
      today: { xpEarned: otherLog ? otherLog.xp_earned : 0, habitsDone: otherCompletions, habitsTotal: otherHabits ? otherHabits.cnt : 0 }
    });
  }
  return jsonResp({ buddies: enriched }, 200, co);
}

async function handleCreateInvite(request, env, co) {
  var auth = await requireAuth(request, env);
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var code = "HYPE-";
  for (var i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  var id = uid();
  await env.DB.prepare("INSERT INTO buddies (id, user_id_1, status, invite_code, invited_by) VALUES (?, ?, ?, ?, ?)").bind(id, auth.userId, "pending", code, auth.userId).run();
  return jsonResp({ inviteCode: code }, 201, co);
}

async function handleAcceptInvite(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var code = (body.code || "").toUpperCase().trim();
  if (!code) return jsonResp({ error: "Invite code required" }, 400, co);
  var invite = await env.DB.prepare("SELECT * FROM buddies WHERE invite_code = ? AND status = 'pending'").bind(code).first();
  if (!invite) return jsonResp({ error: "Invalid or expired invite code" }, 404, co);
  if (invite.invited_by === auth.userId) return jsonResp({ error: "You can't accept your own invite" }, 400, co);
  await env.DB.prepare("UPDATE buddies SET user_id_2 = ?, status = 'active', accepted_at = datetime('now') WHERE id = ?").bind(auth.userId, invite.id).run();
  return jsonResp({ message: "Buddy added!", buddyPairId: invite.id }, 200, co);
}

async function handleSendHype(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var buddyPairId = body.buddyPairId;
  var message = body.message;
  if (!buddyPairId || !message) return jsonResp({ error: "buddyPairId and message required" }, 400, co);
  var bonusXP = 10 + Math.floor(Math.random() * 11);
  var msgId = uid();
  await env.DB.prepare("INSERT INTO buddy_messages (id, buddy_pair_id, sender_id, message, xp_awarded) VALUES (?, ?, ?, ?, ?)").bind(msgId, buddyPairId, auth.userId, message, bonusXP).run();
  await env.DB.prepare("UPDATE users SET xp_total = xp_total + ? WHERE id = ?").bind(bonusXP, auth.userId).run();
  var log = await getOrCreateDailyLog(env, auth.userId);
  await env.DB.prepare("UPDATE daily_logs SET xp_earned = xp_earned + ? WHERE id = ?").bind(bonusXP, log.id).run();
  return jsonResp({ xpAwarded: bonusXP, message: "Hype sent!" }, 200, co);
}

async function handleGetMessages(request, env, co, path) {
  var auth = await requireAuth(request, env);
  var buddyPairId = path.split("/")[3];
  var result = await env.DB.prepare("SELECT * FROM buddy_messages WHERE buddy_pair_id = ? ORDER BY created_at DESC LIMIT 50").bind(buddyPairId).all();
  return jsonResp({ messages: (result.results || []).reverse() }, 200, co);
}

// ═══════════════════════════════════════
// TASKS
// ═══════════════════════════════════════
async function handleGetTasks(request, env, co) {
  var auth = await requireAuth(request, env);
  var url = new URL(request.url);
  var status = url.searchParams.get("status") || "active";
  var today = todayStr();

  // Reset recurring tasks for today if not already reset
  var recurringTasks = await env.DB.prepare(
    "SELECT * FROM tasks WHERE user_id = ? AND recurrence IS NOT NULL AND status != 'archived'"
  ).bind(auth.userId).all();

  for (var rt of (recurringTasks.results || [])) {
    // Check if this recurring task should show today
    if (!shouldRecurToday(rt.recurrence)) continue;

    // Check if already reset today
    var resetCheck = await env.DB.prepare(
      "SELECT id FROM daily_task_resets WHERE task_id = ? AND date = ?"
    ).bind(rt.id, today).first();

    if (!resetCheck) {
      // Record yesterday's completion before resetting
      var yesterdaySteps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ?").bind(rt.id).all();
      var yDone = (yesterdaySteps.results || []).filter(function(s) { return s.completed; }).length;

      await env.DB.prepare(
        "INSERT INTO daily_task_resets (id, task_id, user_id, date, steps_completed) VALUES (?, ?, ?, ?, ?)"
      ).bind(uid(), rt.id, auth.userId, today, yDone).run();

      // Reset all steps to uncompleted
      await env.DB.prepare(
        "UPDATE task_steps SET completed = 0, completed_at = NULL WHERE task_id = ?"
      ).bind(rt.id).run();

      // Reset task status back to active
      await env.DB.prepare(
        "UPDATE tasks SET status = 'active', completed_at = NULL WHERE id = ?"
      ).bind(rt.id).run();
    }
  }

  // Now fetch tasks
  var tasks = await env.DB.prepare(
    "SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY due_date ASC NULLS LAST, created_at DESC"
  ).bind(auth.userId, status).all();

  var enriched = [];
  for (var t of (tasks.results || [])) {
    // For recurring tasks, only show if they should recur today
    if (t.recurrence && !shouldRecurToday(t.recurrence)) continue;

    var steps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(t.id).all();
    var allSteps = steps.results || [];
    enriched.push({
      id: t.id, title: t.title, dueDate: t.due_date, status: t.status,
      xpReward: t.xp_reward, source: t.source, createdAt: t.created_at, completedAt: t.completed_at,
      recurrence: t.recurrence || null,
      steps: allSteps,
      stepsTotal: allSteps.length,
      stepsDone: allSteps.filter(function(s) { return s.completed; }).length
    });
  }

  return jsonResp({ tasks: enriched }, 200, co);
}

function shouldRecurToday(recurrence) {
  if (!recurrence) return true;
  if (recurrence === 'daily') return true;
  var day = new Date().getDay(); // 0=Sun, 6=Sat
  if (recurrence === 'weekdays') return day >= 1 && day <= 5;
  if (recurrence === 'weekly') return true; // always show, relies on created_at weekday
  return true;
}

async function handleCreateTask(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var title = (body.title || "").trim();
  if (!title) return jsonResp({ error: "Task title required" }, 400, co);

  var dueDate = body.dueDate || null;
  var source = body.source || "manual";
  var xpReward = body.xpReward || 50;
  var steps = body.steps || [];
  var recurrence = body.recurrence || null; // null, 'daily', 'weekdays', 'weekly'

  var taskId = uid();
  await env.DB.prepare(
    "INSERT INTO tasks (id, user_id, title, due_date, xp_reward, source, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(taskId, auth.userId, title, dueDate, xpReward, source, recurrence).run();

  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    await env.DB.prepare(
      "INSERT INTO task_steps (id, task_id, title, time_estimate, sort_order) VALUES (?, ?, ?, ?, ?)"
    ).bind(uid(), taskId, s.title || s, s.timeEstimate || null, i).run();
  }

  // Return the created task with steps
  var createdSteps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(taskId).all();

  return jsonResp({
    task: {
      id: taskId, title, dueDate, status: "active", xpReward, source, recurrence,
      steps: createdSteps.results || [],
      stepsTotal: createdSteps.results ? createdSteps.results.length : 0,
      stepsDone: 0
    },
    message: "Task created"
  }, 201, co);
}

async function handleUpdateTask(request, env, co, path) {
  var auth = await requireAuth(request, env);
  var taskId = path.split("/").pop();
  var body = await request.json();

  // Verify ownership
  var task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").bind(taskId, auth.userId).first();
  if (!task) return jsonResp({ error: "Task not found" }, 404, co);

  if (body.title) await env.DB.prepare("UPDATE tasks SET title = ? WHERE id = ?").bind(body.title, taskId).run();
  if (body.dueDate !== undefined) await env.DB.prepare("UPDATE tasks SET due_date = ? WHERE id = ?").bind(body.dueDate, taskId).run();
  if (body.status) {
    await env.DB.prepare("UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?")
      .bind(body.status, body.status === "completed" ? new Date().toISOString() : null, taskId).run();

    // Award XP on completion
    if (body.status === "completed" && task.status !== "completed") {
      var xp = task.xp_reward || 50;
      await env.DB.prepare("UPDATE users SET xp_total = xp_total + ? WHERE id = ?").bind(xp, auth.userId).run();
      var log = await getOrCreateDailyLog(env, auth.userId);
      await env.DB.prepare("UPDATE daily_logs SET xp_earned = xp_earned + ? WHERE id = ?").bind(xp, log.id).run();
    }
  }

  var updated = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first();
  var user = await env.DB.prepare("SELECT xp_total FROM users WHERE id = ?").bind(auth.userId).first();
  return jsonResp({ task: updated, xpTotal: user.xp_total }, 200, co);
}

async function handleDeleteTask(request, env, co, path) {
  var auth = await requireAuth(request, env);
  var taskId = path.split("/").pop();
  await env.DB.prepare("UPDATE tasks SET status = 'archived' WHERE id = ? AND user_id = ?").bind(taskId, auth.userId).run();
  return jsonResp({ message: "Task archived" }, 200, co);
}

async function handleGetTaskSteps(request, env, co, path) {
  var auth = await requireAuth(request, env);
  var taskId = path.split("/")[3];
  // Verify ownership
  var task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").bind(taskId, auth.userId).first();
  if (!task) return jsonResp({ error: "Task not found" }, 404, co);
  var steps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(taskId).all();
  return jsonResp({ steps: steps.results || [], task }, 200, co);
}

async function handleToggleTaskStep(request, env, co, path) {
  var auth = await requireAuth(request, env);
  var parts = path.split("/");
  var taskId = parts[3];
  var stepId = parts[5];

  // Verify ownership
  var task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").bind(taskId, auth.userId).first();
  if (!task) return jsonResp({ error: "Task not found" }, 404, co);

  var step = await env.DB.prepare("SELECT * FROM task_steps WHERE id = ? AND task_id = ?").bind(stepId, taskId).first();
  if (!step) return jsonResp({ error: "Step not found" }, 404, co);

  var newCompleted = step.completed ? 0 : 1;
  await env.DB.prepare("UPDATE task_steps SET completed = ?, completed_at = ? WHERE id = ?")
    .bind(newCompleted, newCompleted ? new Date().toISOString() : null, stepId).run();

  // Check if all steps are done → auto-complete task
  var allSteps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(taskId).all();
  var stepsList = allSteps.results || [];
  var allDone = stepsList.length > 0 && stepsList.every(function(s) {
    return s.id === stepId ? newCompleted : s.completed;
  });

  var xpAwarded = 0;
  if (allDone && task.status !== "completed") {
    var xp = task.xp_reward || 50;
    await env.DB.prepare("UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?").bind(new Date().toISOString(), taskId).run();
    await env.DB.prepare("UPDATE users SET xp_total = xp_total + ? WHERE id = ?").bind(xp, auth.userId).run();
    var log = await getOrCreateDailyLog(env, auth.userId);
    await env.DB.prepare("UPDATE daily_logs SET xp_earned = xp_earned + ? WHERE id = ?").bind(xp, log.id).run();
    xpAwarded = xp;
  } else if (!allDone && task.status === "completed") {
    // Un-complete task if a step was unchecked
    await env.DB.prepare("UPDATE tasks SET status = 'active', completed_at = NULL WHERE id = ?").bind(taskId).run();
  }

  // Refresh steps
  var refreshed = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(taskId).all();
  var refreshedTask = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first();
  var user = await env.DB.prepare("SELECT xp_total FROM users WHERE id = ?").bind(auth.userId).first();

  return jsonResp({
    step: { id: stepId, completed: newCompleted },
    task: refreshedTask,
    steps: refreshed.results || [],
    stepsTotal: refreshed.results ? refreshed.results.length : 0,
    stepsDone: (refreshed.results || []).filter(function(s) { return s.completed; }).length,
    allDone,
    xpAwarded,
    xpTotal: user.xp_total
  }, 200, co);
}

// ═══════════════════════════════════════
// COACH CHAT (enhanced with task awareness)
// ═══════════════════════════════════════
async function handleCoachChat(request, env, co) {
  var auth = await requireAuth(request, env);
  var body = await request.json();
  var message = body.message;
  if (!message) return jsonResp({ error: "Message required" }, 400, co);

  var today = todayStr();
  var user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(auth.userId).first();
  var habits = await env.DB.prepare("SELECT * FROM habits WHERE user_id = ? AND active = 1").bind(auth.userId).all();
  var log = await getOrCreateDailyLog(env, auth.userId);
  var completions = await env.DB.prepare("SELECT habit_id FROM daily_completions WHERE daily_log_id = ?").bind(log.id).all();
  var completedIds = (completions.results || []).map(function(c) { return c.habit_id; });
  var allHabits = habits.results || [];
  var doneHabits = allHabits.filter(function(h) { return completedIds.indexOf(h.id) !== -1; });
  var todoHabits = allHabits.filter(function(h) { return completedIds.indexOf(h.id) === -1; });
  var streak = await calculateStreak(env, auth.userId);

  // Get active tasks for context
  var activeTasks = await env.DB.prepare("SELECT * FROM tasks WHERE user_id = ? AND status = 'active' ORDER BY due_date ASC NULLS LAST").bind(auth.userId).all();
  var taskContext = [];
  var overdueTasks = [];
  var todayTasks = [];
  var upcomingTasks = [];
  var dailyTasks = [];

  for (var t of (activeTasks.results || [])) {
    var steps = await env.DB.prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY sort_order").bind(t.id).all();
    var allSteps = steps.results || [];
    var doneSteps = allSteps.filter(function(s) { return s.completed; });
    var nextStep = allSteps.find(function(s) { return !s.completed; });
    var isDaily = !!t.recurrence;
    var label = "\"" + t.title + "\" (" + doneSteps.length + "/" + allSteps.length + " steps" +
      (t.due_date ? ", due " + t.due_date : "") +
      (isDaily ? ", " + t.recurrence + " recurring" : "") +
      (nextStep ? ", next: " + nextStep.title : "") + ")";

    if (isDaily) { dailyTasks.push(label); }
    else if (t.due_date && t.due_date < today) { overdueTasks.push(label); }
    else if (t.due_date === today) { todayTasks.push(label); }
    else { upcomingTasks.push(label); }
    taskContext.push("- " + label);
  }

  // Session history
  var session = await env.DB.prepare("SELECT * FROM coach_sessions WHERE user_id = ? AND date = ?").bind(auth.userId, today).first();
  var sessionMessages = [];
  if (session) {
    try { sessionMessages = JSON.parse(session.messages || "[]"); } catch (e) { sessionMessages = []; }
  }
  sessionMessages.push({ role: "user", content: message });
  var apiMessages = sessionMessages.slice(-10).map(function(m) { return { role: m.role, content: m.content }; });

  var levels = [{ n: "Starter", min: 0 }, { n: "Building", min: 500 }, { n: "Focused", min: 1500 }, { n: "Unstoppable", min: 3e3 }, { n: "Legend", min: 6e3 }];
  var xpTotal = user.xp_total || 0;
  var levelName = "Starter";
  for (var i = 0; i < levels.length; i++) { if (xpTotal >= levels[i].min) levelName = levels[i].n; }

  // Build a rich context block
  var taskSummaryBlock = "";
  if (overdueTasks.length > 0) taskSummaryBlock += "\nOVERDUE (needs attention NOW):\n" + overdueTasks.map(function(t) { return "- " + t; }).join("\n");
  if (dailyTasks.length > 0) taskSummaryBlock += "\nDAILY TASKS (recurring):\n" + dailyTasks.map(function(t) { return "- " + t; }).join("\n");
  if (todayTasks.length > 0) taskSummaryBlock += "\nDUE TODAY:\n" + todayTasks.map(function(t) { return "- " + t; }).join("\n");
  if (upcomingTasks.length > 0) taskSummaryBlock += "\nUPCOMING:\n" + upcomingTasks.map(function(t) { return "- " + t; }).join("\n");
  if (!taskSummaryBlock) taskSummaryBlock = "\nNo active tasks.";

  var currentHour = new Date().getHours();
  var timeOfDay = currentHour < 12 ? "morning" : currentHour < 17 ? "afternoon" : "evening";

  var systemPrompt = getVibePrompt(user.buddy_vibe || "akil") +
    "\nToday is " + today + " (" + timeOfDay + "). User: " + (user.name || "friend") + "." +
    "\n\n--- TODAY'S STATUS ---" +
    "\nXP: " + (log.xp_earned || 0) + " today, " + xpTotal + " lifetime (" + levelName + ")" +
    "\nStreak: " + streak + " days" +
    "\nFocus sessions today: " + (log.focus_sessions || 0) +
    "\nHabits done: " + doneHabits.length + "/" + allHabits.length +
    (doneHabits.length > 0 ? " (" + doneHabits.map(function(h) { return h.name; }).join(", ") + ")" : "") +
    (todoHabits.length > 0 ? "\nHabits remaining: " + todoHabits.map(function(h) { return h.name; }).join(", ") : "\nAll habits done!") +
    "\n\n--- TASKS ---" + taskSummaryBlock +
    "\n\n--- BRIEFING RULES ---" +
    "\nWhen the user asks for a status update, check-in, or says hi:" +
    "\n1. Greet them warmly in your vibe style" +
    "\n2. Mention any OVERDUE tasks first (urgent tone)" +
    "\n3. Summarize daily recurring tasks progress" +
    "\n4. Note habits remaining" +
    "\n5. Suggest what to tackle next (pick the highest-priority item)" +
    "\n6. Keep it to 3-5 sentences, not a wall of text" +
    "\n\n--- TASK CREATION ---" +
    "\nWhen the user asks you to break down a task, plan something, or says they need to do something:" +
    "\n- Respond with your encouraging message" +
    "\n- Include a JSON block at the very end wrapped in <task_json>...</task_json> tags" +
    '\n- Format: <task_json>{"title":"Task name","dueDate":"YYYY-MM-DD or null","recurrence":"daily or null","steps":[{"title":"Step 1","timeEstimate":"25 min"}]}</task_json>' +
    "\n- Set recurrence to \"daily\" if the user says this is something they want to do every day" +
    "\n- Only include <task_json> when creating NEW tasks, not for regular chat" +
    "\n- If a user says \"make this daily\" about an existing task, just acknowledge it (the app handles the toggle)";

  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: systemPrompt, messages: apiMessages })
  });

  if (!res.ok) {
    var errText = "";
    try { errText = await res.text(); } catch (e2) {}
    console.error("Coach API error:", res.status, errText);
    return jsonResp({ reply: "Having trouble connecting (" + res.status + "). Try again!", debug: errText }, 200, co);
  }

  var data = await res.json();
  var textBlock = (data.content || []).filter(function(c) { return c.type === "text"; })[0];
  var reply = textBlock ? textBlock.text : "You've got this! \u{1F49C}";

  // Parse out any task_json from the reply
  var createdTask = null;
  var taskMatch = reply.match(/<task_json>([\s\S]*?)<\/task_json>/);
  if (taskMatch) {
    try {
      var taskData = JSON.parse(taskMatch[1]);
      // Create the task in DB
      var taskId = uid();
      var xpReward = Math.max(30, (taskData.steps || []).length * 15);
      var recurrence = taskData.recurrence || null;
      await env.DB.prepare(
        "INSERT INTO tasks (id, user_id, title, due_date, xp_reward, source, recurrence) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(taskId, auth.userId, taskData.title, taskData.dueDate || null, xpReward, "coach", recurrence).run();

      var createdSteps = [];
      for (var si = 0; si < (taskData.steps || []).length; si++) {
        var stepData = taskData.steps[si];
        var stepId = uid();
        await env.DB.prepare(
          "INSERT INTO task_steps (id, task_id, title, time_estimate, sort_order) VALUES (?, ?, ?, ?, ?)"
        ).bind(stepId, taskId, stepData.title, stepData.timeEstimate || null, si).run();
        createdSteps.push({ id: stepId, title: stepData.title, timeEstimate: stepData.timeEstimate, completed: 0, sort_order: si });
      }

      createdTask = {
        id: taskId, title: taskData.title, dueDate: taskData.dueDate || null,
        status: "active", xpReward, source: "coach", recurrence,
        steps: createdSteps, stepsTotal: createdSteps.length, stepsDone: 0
      };
    } catch (e) {
      console.error("Task parse error:", e);
    }
    // Remove the JSON block from the visible reply
    reply = reply.replace(/<task_json>[\s\S]*?<\/task_json>/, "").trim();
  }

  sessionMessages.push({ role: "assistant", content: reply });
  if (session) {
    await env.DB.prepare("UPDATE coach_sessions SET messages = ? WHERE id = ?").bind(JSON.stringify(sessionMessages), session.id).run();
  } else {
    await env.DB.prepare("INSERT INTO coach_sessions (id, user_id, date, messages) VALUES (?, ?, ?, ?)").bind(uid(), auth.userId, today, JSON.stringify(sessionMessages)).run();
  }

  return jsonResp({ reply, createdTask }, 200, co);
}

async function handleGetStreak(request, env, co) {
  var auth = await requireAuth(request, env);
  var streak = await calculateStreak(env, auth.userId);
  return jsonResp({ streak }, 200, co);
}
