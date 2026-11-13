const phoneInput = document.getElementById("phone");
const searchBtn = document.getElementById("searchBtn");
const results = document.getElementById("results");
const analysis = document.getElementById("analysis");
const quickResults = document.getElementById("quickResults");
const deepResults = document.getElementById("deepResults");
const searchStatus = document.getElementById("searchStatus");

let searchController = null;

function escapeHTML(value) {
return String(value).replace(/[&<>"']/g, char => ({
"&": "&",
"<": "<",
">": ">",
'"': """,
"'": "'"
})[char]);
}

function showAnalysis(data) {
analysis.innerHTML = "<h3>📱 معلومات الرقم</h3> <p>الرقم: ${escapeHTML(data.number || "غير متاح")}</p> <p>الدولة: ${escapeHTML(data.country || "غير معروفة")}</p> <p>مفتاح الدولة: ${escapeHTML(data.callingCode || "+249")}</p> <p>حالة الرقم: ${data.valid ? "صالح وفق خطة الترقيم" : "غير صالح"}</p> <p>إمكانية الرقم: ${data.possible ? "محتمل" : "غير محتمل"}</p>";
}

function setStatus(message) {
searchStatus.textContent = message;
}

async function startSearch() {
const number = phoneInput.value.trim();

if (!number) {
alert("يرجى إدخال رقم الهاتف السوداني");
return;
}

if (searchController) {
searchController.abort();
}

searchController = new AbortController();

results.hidden = false;
analysis.innerHTML = "";
quickResults.textContent = "جاري تحليل الرقم...";
deepResults.textContent = "في انتظار نتائج التحليل";

searchBtn.disabled = true;
searchBtn.textContent = "جاري البحث...";
setStatus("جاري التحليل");

try {
const response = await fetch("/api/search", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({ number }),
signal: searchController.signal
});

const data = await response.json();

if (!response.ok) {
  throw new Error(data.error || "تعذر إتمام البحث");
}

showAnalysis(data.analysis);

quickResults.innerHTML = `
  <p>✅ اكتمل تحليل الرقم.</p>
  <p>لم يتم ربط مصادر البحث الخارجي بعد.</p>
`;

setStatus("اكتمل التحليل");

deepResults.innerHTML = `
  <p>🔎 محرك البحث العميق جاهز للتطوير.</p>
  <p>سيتم ربط مصادر الإنترنت العامة في المرحلة القادمة.</p>
  <p>لن يتم اختلاق أسماء أو حسابات عند غياب الأدلة.</p>
`;

} catch (error) {
if (error.name === "AbortError") return;

quickResults.textContent = error.message;
deepResults.textContent = "تعذر إكمال البحث.";

setStatus("تعذر البحث");

} finally {
searchBtn.disabled = false;
searchBtn.innerHTML = "<span>⌕</span> ابدأ البحث";
}
}

searchBtn.addEventListener("click", startSearch);

phoneInput.addEventListener("keydown", event => {
if (event.key === "Enter") {
startSearch();
}
});

// إزالة النتائج المؤقتة عند مغادرة الصفحة
window.addEventListener("pagehide", () => {
results.hidden = true;
analysis.replaceChildren();
quickResults.replaceChildren();
deepResults.replaceChildren();
});
