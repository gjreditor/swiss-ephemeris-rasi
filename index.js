import express from "express";
import axios from "axios";
import * as sweph from "sweph";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

// =========================
// CONFIG
// =========================
const corsOptions = {
  origin: "https://www.digientertain.com",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

const GREEN_API_INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;

// sweph constants used as numeric values
const GREG_CAL = 1;
const PLANET_MOON = 1;
const FLG_SWIEPH = 2;
const FLG_SIDEREAL = 65536;

// =========================
// MIDDLEWARE
// =========================
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// =========================
// IN-MEMORY SESSION STORES
// =========================
const userState = {};
const testUserState = {};

// =========================
// STATIC DATA
// =========================
const ayanamsas = [
  { name: "Lahiri", id: 1 },
  { name: "Krishnamurti", id: 5 },
  { name: "Raman", id: 3 },
  { name: "Fagan-Bradley", id: 0 },
  { name: "De Luce", id: 2 },
  { name: "Djwhal Khul", id: 6 },
];

const rasis = [
  "Mesha (Aries)",
  "Vrishabha (Taurus)",
  "Mithuna (Gemini)",
  "Karka (Cancer)",
  "Simha (Leo)",
  "Kanya (Virgo)",
  "Tula (Libra)",
  "Vrischika (Scorpio)",
  "Dhanu (Sagittarius)",
  "Makara (Capricorn)",
  "Kumbha (Aquarius)",
  "Meena (Pisces)",
];

const nakshatras = [
  "Ashwini",
  "Bharani",
  "Krittika",
  "Rohini",
  "Mrigashira",
  "Ardra",
  "Punarvasu",
  "Pushya",
  "Ashlesha",
  "Magha",
  "Purva Phalguni",
  "Uttara Phalguni",
  "Hasta",
  "Chitra",
  "Swati",
  "Vishakha",
  "Anuradha",
  "Jyeshtha",
  "Mula",
  "Purva Ashadha",
  "Uttara Ashadha",
  "Shravana",
  "Dhanishta",
  "Shatabhisha",
  "Purva Bhadrapada",
  "Uttara Bhadrapada",
  "Revati",
];

// =========================
// HELPERS
// =========================
function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeString(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hh, mm] = value.split(":").map(Number);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

function isValidTimezone(value) {
  const tz = parseFloat(value);
  return !Number.isNaN(tz) && tz >= -12 && tz <= 14;
}

function extractChatAndMessage(data) {
  const chatId = data?.senderData?.chatId;
  const message = data?.messageData?.textMessageData?.textMessage?.trim()?.toLowerCase();
  return { chatId, message };
}

function getOrCreateSession(store, chatId) {
  if (!store[chatId]) {
    store[chatId] = { step: 0, data: {} };
  }
  return store[chatId];
}

function clearSession(store, chatId) {
  delete store[chatId];
}

async function sendMessage(chatId, text) {
  if (!GREEN_API_INSTANCE_ID || !GREEN_API_TOKEN) {
    throw new Error("Missing GREEN_API_INSTANCE_ID or GREEN_API_TOKEN");
  }

  const url = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE_ID}/sendMessage/${GREEN_API_TOKEN}`;

  await axios.post(url, {
    chatId,
    message: text,
  });
}

function calculateMoonDetails(dateStr, timeStr, timezoneStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const timezone = parseFloat(timezoneStr);

  const localHour = hour + minute / 60;
  const utcHour = localHour - timezone;

  const jd = sweph.julday(year, month, day, utcHour, GREG_CAL);

  return ayanamsas.map((ayanamsa) => {
    sweph.set_sid_mode(ayanamsa.id, 0, 0);

    const moonPosition = sweph.calc_ut(
      jd,
      PLANET_MOON,
      FLG_SWIEPH | FLG_SIDEREAL
    );

    if (moonPosition?.error) {
      return `${ayanamsa.name}: Error - ${moonPosition.error}`;
    }

    const lon = moonPosition.longitude;
    const nakshatraSpan = 13 + 1 / 3;
    const rasiIndex = Math.floor(lon / 30);
    const nakshatraIndex = Math.floor(lon / nakshatraSpan);
    const pada = Math.floor((lon % nakshatraSpan) / (nakshatraSpan / 4)) + 1;

    return `${ayanamsa.name}: ${rasis[rasiIndex]}, ${nakshatras[nakshatraIndex]} Pada ${pada} (${lon.toFixed(2)}°)`;
  });
}

function processConversation(store, chatId, message) {
  const user = getOrCreateSession(store, chatId);

  if (message === "rasi") {
    user.step = 1;
    user.data = {};
    return {
      done: false,
      step: 1,
      reply: "🌙 Please enter your *birth date* in format YYYY-MM-DD",
    };
  }

  if (user.step === 1) {
    if (!isValidDateString(message)) {
      return {
        done: false,
        step: 1,
        reply: "❌ Invalid format. Please enter date as YYYY-MM-DD",
      };
    }

    user.data.date = message;
    user.step = 2;

    return {
      done: false,
      step: 2,
      reply: "🕒 Please enter your *birth time* in 24-hour format HH:MM (e.g. 14:30)",
    };
  }

  if (user.step === 2) {
    if (!isValidTimeString(message)) {
      return {
        done: false,
        step: 2,
        reply: "❌ Invalid format. Please enter time as HH:MM",
      };
    }

    user.data.time = message;
    user.step = 3;

    return {
      done: false,
      step: 3,
      reply: "🌍 Please enter your *timezone offset* (e.g. 5.5 for IST, -4 for EDT)",
    };
  }

  if (user.step === 3) {
    if (!isValidTimezone(message)) {
      return {
        done: false,
        step: 3,
        reply: "❌ Invalid number. Please enter a valid timezone between -12 and +14 (e.g. 5.5)",
      };
    }

    const results = calculateMoonDetails(user.data.date, user.data.time, message);
    clearSession(store, chatId);

    return {
      done: true,
      step: 0,
      reply: `🌕 *Your Moon Details:*\n\n${results.join("\n")}`,
    };
  }

  return {
    done: false,
    step: 0,
    reply: "👋 Send *rasi* to begin the Moon Sign + Nakshatra calculation.",
  };
}

// =========================
// ROUTES
// =========================
app.get("/", (req, res) => {
  res.send("Rasi bot running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "swiss-ephemeris-rasi-bot",
    greenApiConfigured: Boolean(GREEN_API_INSTANCE_ID && GREEN_API_TOKEN),
  });
});

// Real WhatsApp webhook
app.post("/webhook", async (req, res) => {
  try {
    const { chatId, message } = extractChatAndMessage(req.body);

    if (!chatId || !message) {
      return res.status(200).json({
        ok: true,
        message: "Ignored: no chatId or text message",
      });
    }

    const result = processConversation(userState, chatId, message);
    await sendMessage(chatId, result.reply);

    return res.status(200).json({
      ok: true,
      sentToWhatsApp: true,
      completed: result.done,
      step: result.step,
    });
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

// Browser test route
app.post("/test-webhook", (req, res) => {
  try {
    const { chatId, message } = extractChatAndMessage(req.body);

    if (!chatId || !message) {
      return res.status(400).json({
        ok: false,
        error: "chatId or message missing",
      });
    }

    const result = processConversation(testUserState, chatId, message);

    return res.status(200).json({
      ok: true,
      chatId,
      userMessage: message,
      botReply: result.reply,
      completed: result.done,
      step: result.step,
      testMode: true,
    });
  } catch (err) {
    console.error("Test webhook error:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

// =========================
// START
// =========================
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
