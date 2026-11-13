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
  limit: 5,
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

  if (!phone || phone.country !== "SD") {
    return {
      valid: false,
      message: "هذا ليس رقماً سودانياً صالحاً"
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


// توحيد الأرقام العربية والإنجليزية
function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, d =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(d))
    )
    .replace(/[۰-۹]/g, d =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    )
    .replace(/\D/g, "");
}


// التأكد من وجود الرقم
function containsPhone(item, numbers) {
  const text = [
    item.title || "",
    item.snippet || "",
    item.url || ""
  ].join(" ");

  const normalizedText = normalizeDigits(text);

  return numbers.some(number =>
    normalizedText.includes(
      normalizeDigits(number)
    )
  );
}


// التأكد من أن النتيجة مرتبطة بالسودان
function isSudaneseResult(item) {
  const text = [
    item.title || "",
    item.snippet || "",
    item.url || ""
  ].join(" ").toLowerCase();

  const indicators = [
    "السودان",
    "سودان",
    "السوداني",
    "السودانية",
    "الخرطوم",
    "sudan",
    "sudanese",
    "khartoum"
  ];

  const hasSudanWord = indicators.some(word =>
    text.includes(word)
  );

  const hasSudanDomain =
    /\.sd(?:\/|$|\?)/i.test(item.url || "");

  return hasSudanWord || hasSudanDomain;
}


// الاتصال بمحرك البحث
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
    throw new Error(
      data.message || "فشل محرك البحث"
    );
  }

  return data.organic || [];
}


// البحث الرئيسي
app.post("/api/search", async (req, res) => {
  try {
    const { number } = req.body;

    if (
      typeof number !== "string" ||
      number.length > 25
    ) {
      return res.status(400).json({
        success: false,
        error: "رقم الهاتف غير صالح"
      });
    }

    const analysis = analyzePhone(number);

    if (!analysis.valid) {
      return res.status(400).json({
        success: false,
        error: "الرقم غير صحيح",
        analysis
      });
    }

    if (!process.env.SEARCH_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "محرك البحث غير مهيأ",
        analysis
      });
    }

    const internationalNumber = analysis.number;

    const localNumber =
      "0" + analysis.nationalNumber;

    const phoneNumbers = [
      internationalNumber,
      localNumber
    ];

    // استعلامات مخصصة للسودان
    const queries = [
      `"${localNumber}" السودان`,
      `"${internationalNumber}" Sudan`
    ];

    let results = [];

    for (const query of queries) {
      const found = await searchPublic(query);

      // قبول النتائج التي تحقق الشرطين
      const filtered = found.filter(item =>
        containsPhone(item, phoneNumbers) &&
        isSudaneseResult(item)
      );

      results.push(...filtered);

      // التوقف عند العثور على نتائج
      if (results.length > 0) {
        break;
      }
    }

    // إزالة التكرار
    const uniqueResults = Array.from(
      new Map(
        results
          .filter(item => item.url)
          .map(item => [
            item.url,
            {
              title: item.title || "نتيجة بدون عنوان",
              url: item.url,
              domain: item.domain || "",
              snippet: item.snippet || ""
            }
          ])
      ).values()
    );

    return res.json({
      success: true,
      analysis,
      results: uniqueResults,
      totalResults: uniqueResults.length,
      searchEngine: "Serper.live",
      stored: false,

      message: uniqueResults.length
        ? "تم العثور على نتائج مرتبطة بالرقم والسودان"
        : "لم نعثر على صفحات عامة تحقق شروط المطابقة"
    });

  } catch (error) {
    console.error("Search error:", error.message);

    return res.status(502).json({
      success: false,
      error: "تعذر إكمال البحث حالياً"
    });
  }
});


// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/index.html")
  );
});


// فحص الخادم
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
