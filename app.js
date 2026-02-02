const LS_KEY = "vote_sim_v1";

const el = (id) => document.getElementById(id);

const state = {
  title: "",
  options: ["A", "B", "C"],
  voters: [] // each voter: { ranking: ["A","B","C"] }
};

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}
function load() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.options)) {
      state.title = s.title ?? "";
      state.options = s.options;
      state.voters = Array.isArray(s.voters) ? s.voters : [];
    }
  } catch {}
}

function resetAll() {
  state.title = "";
  state.options = ["A", "B", "C"];
  state.voters = [];
  save();
  renderAll();
}

function addOption(opt) {
  const v = opt.trim();
  if (!v) return;
  if (state.options.includes(v)) return;

  state.options.push(v);

  // aggiorna ranking votanti: aggiunge in coda la nuova opzione
  for (const voter of state.voters) {
    voter.ranking.push(v);
  }

  save();
  renderAll();
}

function removeOption(opt) {
  if (state.options.length <= 2) return; // almeno 2 opzioni
  state.options = state.options.filter(o => o !== opt);

  // rimuovi da ranking
  for (const voter of state.voters) {
    voter.ranking = voter.ranking.filter(o => o !== opt);
  }

  save();
  renderAll();
}

function addVoter() {
  // ranking default: ordine attuale
  state.voters.push({ ranking: [...state.options] });
  save();
  renderAll();
}

function removeVoter(idx) {
  state.voters.splice(idx, 1);
  save();
  renderAll();
}

function updateVoterRank(idx, pos, newOpt) {
  const r = state.voters[idx].ranking;

  // swap semplice: se newOpt già presente, scambia posizioni
  const j = r.indexOf(newOpt);
  if (j === -1) return;
  [r[pos], r[j]] = [r[j], r[pos]];

  save();
  renderAll();
}

function getRankings() {
  return state.voters.map(v => v.ranking);
}

/* ---------- RENDER ---------- */
function renderOptions() {
  el("titleInput").value = state.title;

  const wrap = el("optionsChips");
  wrap.innerHTML = "";
  for (const o of state.options) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${escapeHtml(o)}</span>
      <button class="x" title="Rimuovi">✕</button>
    `;
    chip.querySelector("button").addEventListener("click", () => removeOption(o));
    wrap.appendChild(chip);
  }
}

function renderVoters() {
  const wrap = el("votersWrap");
  wrap.innerHTML = "";

  if (state.options.length < 2) {
    wrap.innerHTML = `<p class="muted">Aggiungi almeno 2 alternative.</p>`;
    return;
  }

  if (state.voters.length === 0) {
    wrap.innerHTML = `<p class="muted">Nessun votante ancora. Clicca “Aggiungi votante”.</p>`;
    return;
  }

  state.voters.forEach((voter, idx) => {
    const card = document.createElement("div");
    card.className = "voter";

    const head = document.createElement("div");
    head.className = "voter-head";
    head.innerHTML = `
      <div class="voter-title">Votante ${idx + 1}</div>
      <div class="voter-actions">
        <button type="button">Rimuovi</button>
      </div>
    `;
    head.querySelector("button").addEventListener("click", () => removeVoter(idx));
    card.appendChild(head);

    // per ogni posizione in classifica, un select (con swap)
    for (let pos = 0; pos < state.options.length; pos++) {
      const row = document.createElement("div");
      row.className = "rank-row";
      row.innerHTML = `
        <div class="muted">${pos + 1}ª scelta</div>
        <select></select>
      `;
      const sel = row.querySelector("select");
      for (const opt of voter.ranking) {
        const op = document.createElement("option");
        op.value = opt;
        op.textContent = opt;
        sel.appendChild(op);
      }
      sel.value = voter.ranking[pos];
      sel.addEventListener("change", (e) => updateVoterRank(idx, pos, e.target.value));
      card.appendChild(row);
    }

    wrap.appendChild(card);
  });
}

function renderResults() {
  const options = state.options;
  const rankings = getRankings();
  const err = window.VoteEngine.assertValidElection(options, rankings);

  const panes = {
    majority: el("tab-majority"),
    condorcet: el("tab-condorcet"),
    irv: el("tab-irv"),
    borda: el("tab-borda"),
    coombs: el("tab-coombs"),
    theory: el("tab-theory"),
  };

  if (err) {
    for (const k in panes) panes[k].innerHTML = `<p class="muted">${escapeHtml(err)}</p>`;
    panes.theory.innerHTML = theoryHtml();
    return;
  }

  // Majority + runoff
  const maj = window.VoteEngine.majorityAbsoluteWinner(options, rankings);
  const runoff = window.VoteEngine.runoffTop2(options, rankings);
  panes.majority.innerHTML = majorityHtml(options, rankings.length, maj, runoff);

  // Condorcet + Schulze
  const M = window.VoteEngine.pairwiseMatrix(options, rankings);
  const cw = window.VoteEngine.condorcetWinner(options, M);
  const schulze = window.VoteEngine.schulzeWinner(options, M);
  panes.condorcet.innerHTML = condorcetHtml(options, M, cw, schulze);

  // IRV
  const irv = window.VoteEngine.irv(options, rankings);
  panes.irv.innerHTML = irvHtml(irv);

  // Borda
  const b = window.VoteEngine.borda(options, rankings);
  panes.borda.innerHTML = bordaHtml(b);

  // Coombs
  const c = window.VoteEngine.coombs(options, rankings);
  panes.coombs.innerHTML = coombsHtml(c);

  // Theory
  panes.theory.innerHTML = theoryHtml();
}

function renderAll() {
  renderOptions();
  renderVoters();
  renderResults();
}

/* ---------- HTML helpers ---------- */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

function tableFromCounts(counts, total) {
  const rows = Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td><td>${((v/total)*100).toFixed(1)}%</td></tr>`)
    .join("");
  return `
    <table class="table">
      <thead><tr><th>Alternativa</th><th>Voti</th><th>%</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function majorityHtml(options, totalVoters, maj, runoff) {
  const absText = maj.winner
    ? `<p><span class="badge">Maggioranza assoluta</span> Vince <b>${escapeHtml(maj.winner)}</b> perché supera 50% + 1 (su ${totalVoters} votanti).</p>`
    : `<p><span class="badge">Maggioranza assoluta</span> Nessuna alternativa supera il 50% + 1 ⇒ serve un ballottaggio.</p>`;

  const runoffWinnerText = runoff.winner
    ? `<p><span class="badge">Ballottaggio top-2</span> Tra <b>${escapeHtml(runoff.top2[0])}</b> e <b>${escapeHtml(runoff.top2[1])}</b> vince <b>${escapeHtml(runoff.winner)}</b> usando le preferenze nelle classifiche.</p>`
    : `<p><span class="badge">Ballottaggio top-2</span> Pareggio tra le due alternative al ballottaggio.</p>`;

  const pair = runoff.pair;
  const [x,y] = runoff.top2;
  const pairTable = `
    <table class="table">
      <thead><tr><th>Confronto</th><th>Preferito</th><th>Voti</th></tr></thead>
      <tbody>
        <tr><td>${escapeHtml(x)} vs ${escapeHtml(y)}</td><td>${escapeHtml(x)}</td><td>${pair[x]}</td></tr>
        <tr><td>${escapeHtml(y)} vs ${escapeHtml(x)}</td><td>${escapeHtml(y)}</td><td>${pair[y]}</td></tr>
      </tbody>
    </table>
  `;

  return `
    ${absText}
    <h3>Prime scelte (plurality)</h3>
    ${tableFromCounts(maj.counts, totalVoters)}
    ${!maj.winner ? `<h3>Ballottaggio</h3>${runoffWinnerText}${pairTable}` : ""}
  `;
}

function condorcetHtml(options, M, cw, schulze) {
  const matrixRows = options.map(a => {
    const tds = options.map(b => {
      if (a === b) return `<td class="muted">—</td>`;
      const v = M[a][b];
      const w = M[b][a];
      const win = v > w;
      return `<td>${v} ${win ? "✅" : ""}</td>`;
    }).join("");
    return `<tr><th>${escapeHtml(a)}</th>${tds}</tr>`;
  }).join("");

  const cwText = cw
    ? `<p><span class="badge">Condorcet</span> Esiste un vincitore di Condorcet: <b>${escapeHtml(cw)}</b> (batte ogni altra alternativa nei confronti a coppie).</p>`
    : `<p><span class="badge">Condorcet</span> Nessun vincitore di Condorcet ⇒ possibile ciclo di Condorcet. Usiamo Schulze.</p>`;

  const schulzeText = schulze.winner
    ? `<p><span class="badge">Schulze</span> Vincitore (strongest paths): <b>${escapeHtml(schulze.winner)}</b>.</p>`
    : `<p><span class="badge">Schulze</span> Nessun vincitore unico (pareggio).</p>`;

  return `
    ${cwText}
    ${!cw ? schulzeText : ""}
    <h3>Matrice a coppie (voti che preferiscono riga &gt; colonna)</h3>
    <table class="table">
      <thead>
        <tr><th></th>${options.map(o => `<th>${escapeHtml(o)}</th>`).join("")}</tr>
      </thead>
      <tbody>${matrixRows}</tbody>
    </table>
  `;
}

function irvHtml(irv) {
  const rounds = irv.rounds.map((r, i) => {
    const rows = Object.entries(r.counts)
      .sort((a,b) => b[1]-a[1])
      .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join("");
    return `
      <h3>Round ${i+1}</h3>
      <table class="table">
        <thead><tr><th>Alternativa</th><th>Voti (prima preferenza tra le attive)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${r.winner ? `<p><b>Vince ${escapeHtml(r.winner)}</b> (maggioranza assoluta raggiunta).</p>` : `<p class="muted">Nessuna maggioranza assoluta: si elimina l’ultima e si trasferiscono i voti.</p>`}
    `;
  }).join("");
  return `<p><span class="badge">IRV</span> Vincitore: <b>${escapeHtml(irv.winner)}</b></p>${rounds}`;
}

function bordaHtml(b) {
  const rows = Object.entries(b.score)
    .sort((a,b2) => b2[1]-a[1])
    .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join("");
  return `
    <p><span class="badge">Borda</span> Vincitore: <b>${escapeHtml(b.winner)}</b></p>
    <table class="table">
      <thead><tr><th>Alternativa</th><th>Punti</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function coombsHtml(c) {
  const rounds = c.rounds.map((r, i) => {
    const firstRows = Object.entries(r.firstCounts).sort((a,b)=>b[1]-a[1])
      .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join("");
    const lastRows = Object.entries(r.lastCounts).sort((a,b)=>b[1]-a[1])
      .map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join("");
    return `
      <h3>Round ${i+1}</h3>
      <div class="grid">
        <div>
          <div class="muted">Prime preferenze</div>
          <table class="table"><thead><tr><th>Alt</th><th>Voti</th></tr></thead><tbody>${firstRows}</tbody></table>
        </div>
        <div>
          <div class="muted">Ultimi posti</div>
          <table class="table"><thead><tr><th>Alt</th><th>Ultimi</th></tr></thead><tbody>${lastRows}</tbody></table>
        </div>
      </div>
      ${r.winner ? `<p><b>Vince ${escapeHtml(r.winner)}</b> (maggioranza assoluta raggiunta).</p>` : `<p class="muted">Si elimina chi è più spesso all’ultimo posto.</p>`}
    `;
  }).join("");
  return `<p><span class="badge">Coombs</span> Vincitore: <b>${escapeHtml(c.winner)}</b></p>${rounds}`;
}

function theoryHtml() {
  return `
    <h3>Principi e note</h3>
    <ul>
      <li><b>Maggioranza assoluta</b>: se un’alternativa supera 50% + 1, deve essere scelta.</li>
      <li><b>Ballottaggio</b>: se non c’è maggioranza assoluta, confronto tra le prime due alternative.</li>
      <li><b>Condorcet</b>: se un’alternativa batte tutte le altre a coppie, dovrebbe vincere.</li>
      <li><b>Ciclo di Condorcet</b>: può non esistere un vincitore (paradosso di Condorcet).</li>
      <li><b>Schulze</b>: risolve i cicli usando i “percorsi più forti” nel grafo delle preferenze.</li>
      <li><b>IIA</b> (indipendenza alternative irrilevanti): cambiare preferenze su alternative “fuori” da un sottoinsieme non dovrebbe cambiare l’ordine “dentro” (Schulze in generale <b>non</b> la soddisfa).</li>
      <li><b>Arrow</b>: non esiste un metodo perfetto che soddisfi simultaneamente universalità, unanimità, IIA e non-dittatorialità.</li>
    </ul>
  `;
}

/* ---------- EVENTI UI ---------- */
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(t => {
    t.addEventListener("click", () => {
      tabs.forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      const name = t.dataset.tab;
      document.querySelectorAll(".tabpane").forEach(p => p.classList.add("hidden"));
      document.getElementById(`tab-${name}`).classList.remove("hidden");
    });
  });
}

function init() {
  load();

  el("addOptionBtn").addEventListener("click", () => addOption(el("optionInput").value));
  el("optionInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addOption(el("optionInput").value);
  });

  el("titleInput").addEventListener("input", (e) => {
    state.title = e.target.value;
    save();
  });

  el("addVoterBtn").addEventListener("click", addVoter);

  el("resetBtn").addEventListener("click", resetAll);
  el("saveBtn").addEventListener("click", () => { save(); alert("Salvato!"); });

  initTabs();
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
