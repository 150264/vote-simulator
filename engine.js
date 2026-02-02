// engine.js
// Funzioni pure per calcolare risultati dai ranking (preferenze strette)

function assertValidElection(options, rankings) {
  if (!options || options.length < 2) return "Servono almeno 2 alternative.";
  if (!rankings || rankings.length < 1) return "Aggiungi almeno 1 votante.";
  for (const r of rankings) {
    if (!r || r.length !== options.length) return "Ogni votante deve ordinare tutte le alternative.";
    const set = new Set(r);
    if (set.size !== options.length) return "Nelle preferenze ci sono duplicati o valori mancanti.";
  }
  return null;
}

// Plurality: conta solo la prima scelta
function pluralityCounts(options, rankings) {
  const counts = Object.fromEntries(options.map(o => [o, 0]));
  for (const r of rankings) counts[r[0]]++;
  return counts;
}

function majorityAbsoluteWinner(options, rankings) {
  const counts = pluralityCounts(options, rankings);
  const n = rankings.length;
  for (const o of options) {
    if (counts[o] > n / 2) return { winner: o, counts };
  }
  return { winner: null, counts };
}

// Ballottaggio top-2: prendo le due più votate al 1° posto, poi confronto usando ranking
function runoffTop2(options, rankings) {
  const counts = pluralityCounts(options, rankings);
  const sorted = [...options].sort((a, b) => counts[b] - counts[a]);
  const top2 = sorted.slice(0, 2);
  const [x, y] = top2;

  let xWins = 0, yWins = 0;
  for (const r of rankings) {
    const ix = r.indexOf(x);
    const iy = r.indexOf(y);
    if (ix < iy) xWins++;
    else yWins++;
  }

  const winner = xWins > yWins ? x : (yWins > xWins ? y : null);
  return { top2, countsFirst: counts, pair: { [x]: xWins, [y]: yWins }, winner };
}

// Matrice pairwise: M[a][b] = quanti preferiscono a a b
function pairwiseMatrix(options, rankings) {
  const M = {};
  for (const a of options) {
    M[a] = {};
    for (const b of options) if (a !== b) M[a][b] = 0;
  }

  for (const r of rankings) {
    const pos = Object.fromEntries(r.map((opt, i) => [opt, i]));
    for (const a of options) {
      for (const b of options) {
        if (a === b) continue;
        if (pos[a] < pos[b]) M[a][b] += 1;
      }
    }
  }
  return M;
}

// Vincitore di Condorcet: batte ogni altro in confronto a coppie
function condorcetWinner(options, M) {
  for (const a of options) {
    let beatsAll = true;
    for (const b of options) {
      if (a === b) continue;
      if (M[a][b] <= M[b][a]) { beatsAll = false; break; }
    }
    if (beatsAll) return a;
  }
  return null;
}

// Schulze: strongest paths
// p[a][b] = forza del percorso più forte da a a b
function schulzeWinner(options, M) {
  const p = {};
  for (const a of options) {
    p[a] = {};
    for (const b of options) {
      if (a === b) continue;
      p[a][b] = (M[a][b] > M[b][a]) ? M[a][b] : 0;
    }
  }

  for (const i of options) {
    for (const j of options) {
      if (i === j) continue;
      for (const k of options) {
        if (i === k || j === k) continue;
        p[j][k] = Math.max(p[j][k], Math.min(p[j][i], p[i][k]));
      }
    }
  }

  // a vince se per ogni b: p[a][b] >= p[b][a]
  const winners = [];
  for (const a of options) {
    let ok = true;
    for (const b of options) {
      if (a === b) continue;
      if (p[a][b] < p[b][a]) { ok = false; break; }
    }
    if (ok) winners.push(a);
  }

  // può esserci più di un vincitore (pareggi). scegliamo il primo per MVP
  return { winner: winners[0] ?? null, p, winners };
}

// IRV (Alternative Vote): elimina il meno votato al 1° posto e trasferisce
function irv(options, rankings) {
  let active = [...options];
  const rounds = [];

  while (active.length > 1) {
    const counts = Object.fromEntries(active.map(o => [o, 0]));
    for (const r of rankings) {
      const firstActive = r.find(o => active.includes(o));
      counts[firstActive] += 1;
    }

    const total = rankings.length;
    const winner = active.find(o => counts[o] > total / 2) ?? null;
    rounds.push({ active: [...active], counts: { ...counts }, winner });

    if (winner) return { winner, rounds };

    // elimina minimo (tie-break: elimina quello in fondo alfabetico)
    const minVotes = Math.min(...active.map(o => counts[o]));
    const losers = active.filter(o => counts[o] === minVotes).sort();
    const eliminated = losers[0];
    active = active.filter(o => o !== eliminated);
  }

  return { winner: active[0] ?? null, rounds };
}

// Coombs: elimina l'opzione più spesso all'ultimo posto (tra le attive)
function coombs(options, rankings) {
  let active = [...options];
  const rounds = [];

  while (active.length > 1) {
    // check majority on first
    const firstCounts = Object.fromEntries(active.map(o => [o, 0]));
    for (const r of rankings) {
      const firstActive = r.find(o => active.includes(o));
      firstCounts[firstActive] += 1;
    }
    const total = rankings.length;
    const majWinner = active.find(o => firstCounts[o] > total / 2) ?? null;

    // last-place counts
    const lastCounts = Object.fromEntries(active.map(o => [o, 0]));
    for (const r of rankings) {
      const lastActive = [...r].reverse().find(o => active.includes(o));
      lastCounts[lastActive] += 1;
    }

    rounds.push({ active: [...active], firstCounts: { ...firstCounts }, lastCounts: { ...lastCounts }, winner: majWinner });
    if (majWinner) return { winner: majWinner, rounds };

    const maxLast = Math.max(...active.map(o => lastCounts[o]));
    const losers = active.filter(o => lastCounts[o] === maxLast).sort();
    const eliminated = losers[0];
    active = active.filter(o => o !== eliminated);
  }

  return { winner: active[0] ?? null, rounds };
}

// Borda classico: con n opzioni, top prende n-1 punti, ultimo 0
function borda(options, rankings) {
  const n = options.length;
  const score = Object.fromEntries(options.map(o => [o, 0]));
  for (const r of rankings) {
    for (let i = 0; i < r.length; i++) {
      score[r[i]] += (n - 1 - i);
    }
  }
  const sorted = [...options].sort((a, b) => score[b] - score[a]);
  return { score, ranking: sorted, winner: sorted[0] ?? null };
}

// Export “globale” (per app.js)
window.VoteEngine = {
  assertValidElection,
  pluralityCounts,
  majorityAbsoluteWinner,
  runoffTop2,
  pairwiseMatrix,
  condorcetWinner,
  schulzeWinner,
  irv,
  borda,
  coombs
};
