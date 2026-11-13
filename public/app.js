const phoneInput = document.getElementById("phone");
const searchBtn = document.getElementById("searchBtn");
const searchStatus = document.getElementById("searchStatus");

const analysisBox = document.getElementById("analysis");
const quickResults = document.getElementById("quickResults");
const deepResults = document.getElementById("deepResults");

searchBtn.addEventListener("click", searchPhone);

async function searchPhone() {
const number = phoneInput.value.trim();

if (!number) {
searchStatus.textContent = "أدخل رقم الهاتف أولاً";
return;
}

searchBtn.disabled = true;
searchStatus.textContent = "جارٍ تحليل الرقم والبحث عن الأسماء...";

analysisBox.replaceChildren();
quickResults.replaceChildren();
deepResults.replaceChildren();

try {
const response = await fetch("/api/search", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({ number })
});

const data = await response.json();

if (!response.ok) {
  throw new Error(data.error || "تعذر إكمال البحث");
}

showAnalysis(data.analysis);

// عرض الأسماء المعتمدة أولاً
if (data.names && data.names.length > 0) {
  showNames(data.names);

  searchStatus.textContent =
    `اكتمل البحث. عدد الأسماء المعتمدة: ${data.totalNames}`;

} else if (data.results && data.results.length > 0) {
  showResults(data.results);

  searchStatus.textContent =
    `لم نعثر على اسم معتمد. عدد الصفحات العامة: ${data.totalResults}`;

} else {
  addText(
    quickResults,
    "p",
    "لم نعثر على اسم معتمد مرتبط بهذا الرقم."
  );

  searchStatus.textContent = "اكتمل البحث دون العثور على أسماء معتمدة.";
}

} catch (error) {
searchStatus.textContent = error.message;

} finally {
searchBtn.disabled = false;
}
}

// إضافة نص آمن
function addText(parent, tag, text, className) {
const element = document.createElement(tag);
element.textContent = text;

if (className) {
element.className = className;
}

parent.appendChild(element);
return element;
}

// عرض تحليل الرقم
function showAnalysis(data) {
if (!data) return;

addText(analysisBox, "h3", "تحليل الرقم");

addText(analysisBox, "p", "الرقم: ${data.number}");
addText(analysisBox, "p", "الدولة: ${data.country}");
addText(analysisBox, "p", "مفتاح الدولة: ${data.callingCode}");
addText(
analysisBox,
"p",
"حالة الرقم: ${data.valid ? "صالح" : "غير صالح"}"
);
}

// عرض الأسماء المرتبطة بالرقم
function showNames(names) {
addText(quickResults, "h3", "الأسماء المرتبطة بالرقم");

names.forEach((item, index) => {
const card = document.createElement("article");

addText(
  card,
  "h4",
  item.display_name || "اسم غير متوفر"
);

addText(
  card,
  "p",
  `النتيجة رقم ${index + 1}`
);

addText(
  card,
  "p",
  `المصدر: ${item.source || "غير محدد"}`
);

addText(
  card,
  "p",
  "حالة الاسم: معتمد"
);

quickResults.appendChild(card);

});
}

// عرض نتائج البحث العام
function showResults(results) {
addText(quickResults, "h3", "نتائج البحث العام");

results.forEach(item => {
const card = document.createElement("article");

addText(
  card,
  "h4",
  item.title || "نتيجة بدون عنوان"
);

addText(
  card,
  "p",
  item.snippet || "لا يوجد وصف متاح"
);

if (item.url) {
  const link = document.createElement("a");

  link.textContent = "فتح المصدر";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  card.appendChild(link);
}

quickResults.appendChild(card);

});
  }
