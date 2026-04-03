import express from "express";
import axios from "axios";
import sweph from "sweph";
import cors from "cors";
console.log("typeof set_sid_mode:", typeof sweph.set_sid_mode);
console.log("typeof calc_ut:", typeof sweph.calc_ut);
console.log("SE_MOON:", sweph.SE_MOON);
console.log("SEFLG_SWIEPH:", sweph.SEFLG_SWIEPH);
console.log("SEFLG_SIDEREAL:", sweph.SEFLG_SIDEREAL);
const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: "https://www.digientertain.com",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

const GREEN_API_INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;

const userState = {};
const testUserState = {};

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
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
  "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula",
  "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
  "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"
];

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
  return !isNaN(tz) && tz >= -12 && tz <= 14;
}

async function sendMessage(chatId, text) {
  if (!GREEN_API_INSTANCE_ID || !GREEN_API_TOKEN) {
    throw new Error("Missing GREEN_API_INSTANCE_ID or GREEN_API_TOKEN");
  }

  const url = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE_ID}/sendMessage/${GREEN_API_TOKEN}`;
  await axios.post(url, { chatId, message: text });
}

function calculateMoonDetails(dateStr, timeStr, timezoneStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  const timezone = parseFloat(timezoneStr);

  const localHour = hour + (minute / 60);
  const utcHour = localHour - timezone;

  // 1 = Gregorian calendar
  const jd = sweph.julday(year, month, day, utcHour, 1);

  return ayanamsas.map((ayanamsa) => {
    sweph.set_sid_mode(ayanamsa.id, 0, 0);

    const moonPosition = sweph.calc_ut(
      jd,
      sweph.SE_MOON,
      sweph.SEFLG_SWIEPH | sweph.SEFLG_SIDEREAL
    );

    if (moonPosition.error) {
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

function processConversation(store, chatId, message) {
  const user = getOrCreateSession(store, chatId);

  if (message === "rasi") {
    user.step = 1;
    user.data = {};
    return {
      done: false,
      reply: "🌙 Please enter your *birth date* in format YYYY-MM-DD",
      step: 1,
    };
  }

  if (user.step === 1) {
    if (!isValidDateString(message)) {
      return {
        done: false,
        reply: "❌ Invalid format. Please enter date as YYYY-MM-DD",
        step: 1,
      };
    }

    user.data.date = message;
    user.step = 2;
    return {
      done: false,
      reply: "🕒 Please enter your *birth time* in 24-hour format HH:MM (e.g. 14:30)",
      step: 2,
    };
  }

  if (user.step === 2) {
    if (!isValidTimeString(message)) {
      return {
        done: false,
        reply: "❌ Invalid format. Please enter time as HH:MM",
        step: 2,
      };
    }

    user.data.time = message;
    user.step = 3;
    return {
      done: false,
      reply: "🌍 Please enter your *timezone offset* (e.g. 5.5 for IST, -4 for EDT)",
      step: 3,
    };
  }

  if (user.step === 3) {
    if (!isValidTimezone(message)) {
      return {
        done: false,
        reply: "❌ Invalid number. Please enter a valid timezone between -12 and +14 (e.g. 5.5)",
        step: 3,
      };
    }

    const results = calculateMoonDetails(user.data.date, user.data.time, message);
    const responseText = `🌕 *Your Moon Details:*\n\n${results.join("\n")}`;
    clearSession(store, chatId);

    return {
      done: true,
      reply: responseText,
      step: 0,
    };
  }

  return {
    done: false,
    reply: "👋 Send *rasi* to begin the Moon Sign + Nakshatra calculation.",
    step: 0,
  };
}

app.get("/", (req, res) => {
  res.send("Rasi bot running");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    greenApiConfigured: !!(GREEN_API_INSTANCE_ID && GREEN_API_TOKEN),
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
