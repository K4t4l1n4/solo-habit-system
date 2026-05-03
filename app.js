const XP_PER_LEVEL   = 3500;
const TOTAL_DAILY_XP = 660;   // 120+120+120+100+100+50+50
const HP_MAX         = TOTAL_DAILY_XP; // HP refleja directamente el XP ganado hoy
const LS_KEY         = "soloHabitV1";

/* ── Pesos de estadísticas por misión ── */
const QUEST_STAT_WEIGHTS = {
  abs:     { Fuerza: 100, Enfoque: 100, Disciplina: 100, Conocimiento:  60, Mentalidad: 100 },
  squat:   { Fuerza: 100, Enfoque: 100, Disciplina: 100, Conocimiento:  60, Mentalidad: 100 },
  pushup:  { Fuerza: 100, Enfoque: 100, Disciplina: 100, Conocimiento:  60, Mentalidad: 100 },
  webdev:  { Fuerza:  30, Enfoque: 100, Disciplina: 100, Conocimiento: 100, Mentalidad: 100 },
  english: { Fuerza:  30, Enfoque: 100, Disciplina: 100, Conocimiento: 100, Mentalidad: 100 },
  skin:    { Fuerza:  15, Enfoque:  60, Disciplina: 100, Conocimiento:  60, Mentalidad: 100 },
  teeth:   { Fuerza:  15, Enfoque:  60, Disciplina: 100, Conocimiento:  20, Mentalidad: 100 },
};

// Máximo posible por stat si todas las misiones se completan
const STAT_MAX = {
  Fuerza:      390,  // 100+100+100+30+30+15+15
  Enfoque:     620,  // 100+100+100+100+100+60+60
  Disciplina:  700,  // 100×7
  Conocimiento: 460, // 60+60+60+100+100+60+20
  Mentalidad:  700,  // 100×7
};

const state = {
  xp:             0,
  hp:             0,
  coins:          0,
  stats:          { Fuerza: 0, Enfoque: 0, Conocimiento: 0, Disciplina: 0, Mentalidad: 0 },
  completedDays:  {},
  rewardsClaimed: {},   // clave: "rewardId-YYYY-MM-DD"
  quests: [
    { id: "abs",     name: "100 Abdominales",       detail: "Completa 100 abdominales",       xp: 120, stat: "Fuerza",       done: false },
    { id: "squat",   name: "100 Sentadillas",        detail: "Completa 100 sentadillas",        xp: 120, stat: "Fuerza",       done: false },
    { id: "pushup",  name: "100 Flexiones de brazo", detail: "Completa 100 flexiones de brazo", xp: 120, stat: "Fuerza",       done: false },
    { id: "webdev",  name: "Desarrollo web",          detail: "Practica desarrollo web",          xp: 100, stat: "Conocimiento", done: false },
    { id: "english", name: "Inglés",                  detail: "Practica inglés hoy",              xp: 100, stat: "Enfoque",      done: false },
    { id: "skin",    name: "Skincare",                detail: "Rutina completa de skincare",       xp:  50, stat: "Disciplina",   done: false },
    { id: "teeth",   name: "Lavado de dientes",       detail: "Lavar y cepillar los dientes",      xp:  50, stat: "Mentalidad",   done: false },
  ]
};

const ranks    = ["E", "D", "C", "B", "A", "S"];
const questList = document.querySelector("#questList");
const statGrid  = document.querySelector("#statGrid");
const weekGrid  = document.querySelector("#weekGrid");
const rankPath  = document.querySelector("#rankPath");
const toast     = document.querySelector("#toast");
const radar     = document.querySelector("#radar");
const ctx       = radar.getContext("2d");

/* ── helpers ── */

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLevel()         { return Math.floor(state.xp / XP_PER_LEVEL) + 1; }
function getLevelProgress() { return state.xp % XP_PER_LEVEL; }

function calculateStreak() {
  let streak = 0;
  const base = new Date();
  for (let i = 0; i < 366; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (state.completedDays[key]) { streak++; } else { break; }
  }
  return streak;
}

function getRank() {
  if (calculateStreak() >= 30) return "A";
  return ranks[Math.min(ranks.length - 1, Math.floor((getLevel() - 1) / 2))];
}

/* HP = XP ganado hoy directamente (sin escalar) */
function hpForQuest(quest) {
  return quest.xp;
}

/* Recalcula las estadísticas del héroe según las misiones completadas hoy */
function recalcStats() {
  const earned = { Fuerza: 0, Enfoque: 0, Disciplina: 0, Conocimiento: 0, Mentalidad: 0 };
  state.quests.forEach(q => {
    if (q.done && QUEST_STAT_WEIGHTS[q.id]) {
      Object.entries(QUEST_STAT_WEIGHTS[q.id]).forEach(([stat, pct]) => {
        earned[stat] += pct;
      });
    }
  });
  Object.keys(earned).forEach(stat => {
    state.stats[stat] = Math.round((earned[stat] / STAT_MAX[stat]) * 100);
  });
}

/* ── persistence ── */

function saveProgress() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    xp:             state.xp,
    coins:          state.coins,
    completedDays:  state.completedDays,
    rewardsClaimed: state.rewardsClaimed,
    questsDone:     Object.fromEntries(state.quests.map(q => [q.id, q.done])),
    questDate:      getTodayStr()
  }));
}

function loadProgress() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.xp    = data.xp    || 0;
    state.coins = data.coins || 0;
    if (data.completedDays)  state.completedDays  = data.completedDays;
    if (data.rewardsClaimed) state.rewardsClaimed = data.rewardsClaimed;
    if (data.questDate === getTodayStr() && data.questsDone) {
      state.quests.forEach(q => { q.done = Boolean(data.questsDone[q.id]); });
      // HP = suma de XP de misiones completadas hoy
      state.hp = state.quests.filter(q => q.done).reduce((sum, q) => sum + q.xp, 0);
      // Agregar XP de recompensas reclamadas hoy al HP
      const today = getTodayStr();
      if (state.rewardsClaimed[`lectura-${today}`])   state.hp += 50;
      if (state.rewardsClaimed[`no-fumar-${today}`])  state.hp += 100;
    }
    recalcStats();
  } catch (_) {}
}

/* ── toast ── */

function showToast(message) {
  document.querySelector("#toastMsg").textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ── render ── */

function renderQuests() {
  questList.innerHTML = "";
  state.quests.forEach(quest => {
    const button = document.createElement("button");
    button.className = `quest${quest.done ? " done" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span class="check">✓</span>
      <span><strong>${quest.name}</strong><small>${quest.detail} · ${quest.stat}</small></span>
      <span class="quest-xp">+${quest.xp} XP</span>
    `;
    button.addEventListener("click", () => toggleQuest(quest.id));
    questList.append(button);
  });
}

function renderStats() {
  statGrid.innerHTML = "";
  Object.entries(state.stats).forEach(([name, value]) => {
    const item = document.createElement("div");
    item.className = "stat-pill";
    item.innerHTML = `<span>${name}</span><strong>${value}/100</strong>`;
    statGrid.append(item);
  });
  drawRadar();
}

function renderCalendar() {
  const today       = new Date();
  const year        = today.getFullYear();
  const month       = today.getMonth();
  const todayDate   = today.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rawFirst    = new Date(year, month, 1).getDay();
  const offset      = rawFirst === 0 ? 6 : rawFirst - 1;

  const MONTH_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const monthEl = document.querySelector("#calendarMonth");
  if (monthEl) monthEl.textContent = `${MONTH_NAMES[month]} ${year}`;

  weekGrid.innerHTML = "";

  ["L","M","X","J","V","S","D"].forEach(d => {
    const h = document.createElement("div");
    h.className = "day-header";
    h.textContent = d;
    weekGrid.append(h);
  });

  for (let i = 0; i < offset; i++) {
    const e = document.createElement("div");
    e.className = "day-cell empty";
    weekGrid.append(e);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr    = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday    = d === todayDate;
    const isComplete = Boolean(state.completedDays[dateStr]);
    const isFuture   = d > todayDate;
    const cell = document.createElement("div");
    cell.className = `day-cell${isComplete ? " complete" : ""}${isToday ? " today" : ""}${isFuture && !isComplete ? " future" : ""}`;
    cell.textContent = d;
    weekGrid.append(cell);
  }
}

function renderRankPath() {
  rankPath.innerHTML = "";
  const activeRank = getRank();
  ranks.slice(0, 5).forEach(rank => {
    const node = document.createElement("div");
    node.className = `rank-node${rank === activeRank ? " active" : ""}`;
    node.textContent = rank;
    rankPath.append(node);
  });
}

function renderRewards() {
  const streak  = calculateStreak();
  const today   = getTodayStr();
  const lectClaimed    = Boolean(state.rewardsClaimed[`lectura-${today}`]);
  const fumarClaimed   = Boolean(state.rewardsClaimed[`no-fumar-${today}`]);
  const streakUnlocked = streak >= 21;

  const diaBtn   = document.querySelector("#rewardDia");
  const lectBtn  = document.querySelector("#rewardLectura");
  const fumarBtn = document.querySelector("#rewardFumar");

  if (diaBtn) {
    diaBtn.disabled = !streakUnlocked;
    diaBtn.title = streakUnlocked
      ? "¡Racha de 21 días desbloqueada!"
      : `Necesitas ${21 - streak} días más de racha`;
    diaBtn.querySelector("small").textContent = streakUnlocked
      ? `¡Racha de ${streak} días! Día libre merecido`
      : `Racha actual: ${streak}/21 días`;
  }
  if (lectBtn)  { lectBtn.disabled  = lectClaimed;  }
  if (fumarBtn) { fumarBtn.disabled = fumarClaimed; }
}

function drawRadar() {
  const labels = ["Fuerza", "Enfoque", "Disciplina", "Conocimiento", "Mentalidad"];
  const values = labels.map(l => state.stats[l] ?? 0);
  const center = 150, maxRadius = 96;
  ctx.clearRect(0, 0, 300, 300);
  ctx.lineWidth = 1;
  ctx.font = "12px Inter";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Anillos de fondo
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    labels.forEach((_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / labels.length;
      const r = (maxRadius / 4) * ring;
      const x = center + Math.cos(angle) * r, y = center + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(170, 0, 255, 0.3)";
    ctx.stroke();
  }

  // Líneas de ejes y etiquetas
  labels.forEach((label, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / labels.length;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.cos(angle) * maxRadius, center + Math.sin(angle) * maxRadius);
    ctx.strokeStyle = "rgba(170, 0, 255, 0.25)";
    ctx.stroke();
    ctx.fillStyle = "#c8a8e0";
    ctx.fillText(label, center + Math.cos(angle) * 126, center + Math.sin(angle) * 126);
  });

  // Polígono de valores — solo dibujar si hay al menos un stat > 0
  const hasValues = values.some(v => v > 0);
  if (hasValues) {
    ctx.beginPath();
    values.forEach((value, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / values.length;
      const r = (Math.min(value, 100) / 100) * maxRadius;
      const x = center + Math.cos(angle) * r, y = center + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(165, 0, 255, 0.38)";
    ctx.strokeStyle = "#ff00cc";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Puntos en cada vértice
    values.forEach((value, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / values.length;
      const r = (Math.min(value, 100) / 100) * maxRadius;
      const x = center + Math.cos(angle) * r, y = center + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ff00cc";
      ctx.fill();
    });
  }
}

function renderHUD() {
  const level    = getLevel();
  const progress = getLevelProgress();
  const streak   = calculateStreak();
  const completed = state.quests.filter(q => q.done).length;
  const total     = state.quests.length;

  document.querySelector("#levelText").textContent  = level;
  document.querySelector("#levelBadge").textContent = `LV ${level}`;
  document.querySelector("#xpText").textContent     = `${state.xp} XP`;
  document.querySelector("#xpFill").style.width     = `${(progress / XP_PER_LEVEL) * 100}%`;
  document.querySelector("#xpProgress").textContent =
    `${progress.toLocaleString()} / ${XP_PER_LEVEL.toLocaleString()} XP al siguiente nivel`;
  document.querySelector("#rankTitle").textContent  = `Cazador ${getRank()}`;
  document.querySelector("#coinText").textContent   = `${state.coins}G`;
  document.querySelector("#streakText").textContent = streak;
  document.querySelector("#hpValue").textContent    = `HP ${state.hp} / ${HP_MAX}`;
  document.querySelector("#hpBar").style.width      = `${Math.min(100, (state.hp / HP_MAX) * 100)}%`;

  const bossP = document.querySelector(".boss-card p");
  if (completed >= total) {
    bossP.textContent = "Golpe crítico activado. La racha de hoy queda protegida.";
  } else if (streak >= 30) {
    bossP.textContent = `¡Racha de ${streak} días activa! Rango A desbloqueado automáticamente. Completa ${total - completed} misiones más.`;
  } else {
    const left = 30 - streak;
    bossP.textContent = `Completa ${total - completed} misiones más. ${streak > 0 ? `Racha: ${streak} días (${left} para Rango A).` : "Mantén la racha 30 días para ascender a Rango A."}`;
  }
  renderRankPath();
  renderRewards();
}

function render() {
  renderQuests();
  renderStats();
  renderCalendar();
  renderHUD();
}

/* ── actions ── */

function toggleQuest(id) {
  const quest = state.quests.find(q => q.id === id);
  if (!quest || quest.done) return;
  quest.done   = true;
  state.xp    += quest.xp;
  state.coins += Math.round(quest.xp * 1.8);
  state.hp    += hpForQuest(quest);   // HP += XP de la misión
  recalcStats();
  state.completedDays[getTodayStr()] = true;
  showToast(`Misión completada: +${quest.xp} XP`);
  saveProgress();
  render();
}

function claimReward(rewardId, xpBonus, label) {
  const key = `${rewardId}-${getTodayStr()}`;
  if (state.rewardsClaimed[key]) {
    showToast("Ya reclamaste esta recompensa hoy.");
    return;
  }
  state.rewardsClaimed[key] = true;
  state.xp   += xpBonus;
  state.hp   += xpBonus;           // HP también sube con el bonus
  state.coins += Math.round(xpBonus * 1.2);
  showToast(`${label}: +${xpBonus} XP obtenidos.`);
  saveProgress();
  render();
}

function claimDiaLibre() {
  const streak = calculateStreak();
  if (streak < 21) {
    showToast(`Necesitas ${21 - streak} días más de racha para el día libre.`);
    return;
  }
  showToast(`¡Felicidades! Tienes ${streak} días de racha. ¡Día libre merecido, cazadora!`);
}

function resetDay() {
  state.hp = 0;
  state.quests = state.quests.filter(q => !q.id.startsWith("extra-"));
  state.quests.forEach(q => { q.done = false; });
  recalcStats();
  delete state.completedDays[getTodayStr()];
  // Limpiar recompensas de hoy
  const today = getTodayStr();
  Object.keys(state.rewardsClaimed).forEach(k => {
    if (k.endsWith(today)) delete state.rewardsClaimed[k];
  });
  showToast("Misiones del día reiniciadas.");
  saveProgress();
  render();
}

/* ── listeners ── */

document.querySelector("#resetDay").addEventListener("click", resetDay);

document.querySelector("#rewardDia")?.addEventListener("click", claimDiaLibre);
document.querySelector("#rewardLectura")?.addEventListener("click", () => {
  claimReward("lectura", 50, "Lectura completada");
});
document.querySelector("#rewardFumar")?.addEventListener("click", () => {
  claimReward("no-fumar", 100, "No fumaste hoy");
});

/* ── avatar picker ── */

const SHADOW_COUNT = 6;
let selectedAvatar = Number(localStorage.getItem("avatar") ?? "-1");

function applyAvatar() {
  const img  = document.querySelector("#avatarImg");
  const face = document.querySelector("#avatarFace");
  if (selectedAvatar >= 0) {
    img.src = `avatars/shadow-${selectedAvatar + 1}.svg`;
    img.hidden = false;
    face.hidden = true;
  } else {
    img.hidden  = true;
    face.hidden = false;
  }
}

function openAvatarModal() {
  const grid = document.querySelector("#avatarGrid");
  grid.innerHTML = "";
  for (let i = 0; i < SHADOW_COUNT; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `avatar-option${i === selectedAvatar ? " selected" : ""}`;
    btn.setAttribute("aria-label", `Soldado sombra ${i + 1}`);
    const img = document.createElement("img");
    img.src = `avatars/shadow-${i + 1}.svg`;
    img.alt = "";
    btn.append(img);
    btn.addEventListener("click", () => selectAvatar(i));
    grid.append(btn);
  }
  document.querySelector("#avatarModal").hidden = false;
}

function closeAvatarModal() {
  document.querySelector("#avatarModal").hidden = true;
}

function selectAvatar(index) {
  selectedAvatar = index;
  localStorage.setItem("avatar", index);
  applyAvatar();
  document.querySelectorAll(".avatar-option").forEach((btn, i) => btn.classList.toggle("selected", i === index));
  showToast("Avatar de soldado sombra equipado.");
  window.setTimeout(closeAvatarModal, 700);
}

document.querySelector("#avatarRing").addEventListener("click", openAvatarModal);
document.querySelector("#avatarRing").addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAvatarModal(); }
});
document.querySelector("#closeAvatar").addEventListener("click", closeAvatarModal);
document.querySelector("#avatarModal").addEventListener("click", e => {
  if (e.target === e.currentTarget) closeAvatarModal();
});

/* ── init ── */
loadProgress();
applyAvatar();
render();
