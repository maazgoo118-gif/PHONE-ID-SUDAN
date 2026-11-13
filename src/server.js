require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { parsePhoneNumberFromString } =
  require("libphonenumber-js");

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

// البحث السريع
app.post("/api/search", async (req, res) => {
  try {
    const { number } = req.body;

    if (
      typeof number !== "string" ||
      number.length > 25
    ) {
      return res.status(400).json({
        error: "رقم غير صالح"
      });
    }

    const analysis = analyzePhone(number);

    if (!analysis.valid) {
      return res.status(400).json({
        error: "الرقم غير صحيح أو غير مدعوم",
        analysis
      });
    }

    res.json({
      success: true,
      analysis,
      results: [],
      deepSearchAvailable: true,
      message: "تم تحليل الرقم بنجاح"
    });

  } catch (error) {
    res.status(500).json({
      error: "حدث خطأ أثناء البحث"
    });
  }
});

// الصفحة الرئيسية
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
