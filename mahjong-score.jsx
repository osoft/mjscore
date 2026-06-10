import { useState } from "react";

const ALL_DEFAULT_PLAYERS = [
  { id: 1, name: "东家", score: 0, wins: 0 },
  { id: 2, name: "南家", score: 0, wins: 0 },
  { id: 3, name: "西家", score: 0, wins: 0 },
  { id: 4, name: "北家", score: 0, wins: 0 },
  { id: 5, name: "五家", score: 0, wins: 0 },
  { id: 6, name: "六家", score: 0, wins: 0 },
];

const FAN_PRESETS = [
  { label: "基础", value: 0 },
  { label: "1番", value: 1 },
  { label: "2番", value: 2 },
  { label: "3番", value: 3 },
  { label: "4番", value: 4 },
  { label: "满贯", value: 5 },
  { label: "大满贯", value: 6 },
];

function getBaseScore(fans) {
  return Math.pow(2, fans);
}

// ── State encode / decode (import-export code) ───────────────────────────────

function encodeState(players, round, history) {
  try {
    const state = { p: players, r: round, h: history };
    return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  } catch {
    return null;
  }
}

function decodeState(encoded) {
  try {
    const trimmed = encoded.trim();
    const state = JSON.parse(decodeURIComponent(escape(atob(trimmed))));
    if (!state.p || !Array.isArray(state.p) || state.p.length < 3 || state.p.length > 6) return null;
    return state;
  } catch {
    return null;
  }
}

// ── Decorative tiles ──────────────────────────────────────────────────────────

function TileDecor() {
  const tiles = ["🀇","🀈","🀉","🀙","🀚","🀛","🀐","🀑","🀒","🀄","🀅","🀆"];
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:0 }}>
      {tiles.map((t, i) => (
        <div key={i} style={{
          position:"absolute", fontSize:`${16+(i%3)*8}px`,
          opacity: 0.04+(i%4)*0.015,
          left:`${(i*137)%100}%`, top:`${(i*97+13)%100}%`,
          animation:`floatTile ${8+(i%5)*2}s ease-in-out ${i*0.7}s infinite alternate`,
          transform:`rotate(${(i%3-1)*15}deg)`, userSelect:"none",
        }}>{t}</div>
      ))}
    </div>
  );
}

// ── History item ──────────────────────────────────────────────────────────────

function ScoreHistoryItem({ entry, players }) {
  const loserNames = (entry.loserIds || []).map(id => players.find(p => p.id === id)?.name || "?");
  const winnerName = players.find(p => p.id === entry.winnerId)?.name || "?";
  const scoreDisplay = entry.winnerScore != null ? (entry.winnerScore > 0 ? `+${entry.winnerScore}` : `${entry.winnerScore}`) : "";
  const howStr = entry.isSelfDraw
    ? "自摸"
    : loserNames.length > 0 ? `被 ${loserNames.join("、")} 点炮` : "";
  return (
    <div style={{
      background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)",
      borderRadius:10, padding:"10px 14px", fontSize:13, color:"#bbb",
      display:"flex", alignItems:"center", gap:10,
    }}>
      <span style={{ fontSize:18 }}>🀄</span>
      <span style={{ flex:1 }}>
        <span style={{ color:"#e8c97a", fontWeight:700 }}>{winnerName}</span>
        {" 得分："}
        <span style={{ color:"#78d4a5", fontWeight:700 }}>{scoreDisplay}</span>
        {"　"}
        <span style={{ color:"#aaa" }}>{howStr}</span>
        {"　"}
        <span style={{ color:"#c8973a" }}>{entry.fansLabel}</span>
      </span>
      <span style={{ fontSize:12, color:"#555" }}>{entry.time}</span>
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────

function ShareModal({ code, onClose }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize:18, color:"#e8c97a", marginBottom:8, textAlign:"center", letterSpacing:2 }}>
          📤 导出牌局
        </h2>
        <p style={{ fontSize:13, color:"#666", textAlign:"center", marginBottom:16 }}>
          复制下方的导出码，发给其他玩家<br/>对方点「导入」粘贴即可继续记分
        </p>
        <div style={{
          background:"rgba(0,0,0,0.35)", border:"1px solid rgba(255,255,255,0.1)",
          borderRadius:10, padding:"12px 14px", marginBottom:16,
          fontSize:11, color:"#7a9", wordBreak:"break-all", lineHeight:1.7,
          maxHeight:100, overflowY:"auto", fontFamily:"monospace",
          userSelect:"all", cursor:"text",
        }}>
          {code || "生成失败"}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="btn-secondary" style={{ flex:1 }} onClick={onClose}>关闭</button>
          <button
            className="btn-primary"
            style={{ flex:2, background: copied ? "linear-gradient(135deg,#3a7a5a,#5ab87a)" : undefined }}
            onClick={copy}
          >
            {copied ? "✓ 已复制" : "复制导出码"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const NAMES_KEY = "mahjong_player_names";
const PLAYER_COUNT_KEY = "mahjong_player_count";

function loadSavedData() {
  let count = 4;
  let names = null;
  try {
    const savedCount = localStorage.getItem(PLAYER_COUNT_KEY);
    if (savedCount) {
      const n = parseInt(savedCount, 10);
      if (n >= 3 && n <= 6) count = n;
    }
    const savedNames = localStorage.getItem(NAMES_KEY);
    if (savedNames) {
      const parsed = JSON.parse(savedNames);
      if (Array.isArray(parsed)) names = parsed;
    }
  } catch {}
  return { count, names };
}

function saveNames(players) {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(players.map(p => p.name)));
  } catch {}
}

export default function MahjongScore() {
  const [playerCount, setPlayerCount] = useState(() => loadSavedData().count);
  const [pendingCount, setPendingCount] = useState(() => loadSavedData().count);
  const [players, setPlayers] = useState(() => {
    const { count, names } = loadSavedData();
    return ALL_DEFAULT_PLAYERS.slice(0, count).map((p, i) => ({
      ...p,
      name: names && names[i] ? names[i] : p.name,
    }));
  });
  const [round, setRound] = useState(1);
  const [history, setHistory] = useState([]);

  const [modal, setModal] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  const [editName, setEditName] = useState("");
  const [shareCode, setShareCode] = useState(null);
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState("");

  // Win form
  const [winnerId, setWinnerId] = useState(null);
  const [loserIds, setLoserIds] = useState([]);
  const [isSelfDraw, setIsSelfDraw] = useState(false);
  const [fans, setFans] = useState(0);

  const totalBase = getBaseScore(fans);
  const fansLabel = fans === 0 ? "基础分" : FAN_PRESETS.find(f => f.value === fans)?.label || `${fans}番`;

  function toggleLoser(id) {
    setLoserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function applyWin() {
    if (!winnerId) return;
    if (!isSelfDraw && loserIds.length === 0) return;
    const newPlayers = players.map(p => ({ ...p }));
    const winner = newPlayers.find(p => p.id === winnerId);

    if (isSelfDraw) {
      newPlayers.forEach(p => {
        if (p.id !== winnerId) {
          p.score -= totalBase;
          winner.score += totalBase;
        }
      });
    } else {
      loserIds.forEach(lid => {
        const loser = newPlayers.find(p => p.id === lid);
        if (loser) {
          loser.score -= totalBase;
          winner.score += totalBase;
        }
      });
    }

    winner.wins += 1;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;
    const newHistory = [{ id:Date.now(), winnerId, winnerScore: winner.score, loserIds: isSelfDraw ? [] : loserIds, isSelfDraw, fans, fansLabel, time, round }, ...history].slice(0, 50);

    setPlayers(newPlayers);
    setHistory(newHistory);
    setRound(r => r + 1);
    setModal(null);
    setWinnerId(null);
    setLoserIds([]);
    setIsSelfDraw(false);
    setFans(0);
  }

  function resetGame(keepNames, count) {
    const newCount = count || playerCount;
    const names = keepNames ? players.map(p => p.name) : null;
    const fresh = ALL_DEFAULT_PLAYERS.slice(0, newCount).map((p, i) => ({
      ...p,
      name: names && names[i] ? names[i] : p.name,
    }));
    setPlayerCount(newCount);
    setPlayers(fresh);
    try { localStorage.setItem(PLAYER_COUNT_KEY, String(newCount)); } catch {}
    saveNames(fresh);
    setRound(1);
    setHistory([]);
    setModal(null);
    setWinnerId(null);
    setLoserIds([]);
    setIsSelfDraw(false);
    setFans(0);
  }

  function undoLastRound() {
    if (history.length === 0) return;
    const last = history[0];
    const totalBase = getBaseScore(last.fans);
    const newPlayers = players.map(p => ({ ...p }));
    const winner = newPlayers.find(p => p.id === last.winnerId);
    if (last.isSelfDraw) {
      newPlayers.forEach(p => {
        if (p.id !== last.winnerId) {
          p.score += totalBase;
          winner.score -= totalBase;
        }
      });
    } else {
      (last.loserIds || []).forEach(lid => {
        const loser = newPlayers.find(p => p.id === lid);
        if (loser) {
          loser.score += totalBase;
          winner.score -= totalBase;
        }
      });
    }
    if (winner && winner.wins > 0) winner.wins -= 1;
    setPlayers(newPlayers);
    setHistory(prev => prev.slice(1));
    setRound(r => r - 1);
    setModal(null);
  }

  function openShare() {
    const code = encodeState(players, round, history);
    setShareCode(code);
    setModal("share");
  }

  function openImport() {
    setImportCode("");
    setImportError("");
    setModal("import");
  }

  function applyImport() {
    const state = decodeState(importCode);
    if (!state) {
      setImportError("无效的导入码，请检查后重试");
      return;
    }
    setPlayers(state.p);
    setPlayerCount(state.p.length);
    try { localStorage.setItem(PLAYER_COUNT_KEY, String(state.p.length)); } catch {}
    saveNames(state.p);
    setRound(state.r || 1);
    setHistory(state.h || []);
    setModal(null);
    setImportCode("");
    setImportError("");
  }

  function openEdit(idx) { setEditIdx(idx); setEditName(players[idx].name); setModal("edit"); }
  function saveEdit() {
    if (!editName.trim()) return;
    const updated = players.map((p, i) => i === editIdx ? { ...p, name: editName.trim() } : p);
    setPlayers(updated);
    saveNames(updated);
    setModal(null);
  }

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...players.map(p => p.score), 1);
  const minScore = Math.min(...players.map(p => p.score), -1);
  const scoreRange = maxScore - minScore || 1;

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg, #0f1a14 0%, #141f1a 40%, #0d1710 100%)",
      fontFamily:"'Noto Serif SC', 'Source Han Serif', Georgia, serif",
      color:"#e8e0d0", position:"relative",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes floatTile {
          from { transform: translateY(0) rotate(-10deg); }
          to { transform: translateY(-20px) rotate(10deg); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        .player-card { transition: transform 0.2s, box-shadow 0.2s; }
        .player-card:hover { transform: translateY(-2px); }
        .btn-primary {
          background: linear-gradient(135deg, #c8973a, #e8b84b);
          color: #1a1200; border: none; border-radius: 10px;
          padding: 12px 24px; font-size: 15px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: all 0.2s; letter-spacing: 1px;
        }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(200,151,58,0.4); }
        .btn-secondary {
          background: rgba(255,255,255,0.07); color: #bbb;
          border: 1px solid rgba(255,255,255,0.12); border-radius: 10px;
          padding: 10px 20px; font-size: 14px; cursor: pointer;
          font-family: inherit; transition: all 0.2s;
        }
        .btn-secondary:hover { background: rgba(255,255,255,0.12); color: #eee; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7);
          z-index: 100; display: flex; align-items: center; justify-content: center;
          animation: fadeIn 0.15s ease; padding: 20px;
        }
        .modal-box {
          background: linear-gradient(160deg, #1a2a20, #151f18);
          border: 1px solid rgba(200,151,58,0.25); border-radius: 20px;
          padding: 28px; width: 100%; max-width: 420px;
          animation: slideIn 0.2s ease; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .fan-btn {
          padding: 8px 14px; border-radius: 8px;
          border: 1px solid rgba(200,151,58,0.3);
          background: transparent; color: #c8973a;
          cursor: pointer; font-family: inherit; font-size: 13px; transition: all 0.15s;
        }
        .fan-btn.active { background: rgba(200,151,58,0.2); border-color: #c8973a; color: #e8b84b; }
        .fan-btn:hover { background: rgba(200,151,58,0.1); }
        .player-sel-btn {
          flex: 1; padding: 10px 8px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.04); color: #aaa;
          cursor: pointer; font-family: inherit; font-size: 13px;
          text-align: center; transition: all 0.15s;
        }
        .player-sel-btn.selected-winner { background: rgba(200,151,58,0.2); border-color: #c8973a; color: #e8b84b; font-weight: 700; }
        .player-sel-btn.selected-loser { background: rgba(232,120,120,0.15); border-color: #e87878; color: #e87878; font-weight: 700; }
        .player-sel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        input[type="text"] {
          width: 100%; background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
          color: #e8e0d0; font-family: inherit; font-size: 15px;
          padding: 10px 14px; outline: none; transition: border-color 0.2s;
        }
        input[type="text"]:focus { border-color: #c8973a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(200,151,58,0.3); border-radius: 4px; }
      `}</style>

      <TileDecor />

      <div style={{ position:"relative", zIndex:1, maxWidth:480, margin:"0 auto", padding:"24px 16px 80px" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:28, animation:"slideIn 0.4s ease" }}>
          <div style={{ fontSize:36, marginBottom:4 }}>🀄</div>
          <h1 style={{ fontSize:26, fontWeight:700, color:"#e8c97a", letterSpacing:4, textShadow:"0 0 30px rgba(232,201,122,0.3)" }}>
            麻将记分
          </h1>
          <div style={{ fontSize:13, color:"#666", marginTop:4, letterSpacing:2, display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
            <span>第 {round} 局</span>
            <button onClick={() => { setPendingCount(playerCount); setModal("count"); }} style={{
              background:"rgba(200,151,58,0.15)", border:"1px solid rgba(200,151,58,0.3)",
              borderRadius:12, padding:"2px 10px", color:"#c8973a", fontSize:12,
              cursor:"pointer", fontFamily:"inherit", letterSpacing:1,
            }}>
              {playerCount}人
            </button>
          </div>
        </div>

        {/* Scoreboard */}
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
          {sorted.map((p, rank) => {
            const barPct = ((p.score - minScore) / scoreRange) * 100;
            const isLeader = rank === 0;
            return (
              <div key={p.id} className="player-card" style={{
                background: isLeader
                  ? "linear-gradient(120deg, rgba(200,151,58,0.12), rgba(232,201,122,0.06))"
                  : "rgba(255,255,255,0.04)",
                border: isLeader ? "1px solid rgba(200,151,58,0.35)" : "1px solid rgba(255,255,255,0.07)",
                borderRadius:14, padding:"14px 16px",
                animation:`slideIn 0.4s ease ${rank*0.07}s both`,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:20, minWidth:30, textAlign:"center" }}>
                    {rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":"　"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <button onClick={() => openEdit(players.findIndex(pl => pl.id === p.id))} style={{
                        background:"none", border:"none",
                        color: isLeader ? "#e8c97a" : "#c8bfaf",
                        fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit", padding:0, letterSpacing:1,
                      }}>
                        {p.name} ✎
                      </button>
                      <span style={{ fontSize:11, color:"#555", marginLeft:"auto" }}>{p.wins}局胡牌</span>
                    </div>
                    <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:4, overflow:"hidden" }}>
                      <div style={{
                        height:"100%", width:`${Math.max(barPct,4)}%`,
                        background: isLeader
                          ? "linear-gradient(90deg, #c8973a, #e8c97a)"
                          : p.score < 0 ? "linear-gradient(90deg, #7a3a3a, #c87878)" : "linear-gradient(90deg, #3a7a5a, #78c896)",
                        borderRadius:4, transition:"width 0.6s ease",
                      }} />
                    </div>
                  </div>
                  <div style={{
                    fontSize:22, fontWeight:700,
                    color: p.score>0?"#78d4a5":p.score<0?"#e87a7a":"#888",
                    minWidth:56, textAlign:"right",
                    textShadow: p.score>0?"0 0 15px rgba(120,212,165,0.3)":p.score<0?"0 0 15px rgba(232,122,122,0.3)":"none",
                  }}>
                    {p.score>0?"+":""}{p.score}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div style={{ display:"flex", gap:8, marginBottom:28 }}>
          <button className="btn-primary" style={{ flex:2, whiteSpace:"nowrap" }} onClick={() => setModal("win")}>
            🀄 记录胡牌
          </button>
          <button className="btn-secondary" onClick={openShare} style={{ flex:1, whiteSpace:"nowrap", fontSize:13, padding:"10px 6px" }}>
            📤 导出
          </button>
          <button className="btn-secondary" onClick={openImport} style={{ flex:1, whiteSpace:"nowrap", fontSize:13, padding:"10px 6px" }}>
            📥 导入
          </button>
          <button className="btn-secondary" style={{ flex:1, whiteSpace:"nowrap", fontSize:13, padding:"10px 6px" }} onClick={() => { setPendingCount(playerCount); setModal("reset"); }}>
            重置
          </button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10, position:"relative" }}>
              <div style={{ fontSize:12, color:"#555", letterSpacing:2 }}>— 对局记录 —</div>
              <button onClick={() => setModal("undo")} style={{
                position:"absolute", right:0,
                background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)",
                borderRadius:8, padding:"4px 12px", color:"#bbb", fontSize:12,
                cursor:"pointer", fontFamily:"inherit",
              }}>↩ 撤销</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {history.slice(0,10).map(entry => (
                <ScoreHistoryItem key={entry.id} entry={entry} players={players} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Win Modal */}
      {modal === "win" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:18, color:"#e8c97a", marginBottom:20, textAlign:"center", letterSpacing:2 }}>
              🀄 记录胡牌
            </h2>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"#666", marginBottom:8, letterSpacing:1 }}>胡牌玩家</div>
              <div style={{ display:"flex", gap:6 }}>
                {players.map(p => (
                  <button key={p.id}
                    className={`player-sel-btn ${winnerId===p.id?"selected-winner":""}`}
                    onClick={() => { setWinnerId(p.id); setLoserIds(prev => prev.filter(id => id !== p.id)); }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                <div onClick={() => setIsSelfDraw(v => !v)} style={{
                  width:40, height:22, borderRadius:11,
                  background: isSelfDraw ? "linear-gradient(90deg, #c8973a, #e8b84b)" : "rgba(255,255,255,0.1)",
                  transition:"background 0.2s", position:"relative", cursor:"pointer",
                }}>
                  <div style={{
                    position:"absolute", top:2, left: isSelfDraw ? 20 : 2,
                    width:18, height:18, borderRadius:"50%", background:"#fff",
                    transition:"left 0.2s", boxShadow:"0 1px 4px rgba(0,0,0,0.3)",
                  }} />
                </div>
                <span style={{ fontSize:14, color: isSelfDraw?"#e8c97a":"#888" }}>自摸</span>
              </label>
            </div>

            {!isSelfDraw && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, color:"#666", marginBottom:8, letterSpacing:1 }}>
                  放炮玩家
                  <span style={{ marginLeft:6, color:"#444", fontStyle:"italic" }}>（可多选）</span>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  {players.map(p => (
                    <button key={p.id}
                      className={`player-sel-btn ${loserIds.includes(p.id)?"selected-loser":""}`}
                      disabled={winnerId === p.id}
                      onClick={() => toggleLoser(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, color:"#666", marginBottom:8, letterSpacing:1 }}>番数</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {FAN_PRESETS.map(f => (
                  <button key={f.value}
                    className={`fan-btn ${fans===f.value?"active":""}`}
                    onClick={() => setFans(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop:10, fontSize:13, color:"#666" }}>
                每人付：<span style={{ color:"#e8c97a" }}>{totalBase}</span>分
                {isSelfDraw
                  ? <span>　→ 胡牌收 <span style={{ color:"#78d4a5" }}>+{totalBase*(players.length-1)}</span></span>
                  : loserIds.length >= 1
                    ? <span>　→ 胡牌收 <span style={{ color:"#78d4a5" }}>+{totalBase*loserIds.length}</span>（{loserIds.length}人放炮）</span>
                    : null
                }
              </div>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={() => setModal(null)}>取消</button>
              <button className="btn-primary"
                style={{ flex:2, opacity:(winnerId&&(isSelfDraw||loserIds.length>0))?1:0.5 }}
                onClick={applyWin}
                disabled={!winnerId||(!isSelfDraw&&loserIds.length===0)}
              >
                确认记分
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {modal === "share" && (
        <ShareModal code={shareCode} onClose={() => setModal(null)} />
      )}

      {/* Edit Name Modal */}
      {modal === "edit" && editIdx !== null && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:17, color:"#e8c97a", marginBottom:20, textAlign:"center" }}>修改玩家名称</h2>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key==="Enter"&&saveEdit()} maxLength={8} autoFocus style={{ marginBottom:20 }} />
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={() => setModal(null)}>取消</button>
              <button className="btn-primary" style={{ flex:2 }} onClick={saveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {modal === "import" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:18, color:"#e8c97a", marginBottom:8, textAlign:"center", letterSpacing:2 }}>
              📥 导入牌局
            </h2>
            <p style={{ fontSize:13, color:"#666", textAlign:"center", marginBottom:16 }}>
              粘贴对方发来的导出码
            </p>
            <textarea
              value={importCode}
              onChange={e => { setImportCode(e.target.value); setImportError(""); }}
              placeholder="在此粘贴导出码..."
              rows={4}
              style={{
                width:"100%", background:"rgba(255,255,255,0.07)",
                border:`1px solid ${importError ? "#e87a7a" : "rgba(255,255,255,0.15)"}`,
                borderRadius:8, color:"#e8e0d0", fontFamily:"monospace",
                fontSize:12, padding:"10px 14px", outline:"none",
                resize:"none", marginBottom:8,
                transition:"border-color 0.2s",
              }}
            />
            {importError && (
              <div style={{ fontSize:12, color:"#e87a7a", marginBottom:12 }}>{importError}</div>
            )}
            {!importError && <div style={{ marginBottom:12 }} />}
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={() => setModal(null)}>取消</button>
              <button
                className="btn-primary"
                style={{ flex:2, opacity: importCode.trim() ? 1 : 0.5 }}
                onClick={applyImport}
                disabled={!importCode.trim()}
              >
                导入并恢复
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Modal */}
      {modal === "undo" && history.length > 0 && (() => {
        const last = history[0];
        const winnerName = players.find(p => p.id === last.winnerId)?.name || "?";
        const how = last.isSelfDraw ? "自摸" : "点炮";
        return (
          <div className="modal-overlay" onClick={() => setModal(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:18, color:"#e8c97a", marginBottom:16, textAlign:"center", letterSpacing:2 }}>
                ↩ 撤销上一局
              </h2>
              <p style={{ fontSize:14, color:"#777", textAlign:"center", marginBottom:20, lineHeight:1.8 }}>
                <span style={{ color:"#e8c97a" }}>{winnerName}</span>
                {` ${how} ${last.fansLabel}`}<br />
                <span style={{ fontSize:12 }}>第 {last.round} 局</span>
              </p>
              <div style={{ display:"flex", gap:10 }}>
                <button className="btn-secondary" style={{ flex:1 }} onClick={() => setModal(null)}>取消</button>
                <button className="btn-primary" style={{ flex:2 }} onClick={undoLastRound}>确认撤销</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Player Count Modal */}
      {modal === "count" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize:18, color:"#e8c97a", marginBottom:16, textAlign:"center", letterSpacing:2 }}>
              游戏人数
            </h2>
            <div style={{ display:"flex", gap:6, marginBottom:20 }}>
              {[3, 4, 5, 6].map(n => (
                <button key={n}
                  className={`player-sel-btn ${pendingCount === n ? "selected-winner" : ""}`}
                  onClick={() => setPendingCount(n)}
                >
                  {n}人
                </button>
              ))}
            </div>
            {history.length > 0 && pendingCount !== playerCount && (
              <p style={{ fontSize:13, color:"#c87878", textAlign:"center", marginBottom:16 }}>
                更改人数将重置当前牌局
              </p>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn-secondary" style={{ flex:1 }} onClick={() => setModal(null)}>取消</button>
              <button className="btn-primary" style={{ flex:2 }} onClick={() => {
                if (pendingCount !== playerCount) resetGame(true, pendingCount);
                else setModal(null);
              }}>确认</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirm Modal */}
      {modal === "reset" && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
              <h2 style={{ fontSize:17, color:"#e8c97a", marginBottom:8 }}>确认重置？</h2>
              <p style={{ fontSize:14, color:"#777" }}>分数和对局记录将被清零</p>
            </div>
            <p style={{ fontSize:12, color:"#666", textAlign:"center", marginBottom:8, letterSpacing:1 }}>人数</p>
            <div style={{ display:"flex", gap:6, marginBottom:16 }}>
              {[3, 4, 5, 6].map(n => (
                <button key={n}
                  className={`player-sel-btn ${pendingCount === n ? "selected-winner" : ""}`}
                  onClick={() => setPendingCount(n)}
                >
                  {n}人
                </button>
              ))}
            </div>
            <p style={{ fontSize:13, color:"#666", textAlign:"center", marginBottom:20 }}>是否同时重置玩家名字？</p>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button className="btn-primary"
                style={{ background:"linear-gradient(135deg, #7a3a3a, #c85a5a)", color:"#fff" }}
                onClick={() => resetGame(true, pendingCount)}
              >
                重置分数，保留名字
              </button>
              <button className="btn-primary"
                style={{ background:"linear-gradient(135deg, #4a3a2a, #8a6a3a)", color:"#fff" }}
                onClick={() => resetGame(false, pendingCount)}
              >
                全部重置（含名字）
              </button>
              <button className="btn-secondary" onClick={() => setModal(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
