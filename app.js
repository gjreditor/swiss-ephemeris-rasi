const express = require("express");
const sweph = require("sweph");

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(express.json());

// List of popular Ayanamsas
const ayanamsas = [
  { name: "Lahiri", id: sweph.SE_SIDM_LAHIRI },
  { name: "Krishnamurti", id: sweph.SE_SIDM_KRISHNAMURTI },
  { name: "Raman", id: sweph.SE_SIDM_RAMAN },
  { name: "Fagan-Bradley", id: sweph.SE_SIDM_FAGAN_BRADLEY },
  { name: "De Luce", id: sweph.SE_SIDM_DELUCE },
  { name: "Djwhal Khul", id: sweph.SE_SIDM_DJWHAL_KHUL },
];

// List of Rasis (Moon Signs)
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

// Endpoint to calculate Rasis for all Ayanamsas
app.post("/rasi", (req, res) => {
  const { year, month, day, hour, minute, second, timezone } = req.body;

  if (!year || !month || !day || hour === undefined || minute === undefined || second === undefined || timezone === undefined) {
    return res.status(400).json({ error: "Please provide all required fields: year, month, day, hour, minute, second, timezone" });
  }

  try {
    // Convert date-time to Julian Day
    const julianDay = sweph.swe_julday(year, month, day, hour + minute / 60 + second / 3600);

    const results = ayanamsas.map((ayanamsa) => {
      // Set the sidereal mode for the Ayanamsa
      sweph.swe_set_sid_mode(ayanamsa.id, 0, 0);

      // Calculate the Moon's sidereal longitude
      const moonPosition = sweph.swe_calc_ut(julianDay, sweph.SE_MOON);

      if (moonPosition.error) {
        throw new Error(moonPosition.error);
      }

      // Determine the Rasi (Moon sign)
      const moonLongitudeSidereal = moonPosition.longitude;
      const rasiIndex = Math.floor(moonLongitudeSidereal / 30);

      return {
        ayanamsa: ayanamsa.name,
        moonLongitudeSidereal,
        rasi: rasis[rasiIndex],
      };
    });

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Swiss Ephemeris API is running on port ${port}`);
});
