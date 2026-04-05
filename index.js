import express from "express";
import axios from "axios";
import * as sweph from "sweph";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// IMPORTANT: Point to the folder where you put the .se1 files
sweph.set_ephe_path(path.join(__dirname, "ephe"));
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

// Numeric constants because direct constant exports were undefined in your setup
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
// NEW HELPER: Fetch Lat/Long from City Name
async function getGeoCoordinates(city) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
    // Note: Nominatim requires a User-Agent header
    const response = await axios.get(url, { headers: { "User-Agent": "RasiBot/1.0" } });
    if (response.data && response.data.length > 0) {
      return {
        lat: parseFloat(response.data[0].lat),
        lon: parseFloat(response.data[0].lon),
        displayName: response.data[0].display_name
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

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

// UPDATED CALCULATION: Now includes Lat/Long for more precision
function calculateMoonDetails(dateStr, timeStr, timezoneStr, lat, lon) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const timezone = parseFloat(timezoneStr);

  const localHour = hour + minute / 60;
  const utcHour = localHour - timezone;
  const jd = sweph.julday(year, month, day, utcHour, GREG_CAL);

  return ayanamsas.map((ayanamsa) => {
    sweph.set_sid_mode(ayanamsa.id, 0, 0);

    // Calculate Moon Position
    const moonPosition = sweph.calc_ut(jd, PLANET_MOON, FLG_SWIEPH | FLG_SIDEREAL);
    
    // NEW: Calculate Houses/Ascendant using Lat/Long
    // 'P' is for Placidus, 'K' for Koch, etc. 
    const houses = sweph.houses_ex(jd, FLG_SIDEREAL, lat, lon, 'P');

    if (moonPosition?.error) return `${ayanamsa.name}: Error`;

    const m_lon = moonPosition?.data?.[0];
    const nakshatraSpan = 13 + 1 / 3;
    const rasiIndex = Math.floor(m_lon / 30);
    const nakshatraIndex = Math.floor(m_lon / nakshatraSpan);
    const pada = Math.floor((m_lon % nakshatraSpan) / (nakshatraSpan / 4)) + 1;

    // We can now also return the Ascendant (Lagna) since we have Lat/Long
    const ascendant = houses.ascendant;
    const ascRasi = rasis[Math.floor(ascendant / 30)];

    return `*${ayanamsa.name}*\n  Moon: ${rasis[rasiIndex]}, ${nakshatras[nakshatraIndex]} P${pada}\n  Ascendant (Lagna): ${ascRasi}`;
  });
}

async function processConversation(store, chatId, message) {
  const user = getOrCreateSession(store, chatId);

  if (message === "rasi") {
    user.step = 1;
    user.data = {};
    return { done: false, step: 1, reply: "🌙 Please enter your *birth date* (YYYY-MM-DD)" };
  }

  if (user.step === 1) {
    if (!isValidDateString(message)) return { done: false, step: 1, reply: "❌ Format: YYYY-MM-DD" };
    user.data.date = message;
    user.step = 2;
    return { done: false, step: 2, reply: "🕒 Please enter your *birth time* (HH:MM)" };
  }

  if (user.step === 2) {
    if (!isValidTimeString(message)) return { done: false, step: 2, reply: "❌ Format: HH:MM" };
    user.data.time = message;
    user.step = 3;
    return { done: false, step: 3, reply: "🌍 Enter your *timezone offset* (e.g. 5.5)" };
  }

  if (user.step === 3) {
    if (!isValidTimezone(message)) return { done: false, step: 3, reply: "❌ Invalid offset" };
    user.data.timezone = message;
    user.step = 4;
    return { done: false, step: 4, reply: "🏙️ Please enter your *City of Birth* (e.g., Mumbai, London)" };
  }

  if (user.step === 4) {
    const geo = await getGeoCoordinates(message);
    if (!geo) {
      return { done: false, step: 4, reply: "❌ Could not find city. Please try another city nearby." };
    }

    const results = calculateMoonDetails(user.data.date, user.data.time, user.data.timezone, geo.lat, geo.lon);
    clearSession(store, chatId);

    return {
      done: true,
      step: 0,
      reply: `🌕 *Birth Details for ${geo.displayName}:*\n\n${results.join("\n\n")}`,
    };
  }

  return { done: false, step: 0, reply: "👋 Send *rasi* to begin." };
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
