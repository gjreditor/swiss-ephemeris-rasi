import express from "express";
import axios from "axios";
import sweph from "sweph";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 🔐 Environment Variables (Render dashboard)
const GREEN_API_INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;

// Temporary in-memory user session store
const userState = {};

// Helper to send WhatsApp messages
async function sendMessage(chatId, text) {
  const url = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE_ID}/sendMessage/${GREEN_API_TOKEN}`;
  await axios.post(url, { chatId, message: text });
}

// List of Ayanamsas
const ayanamsas = [
  { name: "Lahiri", id: sweph.SE_SIDM_LAHIRI },
  { name: "Krishnamurti", id: sweph.SE_SIDM_KRISHNAMURTI },
  { name: "Raman", id: sweph.SE_SIDM_RAMAN },
  { name: "Fagan-Bradley", id: sweph.SE_SIDM_FAGAN_BRADLEY },
  { name: "De Luce", id: sweph.SE_SIDM_DELUCE },
  { name: "Djwhal Khul", id: sweph.SE_SIDM_DJWHAL_KHUL },
];

// Rasis
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

// Nakshatras (27)
const nakshatras = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
  "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula",
  "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha",
  "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"
];

// 🪐 Webhook for incoming messages
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    if (!data.messageData || !data.messageData.textMessageData) {
      return res.sendStatus(200);
    }

    const chatId = data.senderData.chatId;
    const message = data.messageData.textMessageData.textMessage.trim().toLowerCase();

    // Initialize user session
    if (!userState[chatId]) {
      userState[chatId] = { step: 0, data: {} };
    }

    const user = userState[chatId];

    // Step 0: Start
    if (message === "rasi") {
      user.step = 1;
      await sendMessage(chatId, "🌙 Please enter your *birth date* in format YYYY-MM-DD");
      return res.sendStatus(200);
    }

    // Step 1: Date
    if (user.step === 1) {
      const dateParts = message.split("-");
      if (dateParts.length !== 3) {
        await sendMessage(chatId, "❌ Invalid format. Please enter date as YYYY-MM-DD");
        return res.sendStatus(200);
      }
      user.data.date = message;
      user.step = 2;
      await sendMessage(chatId, "🕒 Please enter your *birth time* in 24-hour format HH:MM (e.g. 14:30)");
      return res.sendStatus(200);
    }

    // Step 2: Time
    if (user.step === 2) {
      const timeParts = message.split(":");
      if (timeParts.length !== 2) {
        await sendMessage(chatId, "❌ Invalid format. Please enter time as HH:MM");
        return res.sendStatus(200);
      }
      user.data.time = message;
      user.step = 3;
      await sendMessage(chatId, "🌍 Please enter your *timezone offset* (e.g. 5.5 for IST, -4 for EDT)");
      return res.sendStatus(200);
    }

    // Step 3: Timezone → calculate
    if (user.step === 3) {
      const timezone = parseFloat(message);
      if (isNaN(timezone)) {
        await sendMessage(chatId, "❌ Invalid number. Please enter a valid timezone (e.g. 5.5)");
        return res.sendStatus(200);
      }

      const [year, month, day] = user.data.date.split("-").map(Number);
      const [hour, minute] = user.data.time.split(":").map(Number);
      const second = 0;

      // Julian Day (UTC)
      const julianDay = sweph.swe_julday(year, month, day, hour + minute / 60 + second / 3600 - timezone / 24);

      // Calculate Moon longitude and derive Rasi + Nakshatra
      const results = ayanamsas.map((ayanamsa) => {
        sweph.swe_set_sid_mode(ayanamsa.id, 0, 0);
        const moonPosition = sweph.swe_calc_ut(julianDay, sweph.SE_MOON);
        if (moonPosition.error) return `${ayanamsa.name}: Error - ${moonPosition.error}`;

        const lon = moonPosition.longitude;
        const rasiIndex = Math.floor(lon / 30);
        const nakshatraIndex = Math.floor(lon / (13 + 1 / 3)); // 13°20' = 13.333...
        const pada = Math.floor((lon % (13 + 1 / 3)) / (13 + 1 / 3 / 4)) + 1;

        return `${ayanamsa.name}: ${rasis[rasiIndex]}, ${nakshatras[nakshatraIndex]} Pada ${pada} (${lon.toFixed(2)}°)`;
      });

      const responseText = `🌕 *Your Moon Details:*\n\n${results.join("\n")}`;
      await sendMessage(chatId, responseText);

      // Reset user session
      delete userState[chatId];
      return res.sendStatus(200);
    }

    // Default help
    await sendMessage(chatId, "👋 Send *rasi* to begin the Moon Sign + Nakshatra calculation.");
    res.sendStatus(200);
  } catch (err) {
    console.error("Error:", err.message);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`🌙 Green API WhatsApp Rasi Bot running on port ${port}`);
});
