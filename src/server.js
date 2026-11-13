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


// ==================================
// تحليل الرقم السوداني
// ==================================

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


// ==================================
// توحيد الأرقام العربية والإنجليزية
// ==================================

function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, digit =>
      String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    )
    .replace(/[۰-۹]/g, digit =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
    )
    .replace(/\D/g, "");
}


// ==================================
// التحقق من ارتباط النتيجة بالرقم
// ==================================

function isRelatedToPhone(item, phoneNumbers) {
  const text = [
    item.title || "",
    item.snippet || "",
    item.url || ""
  ].join(" ");

  const normalizedText = normalizeDigits(text);

  return phoneNumbers.some(number =>
    normalizedText.includes(
      normalizeDigits(number)
    )
  );
}


// ==================================
// الاتصال بمحرك Serper.live
// ==================================

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
        query: query,
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
      data.message || "فشل الاتصال بمحرك البحث"
    );

    error.status = response.status;

    throw error;
  }

  return data.organic || [];
}


// ==================================
// البحث عن رقم الهاتف
// ==================================

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

    // تحليل الرقم

    const analysis = analyzePhone(number);

    if (!analysis.valid) {
      return res.status(400).json({
        success: false,
        error: "الرقم غير صحيح أو غير مدعوم",
        analysis
      });
    }

    // التأكد من وجود مفتاح البحث

    if (!process.env.SEARCH_API_KEY) {
      return res.status(503).json({
        success: false,
        error: "محرك البحث غير مهيأ حالياً",
        analysis
      });
    }

    // تجهيز صيغ الرقم

    const internationalNumber = analysis.number;

    const localNumber =
      "0" + analysis.nationalNumber;

    const phoneNumbers = [
      internationalNumber,
      localNumber
    ];

    let results = [];

    // البحث الأول: الرقم الدولي

    const firstQuery =
      `"${internationalNumber}"`;

    const firstResults =
      await searchPublic(firstQuery);

    results = firstResults.filter(item =>
      isRelatedToPhone(item, phoneNumbers)
    );


    // البحث الثاني: الرقم المحلي
    // ينفذ فقط إذا لم تظهر نتائج مطابقة

    if (results.length === 0) {

      const secondQuery =
        `"${localNumber}"`;

      const secondResults =
        await searchPublic(secondQuery);

      results = secondResults.filter(item =>
        isRelatedToPhone(item, phoneNumbers)
      );
    }


    // إزالة النتائج المكررة

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


    // إرسال النتائج

    return res.json({

      success: true,

      analysis,

      results: uniqueResults,

      totalResults: uniqueResults.length,

      searchEngine: "Serper.live",

      stored: false,

      message: uniqueResults.length > 0
        ? "تم العثور على صفحات تحتوي الرقم"
        : "لم يتم العثور على صفحات عامة تحتوي الرقم"

    });

  } catch (error) {

    console.error(
      "Search error:",
      error.status || "Unknown",
      error.message
    );

    return res.status(502).json({

      success: false,

      error:
        "تعذر إكمال البحث حالياً. حاول مرة أخرى لاحقاً."

    });

  }

});


// ==================================
// الصفحة الرئيسية
// ==================================

app.get("/", (req, res) => {

  res.sendFile(
    path.join(__dirname, "../public/index.html")
  );

});


// ==================================
// فحص الخادم
// ==================================

app.get("/health", (req, res) => {

  res.json({

    status: "online",

    project: "PHONE ID SUDAN"

  });

});


// ==================================
// تشغيل الخادم
// ==================================

app.listen(PORT, () => {

  console.log(
    `PHONE ID SUDAN running on port ${PORT}`
  );

});
