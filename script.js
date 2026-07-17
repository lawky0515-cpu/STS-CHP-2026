const SHEET_ID = "1QNphF5TzPIeUlIgwGofiYiJ1tdN4AMcL";
const SHEET_JSON_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Sheet1`;
const REFRESH_INTERVAL = 10000;

document.addEventListener("gesturestart", event => event.preventDefault(), { passive: false });
document.addEventListener("gesturechange", event => event.preventDefault(), { passive: false });
document.addEventListener("gestureend", event => event.preventDefault(), { passive: false });

const posterItems = [
  { image: "BANNER/1.jpg", title: "海报 1" },
  { image: "BANNER/2.jpg", title: "海报 2" },
  { image: "BANNER/3-1.jpg", title: "海报 3-1" },
  { image: "BANNER/4.jpg", title: "海报 4" },
  { image: "BANNER/5.jpg", title: "海报 5" },
  { image: "BANNER/6.jpg", title: "海报 6" },
  { image: "BANNER/7.jpg", title: "海报 7" },
  { image: "BANNER/8.jpg", title: "海报 8" },
  { image: "BANNER/9.jpg", title: "海报 9" },
  { image: "BANNER/10.jpg", title: "海报 10" },
  { image: "BANNER/11.jpg", title: "海报 11" }
];
let activePoster = 0;
let posterTimer;

const teams = [
  { id: "red", name: "红组", malayName: "Rumah Sukan Merah", subtitle: "Rumah Sukan Merah", color: "#ff4f5e", aliases: ["红组", "红", "red"] },
  { id: "yellow", name: "黄组", malayName: "Rumah Sukan Kuning", color: "#ffd23f", aliases: ["黄组", "黄", "yellow"] },
  { id: "blue", name: "蓝组", malayName: "Rumah Sukan Biru", color: "#43a7ff", aliases: ["蓝组", "蓝", "blue"] }
];
const medalTypes = [
  { id: "gold", name: "金牌", color: "var(--gold)" },
  { id: "silver", name: "银牌", color: "var(--silver)" },
  { id: "bronze", name: "铜牌", color: "var(--bronze)" }
];
const emptyScores = () => Object.fromEntries(teams.map(team => [team.id, { gold: 0, silver: 0, bronze: 0 }]));
let scores = loadCache();
let updatedAt = localStorage.getItem("sports-sheet-updated-at") || "";
let eventNames = [];
let teamAwardItems = { red: [], yellow: [], blue: [] };

function loadCache() {
  try {
    const saved = JSON.parse(localStorage.getItem("sports-sheet-scores"));
    return saved || emptyScores();
  } catch { return emptyScores(); }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function findColumn(headers, names, fallback) {
  const normalized = headers.map(value => String(value).trim().toLowerCase());
  const index = normalized.findIndex(value => names.some(name => value === name || value.includes(name)));
  return index >= 0 ? index : fallback;
}

function rowsToScores(rows) {
  if (rows.length < 2) throw new Error("表格没有成绩资料");

  // The school's score sheet stores the final medal totals in six columns per
  // house: boys' E/P/G followed by girls' E/P/G. E=gold, P=silver, G=bronze.
  const totalRow = [...rows].reverse().find(row =>
    String(row[1] || "").toLowerCase().includes("jumlah besar pingat")
  );
  if (totalRow) {
    const numberAt = index => Math.max(0, Number(totalRow[index]) || 0);
    return {
      red: {
        gold: numberAt(2) + numberAt(5),
        silver: numberAt(3) + numberAt(6),
        bronze: numberAt(4) + numberAt(7)
      },
      yellow: {
        gold: numberAt(8) + numberAt(11),
        silver: numberAt(9) + numberAt(12),
        bronze: numberAt(10) + numberAt(13)
      },
      blue: {
        gold: numberAt(14) + numberAt(17),
        silver: numberAt(15) + numberAt(18),
        bronze: numberAt(16) + numberAt(19)
      }
    };
  }

  // Also support a simple 组别/金牌/银牌/铜牌 table if the sheet is changed later.
  const headers = rows[0];
  const columns = {
    team: findColumn(headers, ["组别", "队伍", "team", "rumah", "kumpulan"], 0),
    gold: findColumn(headers, ["金牌", "金", "gold", "emas"], 1),
    silver: findColumn(headers, ["银牌", "银", "silver", "perak"], 2),
    bronze: findColumn(headers, ["铜牌", "铜", "bronze", "gangsa"], 3)
  };
  const next = emptyScores();
  let matched = 0;
  rows.slice(1).forEach(row => {
    const label = String(row[columns.team] || "").trim().toLowerCase();
    const team = teams.find(item => item.aliases.some(alias => label === alias.toLowerCase()));
    if (!team) return;
    medalTypes.forEach(medal => next[team.id][medal.id] = Math.max(0, Number(row[columns[medal.id]]) || 0));
    matched++;
  });
  if (!matched) throw new Error("找不到红组、黄组或蓝组资料");
  return next;
}

function sortedTeams() {
  return [...teams].sort((a, b) => {
    const A = scores[a.id], B = scores[b.id];
    return B.gold - A.gold || B.silver - A.silver || B.bronze - A.bronze || teams.indexOf(a) - teams.indexOf(b);
  });
}

function render() {
  const order = sortedTeams();
  const board = document.querySelector("#scoreboard");
  board.innerHTML = "";
  order.forEach(team => {
    const card = document.querySelector("#teamTemplate").content.firstElementChild.cloneNode(true);
    const position = order.findIndex(item => item.id === team.id) + 1;
    const total = Object.values(scores[team.id]).reduce((a, b) => a + b, 0);
    card.style.setProperty("--team", team.color);
    card.dataset.teamId = team.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `查看${team.name}得奖项目`);
    card.classList.toggle("leading", position === 1 && total > 0);
    card.querySelector(".rank-mark").textContent = String(position).padStart(2, "0");
    card.querySelector("h2").textContent = team.name;
    if (team.subtitle) {
      card.querySelector("h2").insertAdjacentHTML("afterend", `<p class="team-subtitle">${team.subtitle}</p>`);
    }
    const medals = card.querySelector(".medals");
    medalTypes.forEach(medal => {
      const row = document.createElement("div");
      row.className = "medal-row";
      row.innerHTML = `<div class="medal-name"><span class="medal-icon" style="--medal:${medal.color}">●</span>${medal.name}</div><span class="count">${scores[team.id][medal.id]}</span>`;
      medals.append(row);
    });
    board.append(card);
  });
  document.querySelector("#rankingList").innerHTML = order.map((team, i) => `<div class="ranking-row" style="--team:${team.color}"><span class="place">${i + 1}</span><span class="name"><i class="dot"></i>${team.name}</span><span class="stat">金 <strong>${scores[team.id].gold}</strong></span><span class="stat">银 <strong>${scores[team.id].silver}</strong></span><span class="stat">铜 <strong>${scores[team.id].bronze}</strong></span></div>`).join("");
  const total = teams.reduce((sum, team) => sum + Object.values(scores[team.id]).reduce((a,b) => a+b, 0), 0);
  document.querySelector("#totalMedals").textContent = total;
  document.querySelector("#leaderName").textContent = total ? order[0].name : "—";
  document.querySelector("#updatedTime").textContent = updatedAt || "等待成绩";
}

async function refreshScores() {
  const status = document.querySelector("#syncStatus");
  try {
    const data = await loadSheetWithJsonp();
    if (data.status !== "ok" || !data.table) throw new Error("无法读取成绩表");
    const headers = data.table.cols.map(column => column.label || "");
    const sheetRows = data.table.rows.map(row => row.c.map(cell => cell?.v ?? ""));
    eventNames = [...new Set(sheetRows
      .map(row => String(row[1] || "").trim())
      .filter(name => name && !/^(acara|jumlah)/i.test(name))
    )];
    teamAwardItems = extractTeamAwards(sheetRows);
    if (!infoModal.hidden && infoModal.dataset.panel?.startsWith("team-")) {
      openTeamAwards(infoModal.dataset.panel.replace("team-", ""));
    }
    if (!infoModal.hidden && infoModal.dataset.panel === "events") {
      openInfoPanel("events");
    }
    scores = rowsToScores([headers, ...sheetRows]);
    updatedAt = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
    localStorage.setItem("sports-sheet-scores", JSON.stringify(scores));
    localStorage.setItem("sports-sheet-updated-at", updatedAt);
    status.textContent = "成绩表已连接";
    render();
  } catch (error) {
    status.textContent = "等待成绩表权限";
    console.warn(error.message);
  }
}

function extractTeamAwards(rows) {
  const result = { red: [], yellow: [], blue: [] };
  const columnGroups = {
    red: { gold: [2, 5], silver: [3, 6], bronze: [4, 7] },
    yellow: { gold: [8, 11], silver: [9, 12], bronze: [10, 13] },
    blue: { gold: [14, 17], silver: [15, 18], bronze: [16, 19] }
  };
  rows.forEach(row => {
    const eventName = String(row[1] || "").trim();
    if (!eventName || /^(acara|jumlah)/i.test(eventName)) return;
    Object.entries(columnGroups).forEach(([teamId, medals]) => {
      Object.entries(medals).forEach(([medal, columns]) => {
        columns.forEach((column, genderIndex) => {
          const amount = Number(row[column]) || 0;
          if (amount > 0) result[teamId].push({ eventName, medal, amount, gender: genderIndex === 0 ? "男子" : "女子" });
        });
      });
    });
  });
  return result;
}

const programmeItems = [
  { time: "0715", items: [["选手签到及出席确认", "Pendaftaran & Kehadiran Peserta"]] },
  { time: "0730", items: [["来宾入席", "Para jemputan mengambil tempat masing-masing."]] },
  { time: "0745", items: [
    ["方阵入场仪式", "Perarakan Kontinjen"],
    ["选手按各自队伍入场。", "Semua peserta mengambil tempat mengikut rumah sukan masing-masing."],
    ["奏国歌、州歌及校歌。", "Nyanyian lagu kebangsaan, ibu pertiwiku dan lagu sekolah."],
    ["宣誓", "Membaca ikrar."]
  ] },
  { time: "0815", items: [
    ["校长致辞", "Ucapan daripada guru besar."],
    ["校董主席致辞", "Ucapan daripada pengerusi LPS."],
    ["家教协会主席致辞", "Ucapan daripada pengerusi PIBG."],
    ["开幕典礼", "Pembukaan Rasmi Kejohanan · Perasmian kejohanan oleh guru besar diiringi pengerusi LPS/PIBG."],
    ["颁发纪念品予校董主席及家教协会主席", "Penyampaian cenderamata kepada tetamu kehormat."]
  ] },
  { time: "0830", items: [
    ["赛事开始", "Acara bermula."],
    ["颁奖典礼", "Penyampaian Hadiah."]
  ] },
  { time: "1100", items: [["闭幕仪式", "Penutupan (Fly Kenyalang Fly High)"]] }
];
const staffItems = [
  ["PENGERUSI", ["GB SIET UNG CHING"]],
  ["NAIB PENGERUSI", ["LAW KUING YIT"]],
  ["SETIAUSAHA", ["TAN GUAT LEE"]],
  ["BENDAHARI", ["TIONG CHONG LUNG"]],
  ["PERHIASAN ASTAKA", ["SEMUA GURU"]],
  ["JURUACARA", ["CHAI MEI LING"]],
  ["PENDAFTARAN", ["DONNA KONG CHIEW SIEW"]],
  ["AJK MAKANAN & MINUMAN", ["MAS NORAIDA BINTI MATZROL"]],
  ["PELEPAS", ["LAW KUING YIT"]],
  ["PENAMAT", ["MOHAMAD IZZUDDIN BIN RASHIDI", "LAW ANG", "EXCO PIBG"]],
  ["PENCATAT MARKAH", ["FELICIA TAY ZHI TING", "NICOLE HII CHIANG HEE", "TRACY GRACE ANAK NICHOL"]],
  ["URUSETIA & HADIAH", ["TRACY GRACE ANAK NICHOL", "CHONG KEN CHU", "NICOLE HII CHIANG HEE"]],
  ["AJK PADANG & PERALATAN", ["LAW ANG", "LAW KUING YIT", "CHRISTOPHER NG", "LARRY"]],
  ["PENGURUS TEKNIK", ["LAW ANG", "TAN WEI JIN", "LAW KUING YIT"]],
  ["SISTEM PA", ["TAN WEI JIN"]],
  ["BOOTH JUALAN", ["DONNA KONG CHIEW SIEW"]],
  ["AJK KESELAMATAN", ["CHAI MEI LING", "AHLI BSMM"]],
  ["JURUGAMBAR", ["PAU KEAK YIONG"]],
  ["GURU RUMAH SUKAN", ["JAIMY GOH BOON SUANG (BIRU)", "PUAN SITI KHADIJAH BINTI MAT DAUD (KUNING)", "PUAN TAN GUAT LEE (MERAH)"]]
];
const sponsorItems = ["COCOCROWN JAYA", "HUA NGONG", "HOMETOWN PHARMACY"];
const eventTranslations = {
  "Lompat Tinggi": "跳高",
  "Lompat Jauh": "跳远",
  "Lontar Peluru": "铅球",
  "Larian 100M": "100米赛跑",
  "Larian 30M": "30米赛跑",
  "Membawa Ping Pong dengan Sudu": "汤匙运送乒乓球",
  "Isi Air Dalam Botol": "瓶子装水赛"
};

function getBilingualEventName(name) {
  const chinese = eventTranslations[name];
  return chinese ? `${chinese} / ${name}` : name;
}
const infoModal = document.querySelector("#infoModal");

function openInfoPanel(type) {
  const isProgramme = type === "program";
  const panelInfo = {
    program: ["PROGRAMME", "节目表"],
    events: ["EVENTS", "赛事表"],
    sponsors: ["SPONSORS", "赞助商"],
    staff: ["COMMITTEE", "工作人员"]
  }[type];
  document.querySelector("#infoEyebrow").textContent = panelInfo[0];
  document.querySelector("#infoTitle").textContent = panelInfo[1];
  document.querySelector("#infoContent").innerHTML = isProgramme
    ? `<div class="programme-list">${programmeItems.map(group => `
        <section class="programme-group">
          <time>${group.time}</time>
          <div>${group.items.map(item => `<article><strong>${item[0]}</strong><span>${item[1]}</span></article>`).join("")}</div>
        </section>`).join("")}</div>`
    : type === "events" && eventNames.length
      ? `<ol class="info-list">${eventNames.map((item, index) => `<li><strong>${String(index + 1).padStart(2, "0")}</strong><span>${getBilingualEventName(item)}</span></li>`).join("")}</ol>`
      : type === "events"
        ? `<p>赛事资料正在从 Google Sheet 读取，请稍后再试。</p>`
        : type === "staff"
          ? `<div class="staff-list">${staffItems.map(([role, names]) => `<article><strong>${role}</strong><div>${names.map(name => `<span>${name}</span>`).join("")}</div></article>`).join("")}</div>`
          : `<div class="sponsor-list">${Array.from({ length: 12 }, (_, index) => sponsorItems[index] || "").map(name => `<article class="${name ? "" : "empty"}">${name ? `<strong>${name}</strong>` : `<span>◆</span>`}</article>`).join("")}</div>`;
  infoModal.dataset.panel = type;
  infoModal.hidden = false;
  document.body.style.overflow = "hidden";
}

function openTeamAwards(teamId) {
  const team = teams.find(item => item.id === teamId);
  const awards = teamAwardItems[teamId] || [];
  const medalLabels = { gold: "金牌", silver: "银牌", bronze: "铜牌" };
  document.querySelector("#infoEyebrow").textContent = "AWARD EVENTS";
  document.querySelector("#infoTitle").textContent = `${team.name}得奖项目`;
  document.querySelector("#infoContent").innerHTML = awards.length
    ? `<div class="team-award-list">${awards.map(award => `<article class="award-${award.medal}"><span>${medalLabels[award.medal]}</span><div><strong>${getBilingualEventName(award.eventName)}</strong><small>${award.gender}${award.amount > 1 ? ` · ${award.amount} 面` : ""}</small></div></article>`).join("")}</div>`
    : `<div class="panel-placeholder"><span>☆</span><p>目前没有得奖项目</p></div>`;
  infoModal.dataset.panel = `team-${teamId}`;
  infoModal.hidden = false;
  document.body.style.overflow = "hidden";
}

document.querySelector(".quick-actions").addEventListener("click", event => {
  const button = event.target.closest("[data-panel]");
  if (button) openInfoPanel(button.dataset.panel);
});

document.querySelector("#scoreboard").addEventListener("click", event => {
  const card = event.target.closest("[data-team-id]");
  if (card) openTeamAwards(card.dataset.teamId);
});

document.querySelector("#scoreboard").addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-team-id]");
  if (card) { event.preventDefault(); openTeamAwards(card.dataset.teamId); }
});

function closeInfoPanel() {
  infoModal.hidden = true;
  document.body.style.overflow = "";
}

document.querySelector("#closeInfo").addEventListener("click", closeInfoPanel);
infoModal.addEventListener("click", event => { if (event.target === infoModal) closeInfoPanel(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeInfoPanel(); });

function renderPosterCarousel() {
  const stage = document.querySelector("#posterStage");
  const dots = document.querySelector("#posterDots");
  stage.innerHTML = posterItems.map((poster, index) => `<article class="poster-card" data-poster-index="${index}">${poster.image ? `<img src="${poster.image}" alt="${poster.title}" />` : `<div class="poster-placeholder"><span>▧</span><strong>${poster.title}</strong><small>1 : 2.11</small></div>`}</article>`).join("");
  dots.innerHTML = posterItems.map((_, index) => `<button type="button" data-poster-dot="${index}" aria-label="查看第 ${index + 1} 张海报"></button>`).join("");
  updatePosterPositions();
}

function updatePosterPositions() {
  document.querySelectorAll(".poster-card").forEach((card, index) => {
    const total = posterItems.length;
    const left = (activePoster - 1 + total) % total;
    const right = (activePoster + 1) % total;
    card.className = `poster-card ${index === activePoster ? "is-active" : index === left ? "is-left" : index === right ? "is-right" : "is-hidden"}`;
  });
  document.querySelectorAll("[data-poster-dot]").forEach((dot, index) => dot.classList.toggle("active", index === activePoster));
}

function movePoster(direction) {
  activePoster = (activePoster + direction + posterItems.length) % posterItems.length;
  updatePosterPositions();
  restartPosterTimer();
}

function restartPosterTimer() {
  clearInterval(posterTimer);
  posterTimer = setInterval(() => movePoster(1), 4500);
}

const posterCarousel = document.querySelector("#posterCarousel");
posterCarousel.querySelector(".previous").addEventListener("click", () => movePoster(-1));
posterCarousel.querySelector(".next").addEventListener("click", () => movePoster(1));
document.querySelector("#posterDots").addEventListener("click", event => {
  const dot = event.target.closest("[data-poster-dot]");
  if (dot) { activePoster = Number(dot.dataset.posterDot); updatePosterPositions(); restartPosterTimer(); }
});
posterCarousel.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft") movePoster(-1);
  if (event.key === "ArrowRight") movePoster(1);
});
let swipeStartX = 0;
posterCarousel.addEventListener("touchstart", event => { swipeStartX = event.touches[0].clientX; }, { passive: true });
posterCarousel.addEventListener("touchend", event => {
  const distance = event.changedTouches[0].clientX - swipeStartX;
  if (Math.abs(distance) > 45) movePoster(distance > 0 ? -1 : 1);
}, { passive: true });

renderPosterCarousel();
restartPosterTimer();

function loadSheetWithJsonp() {
  return new Promise((resolve, reject) => {
    const callbackName = `sportsSheetCallback_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => finish(new Error("成绩表连接超时")), 8000);
    function finish(error, data) {
      clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      error ? reject(error) : resolve(data);
    }
    window[callbackName] = data => finish(null, data);
    script.onerror = () => finish(new Error("无法连接成绩表"));
    script.src = `${SHEET_JSON_URL}&tqx=out:json;responseHandler:${callbackName}&cacheBust=${Date.now()}`;
    document.head.append(script);
  });
}

render();
refreshScores();
setInterval(refreshScores, REFRESH_INTERVAL);
