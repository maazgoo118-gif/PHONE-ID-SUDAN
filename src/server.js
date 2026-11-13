require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const {
  parsePhoneNumberFromString
} = require("libphonenumber-js");

const app = express();
const PORT = process.env.PORT || 3000;

// الاتصال بقاعدة بيانات Supabase
const supabase =
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_PUBLISHABLE_KEY
      )
    : null;

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
  const phone = parsePhoneNumberFromString(number, "SD");

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


// البحث عن الأسماء المعتمدة في قاعدة البيانات
async function findPhoneNames(internationalNumber, localNumber) {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("phone_names")
    .select("display_name, source, created_at")
    .in("phone_number", [
      internationalNumber,
      localNumber
    ])
    .eq("status", "approved")
    .eq("consent_confirmed", true);

  if (error) {
    throw error;
  }

  return data || [];
}


// التأكد من وجود الرقم في نتيجة البحث
function containsPhone(item, numbers) {
  const content = [
    item.title || "",
    item.snippet || "",
    item.url || ""
  ].join(" ");

  const normalizedText = normalizeDigits(content);

  return numbers.some(number =>
    normalizedText.includes(normalizeDigits(number))
  );
}


// التأكد من أن النتيجة مرتبطة بالسودان
function isSudaneseResult(item) {
  const content = [
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
    content.includes(word)
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

    const internationalNumber = analysis.number;
    const localNumber = "0" + analysis.nationalNumber;

    // أولاً: البحث في قاعدة بيانات الأسماء
    if (supabase) {
      try {
        const names = await findPhoneNames(
          internationalNumber,
          localNumber
        );

        if (names.length > 0) {
          return res.json({
            success: true,
            analysis,
            names,
            totalNames: names.length,
            results: [],
            stored: false,
            source: "PHONE ID SUDAN Database",
            message: "تم العثور على أسماء معتمدة مرتبطة بالرقم"
          });
        }
      } catch (databaseError) {
        console.error(
          "Database error:",
          databaseError.message
        );
      }
    }

    // ثانياً: البحث العام إذا لم توجد أسماء
    if (!process.env.SEARCH_API_KEY) {
      return res.json({
        success: true,
        analysis,
        names: [],
        results: [],
        totalNames: 0,
        totalResults: 0,
        stored: false,
        message: "لم نعثر على اسم معتمد لهذا الرقم"
      });
    }

    const phoneNumbers = [
      internationalNumber,
      localNumber
    ];

    const queries = [
      `"${localNumber}" السودان`,
      `"${internationalNumber}" Sudan`
    ];

    let results = [];

    for (const query of queries) {
      const found = await searchPublic(query);

      const filtered = found.filter(item =>
        containsPhone(item, phoneNumbers) &&
        isSudaneseResult(item)
      );

      results.push(...filtered);

      if (results.length > 0) {
        break;
      }
    }

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
      names: [],
      totalNames: 0,
      results: uniqueResults,
      totalResults: uniqueResults.length,
      stored: false,
      searchEngine: "Serper.live",
      message: uniqueResults.length
        ? "عثرنا على صفحات عامة مرتبطة بالرقم، لكن لم نجد اسماً معتمداً"
        : "لم نعثر على اسم معتمد أو صفحات عامة مطابقة"
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
