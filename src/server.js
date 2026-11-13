require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const {
  parsePhoneNumberFromString
} = require("libphonenumber-js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json({ limit: "10kb" }));

app.use(express.static(
  path.join(__dirname, "../public")
));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api/", limiter);

// تحليل الرقم السوداني
function analyzePhone(number) {
  const phone = parsePhoneNumberFromString(
    number,
    "SD"
  );

  if (!phone) {
    return {
      valid: false,
      message: "تعذر تحليل الرقم"
    };
  }

  if (phone.country !== "SD") {
    return {
      valid: false,
      message: "هذا ليس رقماً سودانياً"
    };
  }

  return {
    valid: phone.isValid(),
    number: phone.number,
    country: "السودان",
    countryCode: "SD",
    callingCode: "+249",
    nationalNumber: phone.nationalNumber,
    possible: phone.isPossible()
  };
}

// البحث في المصادر العامة
async function searchPublic(query) {
  const response = await fetch(
    "https://api.serper.live/v1/search",
    {
      method: "POST",
      headers: {
        "Authorization":
          `Bearer ${process.env.SEARCH_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        country: "EG",
        language: "ar",
        device: "mobile",
        limit: 10
      }),
      signal: AbortSignal.timeout(100000)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data.message || "فشل محرك البحث"
    );

    error.status = response.status;
    throw error;
  }

  return (data.organic || []).map(item => ({
    title: item.title || "",
    url: item.url || "",
    domain: item.domain || "",
    snippet: item.snippet || ""
  }));
}

// البحث عن الرقم
app.post("/api/search", async (req, res) => {
  try {
    const { number } = req.body;

    if (
      typeof number !== "string" ||
      number.length > 25
    ) {
      return res.status(400).json({
        success: false,
        error: "رقم غير صالح"
      });
    }

    const analysis = analyzePhone(number);

    if (!analysis.valid) {
      return res.status(400).json({
        success: false,
        error: "الرقم غير صحيح أو غير مدعوم",
        analysis
      });
    }

    if (!process.env.SEARCH_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "محرك البحث غير مهيأ حالياً",
        analysis
      });
    }

    const internationalNumber = analysis.number;

    const queries = [
      `"${internationalNumber}" السودان`,
      `"${internationalNumber}" (احتيال OR نصب OR إعلان OR شركة)`
    ];

    const results = [];

    for (const query of queries) {
      const found = await searchPublic(query);
      results.push(...found);
    }

    // إزالة النتائج المكررة
    const uniqueResults = Array.from(
      new Map(
        results.map(item => [item.url, item])
      ).values()
    );

    res.json({
      success: true,
      analysis,
      results: uniqueResults,
      totalResults: uniqueResults.length,
      searchEngine: "Serper.live",
      stored: false,
      message: uniqueResults.length
        ? "اكتمل البحث في المصادر العامة"
        : "لم نعثر على نتائج عامة مطابقة"
    });

  } catch (error) {
    console.error(
      "Search error:",
      error.status || "Unknown",
      error.message
    );

    res.status(502).json({
      success: false,
      error: "تعذر إكمال البحث حالياً. حاول لاحقاً."
    });
  }
});

// فحص حالة الخادم
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    project: "PHONE ID SUDAN"
  });
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(
    `PHONE ID SUDAN running on port ${PORT}`
  );
});
