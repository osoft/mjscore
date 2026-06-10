import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Modal,
  StyleSheet, Share, Alert, SafeAreaView, StatusBar, Dimensions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ALL_DEFAULT_PLAYERS = [
  { id: 1, name: '东家', score: 0, wins: 0 },
  { id: 2, name: '南家', score: 0, wins: 0 },
  { id: 3, name: '西家', score: 0, wins: 0 },
  { id: 4, name: '北家', score: 0, wins: 0 },
  { id: 5, name: '五家', score: 0, wins: 0 },
  { id: 6, name: '六家', score: 0, wins: 0 },
];

const FAN_PRESETS = [
  { label: '基础', value: 0 },
  { label: '1番', value: 1 },
  { label: '2番', value: 2 },
  { label: '3番', value: 3 },
  { label: '4番', value: 4 },
  { label: '满贯', value: 5 },
  { label: '大满贯', value: 6 },
];

const NAMES_KEY = 'mahjong_player_names';
const PLAYER_COUNT_KEY = 'mahjong_player_count';

function getBaseScore(fans) {
  return Math.pow(2, fans);
}

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

// ── History item ──────────────────────────────────────────────────────────────

function ScoreHistoryItem({ entry, players }) {
  const loserNames = (entry.loserIds || []).map(
    id => players.find(p => p.id === id)?.name || '?'
  );
  const winnerName = players.find(p => p.id === entry.winnerId)?.name || '?';
  const scoreDisplay =
    entry.winnerScore != null
      ? entry.winnerScore > 0
        ? `+${entry.winnerScore}`
        : `${entry.winnerScore}`
      : '';
  const howStr = entry.isSelfDraw
    ? '自摸'
    : loserNames.length > 0
    ? `被 ${loserNames.join('、')} 点炮`
    : '';

  return (
    <View style={styles.historyItem}>
      <Text style={{ fontSize: 18 }}>🀄</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyText}>
          <Text style={styles.historyWinner}>{winnerName}</Text>
          <Text style={{ color: '#bbb' }}>{' 得分：'}</Text>
          <Text style={styles.historyScore}>{scoreDisplay}</Text>
          <Text style={{ color: '#aaa' }}>{'　' + howStr + '　'}</Text>
          <Text style={{ color: '#c8973a' }}>{entry.fansLabel}</Text>
        </Text>
      </View>
      <Text style={styles.historyTime}>{entry.time}</Text>
    </View>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [playerCount, setPlayerCount] = useState(4);
  const [pendingCount, setPendingCount] = useState(4);
  const [players, setPlayers] = useState(() => ALL_DEFAULT_PLAYERS.slice(0, 4));
  const [round, setRound] = useState(1);
  const [history, setHistory] = useState([]);
  const [namesLoaded, setNamesLoaded] = useState(false);

  const [modal, setModal] = useState(null); // 'win' | 'share' | 'edit' | 'import' | 'reset'
  const [editIdx, setEditIdx] = useState(null);
  const [editName, setEditName] = useState('');
  const [shareCode, setShareCode] = useState(null);
  const [importCode, setImportCode] = useState('');
  const [importError, setImportError] = useState('');

  // Win form
  const [winnerId, setWinnerId] = useState(null);
  const [loserIds, setLoserIds] = useState([]);
  const [isSelfDraw, setIsSelfDraw] = useState(false);
  const [fans, setFans] = useState(0);

  const totalBase = getBaseScore(fans);
  const fansLabel =
    fans === 0 ? '基础分' : FAN_PRESETS.find(f => f.value === fans)?.label || `${fans}番`;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PLAYER_COUNT_KEY),
      AsyncStorage.getItem(NAMES_KEY),
    ]).then(([savedCount, savedNames]) => {
      let count = 4;
      if (savedCount) {
        const n = parseInt(savedCount, 10);
        if (n >= 3 && n <= 6) count = n;
      }
      let names = null;
      if (savedNames) {
        try {
          const parsed = JSON.parse(savedNames);
          if (Array.isArray(parsed)) names = parsed;
        } catch {}
      }
      const initial = ALL_DEFAULT_PLAYERS.slice(0, count).map((p, i) => ({
        ...p,
        name: names && names[i] ? names[i] : p.name,
      }));
      setPlayerCount(count);
      setPendingCount(count);
      setPlayers(initial);
      setNamesLoaded(true);
    });
  }, []);

  function saveNames(updatedPlayers) {
    AsyncStorage.setItem(NAMES_KEY, JSON.stringify(updatedPlayers.map(p => p.name)));
  }

  const sorted = [...players].sort((a, b) => b.score - a.score);
  const maxScore = Math.max(...players.map(p => p.score), 1);
  const minScore = Math.min(...players.map(p => p.score), -1);
  const scoreRange = maxScore - minScore || 1;

  function toggleLoser(id) {
    setLoserIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
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
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newHistory = [
      {
        id: Date.now(),
        winnerId,
        winnerScore: winner.score,
        loserIds: isSelfDraw ? [] : loserIds,
        isSelfDraw,
        fans,
        fansLabel,
        time,
        round,
      },
      ...history,
    ].slice(0, 50);

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
    AsyncStorage.setItem(PLAYER_COUNT_KEY, String(newCount));
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
    setModal('share');
  }

  function shareViaSheet() {
    if (!shareCode) return;
    Share.share({ message: shareCode });
  }

  function openImport() {
    setImportCode('');
    setImportError('');
    setModal('import');
  }

  function applyImport() {
    const state = decodeState(importCode);
    if (!state) {
      setImportError('无效的导入码，请检查后重试');
      return;
    }
    setPlayers(state.p);
    setPlayerCount(state.p.length);
    AsyncStorage.setItem(PLAYER_COUNT_KEY, String(state.p.length));
    saveNames(state.p);
    setRound(state.r || 1);
    setHistory(state.h || []);
    setModal(null);
    setImportCode('');
    setImportError('');
  }

  function openEdit(idx) {
    setEditIdx(idx);
    setEditName(players[idx].name);
    setModal('edit');
  }

  function saveEdit() {
    if (!editName.trim()) return;
    const updated = players.map((p, i) =>
      i === editIdx ? { ...p, name: editName.trim() } : p
    );
    setPlayers(updated);
    saveNames(updated);
    setModal(null);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0f1a14" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={{ fontSize: 36 }}>🀄</Text>
          <Text style={styles.title}>麻将记分</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.roundLabel}>第 {round} 局</Text>
            <TouchableOpacity
              onPress={() => { setPendingCount(playerCount); setModal('count'); }}
              style={styles.countChip}
            >
              <Text style={styles.countChipText}>{playerCount}人</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Scoreboard */}
        <View style={styles.section}>
          {sorted.map((p, rank) => {
            const barPct = ((p.score - minScore) / scoreRange) * 100;
            const isLeader = rank === 0;
            return (
              <View
                key={p.id}
                style={[styles.playerCard, isLeader && styles.playerCardLeader]}
              >
                <Text style={styles.rankEmoji}>
                  {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '  '}
                </Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.playerRow}>
                    <TouchableOpacity
                      onPress={() =>
                        openEdit(players.findIndex(pl => pl.id === p.id))
                      }
                    >
                      <Text
                        style={[
                          styles.playerName,
                          isLeader && { color: '#e8c97a' },
                        ]}
                      >
                        {p.name} ✎
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.winsLabel}>{p.wins}局胡牌</Text>
                  </View>
                  <View style={styles.barBg}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.max(barPct, 4)}%`,
                          backgroundColor: isLeader
                            ? '#c8973a'
                            : p.score < 0
                            ? '#c87878'
                            : '#78c896',
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text
                  style={[
                    styles.scoreText,
                    p.score > 0
                      ? { color: '#78d4a5' }
                      : p.score < 0
                      ? { color: '#e87a7a' }
                      : { color: '#888' },
                  ]}
                >
                  {p.score > 0 ? '+' : ''}{p.score}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btnPrimary, { flex: 2 }]}
            onPress={() => setModal('win')}
          >
            <Text style={styles.btnPrimaryText}>🀄 记录胡牌</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSecondary, { flex: 1 }]}
            onPress={openShare}
          >
            <Text style={styles.btnSecondaryText}>📤 导出</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSecondary, { flex: 1 }]}
            onPress={openImport}
          >
            <Text style={styles.btnSecondaryText}>📥 导入</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSecondary, { flex: 1 }]}
            onPress={() => { setPendingCount(playerCount); setModal('reset'); }}
          >
            <Text style={styles.btnSecondaryText}>重置</Text>
          </TouchableOpacity>
        </View>

        {/* History */}
        {history.length > 0 && (
          <View>
            <View style={styles.historyHeaderRow}>
              <Text style={styles.historySectionLabel}>— 对局记录 —</Text>
              <TouchableOpacity
                style={styles.undoBtn}
                onPress={() => setModal('undo')}
              >
                <Text style={styles.undoBtnText}>↩ 撤销</Text>
              </TouchableOpacity>
            </View>
            {history.slice(0, 10).map(entry => (
              <ScoreHistoryItem key={entry.id} entry={entry} players={players} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Win Modal ── */}
      <Modal visible={modal === 'win'} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModal(null)}
          />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🀄 记录胡牌</Text>

            <Text style={styles.modalLabel}>胡牌玩家</Text>
            <View style={styles.playerSelRow}>
              {players.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.playerSelBtn,
                    winnerId === p.id && styles.playerSelWinner,
                  ]}
                  onPress={() => {
                    setWinnerId(p.id);
                    setLoserIds(prev => prev.filter(id => id !== p.id));
                  }}
                >
                  <Text
                    style={[
                      styles.playerSelText,
                      winnerId === p.id && { color: '#e8b84b', fontWeight: '700' },
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Self-draw toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsSelfDraw(v => !v)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.toggleTrack,
                  isSelfDraw && { backgroundColor: '#c8973a' },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    isSelfDraw && { left: 20 },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.toggleLabel,
                  isSelfDraw && { color: '#e8c97a' },
                ]}
              >
                自摸
              </Text>
            </TouchableOpacity>

            {!isSelfDraw && (
              <>
                <Text style={styles.modalLabel}>
                  放炮玩家
                  <Text style={{ color: '#444', fontStyle: 'italic' }}>
                    {' '}（可多选）
                  </Text>
                </Text>
                <View style={styles.playerSelRow}>
                  {players.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.playerSelBtn,
                        loserIds.includes(p.id) && styles.playerSelLoser,
                        winnerId === p.id && { opacity: 0.3 },
                      ]}
                      onPress={() => winnerId !== p.id && toggleLoser(p.id)}
                      disabled={winnerId === p.id}
                    >
                      <Text
                        style={[
                          styles.playerSelText,
                          loserIds.includes(p.id) && {
                            color: '#e87878',
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Fan presets */}
            <Text style={[styles.modalLabel, { marginTop: 4 }]}>番数</Text>
            <View style={styles.fanRow}>
              {FAN_PRESETS.map(f => (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.fanBtn, fans === f.value && styles.fanBtnActive]}
                  onPress={() => setFans(f.value)}
                >
                  <Text
                    style={[
                      styles.fanBtnText,
                      fans === f.value && { color: '#e8b84b' },
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.scorePreview}>
              {'每人付：'}
              <Text style={{ color: '#e8c97a' }}>{totalBase}</Text>
              {'分'}
              {isSelfDraw ? (
                <Text>
                  {'　→ 胡牌收 '}
                  <Text style={{ color: '#78d4a5' }}>+{totalBase * (players.length - 1)}</Text>
                </Text>
              ) : loserIds.length >= 1 ? (
                <Text>
                  {'　→ 胡牌收 '}
                  <Text style={{ color: '#78d4a5' }}>
                    +{totalBase * loserIds.length}
                  </Text>
                  {`（${loserIds.length}人放炮）`}
                </Text>
              ) : null}
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 1 }]}
                onPress={() => setModal(null)}
              >
                <Text style={styles.btnSecondaryText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { flex: 2 },
                  (!winnerId || (!isSelfDraw && loserIds.length === 0)) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={applyWin}
                disabled={!winnerId || (!isSelfDraw && loserIds.length === 0)}
              >
                <Text style={styles.btnPrimaryText}>确认记分</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Share Modal ── */}
      <Modal visible={modal === 'share'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModal(null)}
          />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📤 导出牌局</Text>
            <Text style={styles.modalSubtitle}>
              {'点下方「分享」发给其他玩家\n对方点「导入」粘贴即可继续记分'}
            </Text>
            <ScrollView
              style={styles.codeBox}
              nestedScrollEnabled
            >
              <Text style={styles.codeText} selectable>
                {shareCode || '生成失败'}
              </Text>
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 1 }]}
                onPress={() => setModal(null)}
              >
                <Text style={styles.btnSecondaryText}>关闭</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 2 }]}
                onPress={shareViaSheet}
              >
                <Text style={styles.btnPrimaryText}>分享导出码</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit Name Modal ── */}
      <Modal visible={modal === 'edit'} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModal(null)}
          />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>修改玩家名称</Text>
            <TextInput
              style={styles.textInput}
              value={editName}
              onChangeText={setEditName}
              onSubmitEditing={saveEdit}
              maxLength={8}
              autoFocus
              returnKeyType="done"
            />
            <View style={[styles.modalBtnRow, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 1 }]}
                onPress={() => setModal(null)}
              >
                <Text style={styles.btnSecondaryText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 2 }]}
                onPress={saveEdit}
              >
                <Text style={styles.btnPrimaryText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Import Modal ── */}
      <Modal visible={modal === 'import'} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModal(null)}
          />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📥 导入牌局</Text>
            <Text style={styles.modalSubtitle}>粘贴对方发来的导出码</Text>
            <TextInput
              style={[
                styles.textInput,
                styles.textArea,
                importError ? { borderColor: '#e87a7a' } : {},
              ]}
              value={importCode}
              onChangeText={t => {
                setImportCode(t);
                setImportError('');
              }}
              placeholder="在此粘贴导出码..."
              placeholderTextColor="#444"
              multiline
              numberOfLines={4}
              autoFocus
            />
            {importError ? (
              <Text style={styles.errorText}>{importError}</Text>
            ) : null}
            <View style={[styles.modalBtnRow, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.btnSecondary, { flex: 1 }]}
                onPress={() => setModal(null)}
              >
                <Text style={styles.btnSecondaryText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnPrimary,
                  { flex: 2 },
                  !importCode.trim() && { opacity: 0.5 },
                ]}
                onPress={applyImport}
                disabled={!importCode.trim()}
              >
                <Text style={styles.btnPrimaryText}>导入并恢复</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Undo Modal ── */}
      {modal === 'undo' && history.length > 0 && (() => {
        const last = history[0];
        const winnerName = players.find(p => p.id === last.winnerId)?.name || '?';
        const how = last.isSelfDraw ? '自摸' : '点炮';
        return (
          <Modal visible transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setModal(null)}
              />
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>↩ 撤销上一局</Text>
                <Text style={[styles.modalSubtitle, { marginBottom: 20 }]}>
                  <Text style={{ color: '#e8c97a' }}>{winnerName}</Text>
                  {` ${how} ${last.fansLabel}\n`}
                  <Text style={{ fontSize: 12 }}>第 {last.round} 局</Text>
                </Text>
                <View style={styles.modalBtnRow}>
                  <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setModal(null)}>
                    <Text style={styles.btnSecondaryText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPrimary, { flex: 2 }]} onPress={undoLastRound}>
                    <Text style={styles.btnPrimaryText}>确认撤销</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* ── Player Count Modal ── */}
      <Modal visible={modal === 'count'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModal(null)}
          />
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>游戏人数</Text>
            <View style={[styles.playerSelRow, { marginBottom: 20 }]}>
              {[3, 4, 5, 6].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.playerSelBtn, pendingCount === n && styles.playerSelWinner]}
                  onPress={() => setPendingCount(n)}
                >
                  <Text style={[styles.playerSelText, pendingCount === n && { color: '#e8b84b', fontWeight: '700' }]}>
                    {n}人
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {history.length > 0 && pendingCount !== playerCount && (
              <Text style={{ fontSize: 13, color: '#c87878', textAlign: 'center', marginBottom: 16 }}>
                更改人数将重置当前牌局
              </Text>
            )}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => setModal(null)}>
                <Text style={styles.btnSecondaryText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 2 }]}
                onPress={() => {
                  if (pendingCount !== playerCount) resetGame(true, pendingCount);
                  else setModal(null);
                }}
              >
                <Text style={styles.btnPrimaryText}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Reset Modal ── */}
      <Modal visible={modal === 'reset'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setModal(null)}
          />
          <View style={styles.modalBox}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
              <Text style={[styles.modalTitle, { marginBottom: 8 }]}>确认重置？</Text>
              <Text style={{ fontSize: 14, color: '#777' }}>
                分数和对局记录将被清零
              </Text>
            </View>
            <Text style={styles.modalSubtitle}>人数</Text>
            <View style={[styles.playerSelRow, { marginBottom: 16 }]}>
              {[3, 4, 5, 6].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.playerSelBtn, pendingCount === n && styles.playerSelWinner]}
                  onPress={() => setPendingCount(n)}
                >
                  <Text style={[styles.playerSelText, pendingCount === n && { color: '#e8b84b', fontWeight: '700' }]}>
                    {n}人
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalSubtitle}>是否同时重置玩家名字？</Text>
            <View style={{ gap: 8 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: undefined }]}
                onPress={() => resetGame(true, pendingCount)}
              >
                <Text style={[styles.btnPrimaryText, { color: '#fff' }]}>
                  重置分数，保留名字
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: undefined, marginTop: 8 }]}
                onPress={() => resetGame(false, pendingCount)}
              >
                <Text style={[styles.btnPrimaryText, { color: '#fff' }]}>
                  全部重置（含名字）
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSecondary, { marginTop: 4 }]}
                onPress={() => setModal(null)}
              >
                <Text style={styles.btnSecondaryText}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f1a14',
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 60,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#e8c97a',
    letterSpacing: 4,
    marginTop: 4,
  },
  roundLabel: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
    letterSpacing: 2,
  },
  countChip: {
    backgroundColor: 'rgba(200,151,58,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(200,151,58,0.3)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  countChipText: {
    color: '#c8973a',
    fontSize: 12,
    letterSpacing: 1,
  },

  // Player cards
  section: {
    gap: 10,
    marginBottom: 20,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 14,
  },
  playerCardLeader: {
    backgroundColor: 'rgba(200,151,58,0.1)',
    borderColor: 'rgba(200,151,58,0.35)',
  },
  rankEmoji: {
    fontSize: 20,
    minWidth: 30,
    textAlign: 'center',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#c8bfaf',
    letterSpacing: 1,
  },
  winsLabel: {
    fontSize: 11,
    color: '#555',
    marginLeft: 'auto',
  },
  barBg: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  scoreText: {
    fontSize: 22,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  btnPrimary: {
    backgroundColor: '#c8973a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: '#1a1200',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: '#bbb',
    fontSize: 13,
  },

  // History
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  undoBtn: {
    position: 'absolute',
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  undoBtnText: {
    color: '#bbb',
    fontSize: 12,
  },
  historySectionLabel: {
    fontSize: 12,
    color: '#555',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 10,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  historyText: {
    fontSize: 13,
    color: '#bbb',
    flexWrap: 'wrap',
  },
  historyWinner: {
    color: '#e8c97a',
    fontWeight: '700',
  },
  historyScore: {
    color: '#78d4a5',
    fontWeight: '700',
  },
  historyTime: {
    fontSize: 12,
    color: '#555',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#1a2a20',
    borderWidth: 1,
    borderColor: 'rgba(200,151,58,0.25)',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    zIndex: 1,
  },
  modalTitle: {
    fontSize: 18,
    color: '#e8c97a',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalLabel: {
    fontSize: 12,
    color: '#666',
    letterSpacing: 1,
    marginBottom: 8,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },

  // Player selector
  playerSelRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  playerSelBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
  },
  playerSelWinner: {
    backgroundColor: 'rgba(200,151,58,0.2)',
    borderColor: '#c8973a',
  },
  playerSelLoser: {
    backgroundColor: 'rgba(232,120,120,0.15)',
    borderColor: '#e87878',
  },
  playerSelText: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
  },

  // Self-draw toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    position: 'relative',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#888',
  },

  // Fan buttons
  fanRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  fanBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(200,151,58,0.3)',
  },
  fanBtnActive: {
    backgroundColor: 'rgba(200,151,58,0.2)',
    borderColor: '#c8973a',
  },
  fanBtnText: {
    color: '#c8973a',
    fontSize: 13,
  },
  scorePreview: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },

  // Inputs
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    color: '#e8e0d0',
    fontSize: 15,
    padding: 10,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#e87a7a',
    marginTop: 6,
  },

  // Share code box
  codeBox: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 12,
    maxHeight: 100,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 11,
    color: '#7a9',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 18,
  },
});
