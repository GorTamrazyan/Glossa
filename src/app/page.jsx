"use client";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { LIBRARY, LEVELS } from "./library.js";

async function googleTranslate(text) {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=` +
    encodeURIComponent(text);
  const res = await fetch(url);
  const data = await res.json();
  const parts = data?.[0];
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => p?.[0] ?? "").join("").trim();
}

async function myMemoryTranslate(text) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`;
  const res = await fetch(url);
  const data = await res.json();
  let t = data?.responseData?.translatedText || "";
  if (/PLEASE|INVALID|MYMEMORY|QUERY LENGTH/i.test(t)) t = "";
  return t.trim();
}

async function translateWord(word) {
  try {
    const t = await googleTranslate(word);
    if (t) return t;
  } catch (e) {}
  return myMemoryTranslate(word);
}

const INK = "#2b2420";
const PAPER = "#f5efe2";

const cleanWord = (w) => w.replace(/[^A-Za-z'-]/g, "");
const preview = (s) => s.slice(0, 64) + (s.length > 64 ? "…" : "");

export default function WordReader() {
  const [level, setLevel] = useState("A1");
  const [activeId, setActiveId] = useState(LIBRARY.A1[0].id);
  const [customText, setCustomText] = useState("");
  const [usingCustom, setUsingCustom] = useState(false);

  const [selectedWord, setSelectedWord] = useState(null);
  const [translation, setTranslation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [dict, setDict] = useState({});
  const [dictLoading, setDictLoading] = useState(false);
  const cache = useRef({});
  const runId = useRef(0);

  const lastRequestedText = useRef("");
  const selectionTimeout = useRef(null);

  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("glossa_saved") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("glossa_saved", JSON.stringify(saved));
  }, [saved]);
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!showSaved) return;
    const onKey = (e) => { if (e.key === "Escape") setShowSaved(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSaved]);

  const findText = (id) => {
    for (const lvl of Object.keys(LIBRARY)) {
      const t = LIBRARY[lvl].find((x) => x.id === id);
      if (t) return t;
    }
    return null;
  };
  const current = findText(activeId);
  const text = usingCustom ? customText : current?.body || "";

  const buildDictionary = useCallback(async (fullText) => {
    const myRun = ++runId.current;
    const unique = [...new Set(fullText.split(/\s+/).map(cleanWord).map((w) => w.toLowerCase()).filter(Boolean))];
    if (unique.length === 0) return;

    const need = unique.filter((w) => !cache.current[w]);
    setDict((d) => {
      const merged = { ...d };
      unique.forEach((w) => { if (cache.current[w]) merged[w] = cache.current[w]; });
      return merged;
    });
    if (need.length === 0) return;

    setDictLoading(true);
    const queue = [...need];
    const CONCURRENCY = 5;

    const worker = async () => {
      while (queue.length && runId.current === myRun) {
        const w = queue.shift();
        try {
          const t = await translateWord(w);
          if (t) {
            cache.current[w] = t;
            if (runId.current === myRun) setDict((d) => ({ ...d, [w]: t }));
          }
        } catch (e) {}
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (runId.current === myRun) setDictLoading(false);
  }, []);

  useEffect(() => {
    if (!usingCustom && current) buildDictionary(current.body);
  }, [activeId, usingCustom, current, buildDictionary]);

  const executeTranslation = useCallback(async (textToTranslate, cacheKey, fallbackDict = {}) => {
    setSelectedWord(textToTranslate);
    setError(null);

    const cached = cache.current[cacheKey] || fallbackDict[cacheKey];
    if (cached) {
      setTranslation(cached);
      setLoading(false);
      return;
    }

    lastRequestedText.current = cacheKey;
    setLoading(true);
    setTranslation(null);

    try {
      const t = await translateWord(textToTranslate);
      
      if (lastRequestedText.current !== cacheKey) return;

      if (t) {
        cache.current[cacheKey] = t;
        setTranslation(t);
      } else {
        setError("Перевод не найден.");
      }
    } catch (e) {
      if (lastRequestedText.current === cacheKey) {
        setError("Нет связи с переводчиком. Проверь интернет.");
      }
    } finally {
      if (lastRequestedText.current === cacheKey) {
        setLoading(false);
      }
    }
  }, []);

  const handleWordClick = useCallback(
    async (rawWord) => {
      const sel = window.getSelection()?.toString().trim() ?? "";
      if (sel && /\s/.test(sel)) return;

      const cleaned = cleanWord(rawWord);
      const wordKey = cleaned.toLowerCase();
      if (!wordKey) return;

      await executeTranslation(cleaned, wordKey, dict);
    },
    [dict, executeTranslation]
  );

  useEffect(() => {
    const handleSelectionChange = () => {
      if (selectionTimeout.current) {
        clearTimeout(selectionTimeout.current);
      }

      selectionTimeout.current = setTimeout(async () => {
        const raw = window.getSelection()?.toString() ?? "";
        const phrase = raw.replace(/\s+/g, " ").trim();

        if (phrase && /\s/.test(phrase)) {
          const phraseKey = phrase.toLowerCase();
          await executeTranslation(phrase, phraseKey);
        }
      }, 700);
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (selectionTimeout.current) clearTimeout(selectionTimeout.current);
    };
  }, [executeTranslation]);

  const isSaved =
    !!selectedWord && !!translation &&
    saved.some((s) => s.word.toLowerCase() === selectedWord.toLowerCase());

  const toggleSave = () => {
    if (!selectedWord || !translation) return;
    const key = selectedWord.toLowerCase();
    setSaved((list) =>
      list.some((s) => s.word.toLowerCase() === key)
        ? list.filter((s) => s.word.toLowerCase() !== key)
        : [{ word: selectedWord, translation }, ...list]
    );
  };

  const removeSaved = (word) =>
    setSaved((list) => list.filter((s) => s.word !== word));

  const renderText = (str) => {
    const tokens = str.split(/(\s+)/);
    return tokens.map((tok, i) => {
      if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
      const clean = cleanWord(tok);
      if (!clean) return <span key={i}>{tok}</span>;
      const lc = clean.toLowerCase();
      const known = !!(cache.current[lc] || dict[lc]);
      const isActive = selectedWord && lc === selectedWord.toLowerCase();
      return (
        <span
          key={i}
          onClick={() => handleWordClick(tok)}
          style={{
            cursor: "pointer", 
            borderRadius: "4px", 
            padding: "0 2px",
            transition: "background 0.15s, color 0.15s",
            background: isActive ? INK : "transparent",
            color: isActive ? PAPER : "inherit",
            borderBottom: known && !isActive ? "2px solid #d8c89a" : "2px solid transparent",
            WebkitTouchCallout: "none",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation", // Улучшает тач-отклик
          }}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#e6dcc4"; }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
        >
          {tok}
        </span>
      );
    });
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: PAPER, 
      color: INK, 
      fontFamily: "Georgia, 'Times New Roman', serif",
      WebkitTextSizeAdjust: "100%", // Предотвращает автоматическое изменение размера текста на iOS
    }}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Spectral:wght@400;500&display=swap');
        @keyframes pop { from { transform: translateY(-6px); opacity:0 } to { transform: translateY(0); opacity:1 } }
        @keyframes spin { to { transform: rotate(360deg) } }
        .lib::-webkit-scrollbar { width: 8px; }
        .lib::-webkit-scrollbar-thumb { background: #cdbc99; border-radius: 8px; }
        
        /* Адаптив для мобильных */
        @media (max-width: 640px) {
          .header-panel {
            padding: 12px 16px !important;
            min-height: 64px !important;
          }
          .word-display {
            font-size: 20px !important;
          }
          .translation-display {
            font-size: 20px !important;
          }
          .save-button {
            padding: 6px 12px !important;
            font-size: 12px !important;
          }
          .content-wrapper {
            padding: 20px 16px 60px !important;
          }
          .text-body {
            font-size: 18px !important;
            line-height: 1.85 !important;
          }
          .level-buttons {
            gap: 6px !important;
          }
          .level-button {
            padding: 6px 12px !important;
            font-size: 12px !important;
          }
          .title-display {
            font-size: 32px !important;
          }
          .library-grid {
            grid-template-columns: 1fr !important;
            max-height: 180px !important;
            gap: 8px !important;
          }
          .saved-modal {
            padding: 32px 12px !important;
          }
          .saved-modal-content {
            padding: 16px !important;
          }
        }

        @media (max-width: 480px) {
          .text-body {
            font-size: 16px !important;
            line-height: 1.8 !important;
          }
          .word-display {
            font-size: 18px !important;
          }
          .translation-display {
            font-size: 18px !important;
          }
          .title-display {
            font-size: 28px !important;
          }
          .header-panel {
            padding: 10px 12px !important;
            min-height: 56px !important;
          }
          .saved-table {
            font-size: 14px !important;
          }
        }
      `}</style>

      {/* Верхняя панель перевода */}
      <div className="header-panel" style={{ 
        position: "sticky", 
        top: 0, 
        zIndex: 10, 
        background: INK, 
        color: PAPER, 
        padding: "16px 24px", 
        minHeight: "78px", 
        display: "flex", 
        alignItems: "center", 
        boxShadow: "0 4px 18px rgba(0,0,0,0.18)" 
      }}>
        {!selectedWord && !loading && (
          <span style={{ 
            opacity: 0.55, 
            fontFamily: "Spectral, serif", 
            fontSize: "clamp(13px, 2.5vw, 15px)" 
          }}>
            {dictLoading ? "Готовлю словарь… клики уже работают" : "Нажми на слово или выдели фразу"}
          </span>
        )}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "18px", height: "18px", border: `2px solid ${PAPER}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <span style={{ opacity: 0.7, fontFamily: "Spectral, serif", fontSize: "clamp(14px, 2.5vw, 16px)" }}>
              перевожу «{selectedWord}»…
            </span>
          </div>
        )}
        {!loading && translation && (
          <div key={selectedWord} style={{ 
            animation: "pop 0.22s ease", 
            width: "100%", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "space-between", 
            gap: "12px",
            flexWrap: "wrap"
          }}>
            <div style={{ 
              display: "flex", 
              alignItems: "baseline", 
              gap: "10px", 
              flexWrap: "wrap",
              flex: "1 1 auto"
            }}>
              <span className="word-display" style={{ 
                fontFamily: "'Fraunces', Georgia, serif", 
                fontSize: "clamp(20px, 4vw, 26px)", 
                fontWeight: 600 
              }}>{selectedWord}</span>
              <span style={{ opacity: 0.45 }}>→</span>
              <span className="translation-display" style={{ 
                fontFamily: "'Fraunces', Georgia, serif", 
                fontSize: "clamp(20px, 4vw, 26px)", 
                fontWeight: 900, 
                color: "#e9c46a",
                wordBreak: "break-word"
              }}>{translation}</span>
            </div>
            <button
              className="save-button"
              onClick={toggleSave}
              style={{
                flexShrink: 0, 
                border: `1px solid ${PAPER}`,
                background: isSaved ? PAPER : "transparent",
                color: isSaved ? INK : PAPER,
                padding: "clamp(6px, 1.5vw, 8px) clamp(12px, 2.5vw, 14px)", 
                borderRadius: "999px", 
                cursor: "pointer",
                fontFamily: "Spectral, serif", 
                fontSize: "clamp(12px, 2vw, 14px)", 
                whiteSpace: "nowrap",
                transition: "all 0.15s",
                touchAction: "manipulation",
              }}
            >
              {isSaved ? "✓ Сохранено" : "★ Сохранить"}
            </button>
          </div>
        )}
        {!loading && error && <span style={{ color: "#e76f51", fontFamily: "Spectral, serif", fontSize: "clamp(14px, 2.5vw, 16px)" }}>{error}</span>}
      </div>

      {/* Контент */}
      <div className="content-wrapper" style={{ 
        maxWidth: "720px", 
        margin: "0 auto", 
        padding: "clamp(20px, 4vw, 32px) clamp(16px, 3vw, 24px) 60px" 
      }}>
        <div className="level-buttons" style={{ 
          display: "flex", 
          gap: "clamp(6px, 1.5vw, 8px)", 
          flexWrap: "wrap", 
          marginBottom: "16px", 
          alignItems: "center" 
        }}>
          {Object.keys(LIBRARY).map((lvl) => (
            <button
              className="level-button"
              key={lvl}
              onClick={() => { setLevel(lvl); setUsingCustom(false); setActiveId(LIBRARY[lvl][0].id); }}
              style={{
                border: `1px solid ${INK}`,
                background: !usingCustom && level === lvl ? INK : "transparent",
                color: !usingCustom && level === lvl ? PAPER : INK,
                padding: "clamp(6px, 1.5vw, 7px) clamp(12px, 2.5vw, 16px)", 
                borderRadius: "999px", 
                cursor: "pointer",
                fontFamily: "Spectral, serif", 
                fontSize: "clamp(12px, 2vw, 14px)", 
                transition: "all 0.15s",
                touchAction: "manipulation",
                whiteSpace: "nowrap",
              }}
            >
              {LEVELS[lvl]}
            </button>
          ))}
          <button
            onClick={() => setUsingCustom(true)}
            style={{
              border: `1px dashed ${INK}`, 
              background: usingCustom ? INK : "transparent",
              color: usingCustom ? PAPER : INK, 
              padding: "clamp(6px, 1.5vw, 7px) clamp(12px, 2.5vw, 16px)", 
              borderRadius: "999px",
              cursor: "pointer", 
              fontFamily: "Spectral, serif", 
              fontSize: "clamp(12px, 2vw, 14px)",
              touchAction: "manipulation",
              whiteSpace: "nowrap",
            }}
          >
            ✎ Свой текст
          </button>
          <button
            onClick={() => setShowSaved(true)}
            style={{
              border: `1px solid ${INK}`, 
              background: "transparent", 
              color: INK,
              padding: "clamp(6px, 1.5vw, 7px) clamp(12px, 2.5vw, 16px)", 
              borderRadius: "999px", 
              cursor: "pointer",
              fontFamily: "Spectral, serif", 
              fontSize: "clamp(12px, 2vw, 14px)", 
              marginLeft: "auto",
              touchAction: "manipulation",
              whiteSpace: "nowrap",
            }}
          >
            ★ Мои слова{saved.length ? ` (${saved.length})` : ""}
          </button>
          {dictLoading && (
            <span style={{ 
              fontFamily: "Spectral, serif", 
              fontSize: "clamp(11px, 2vw, 13px)", 
              opacity: 0.5, 
              display: "flex", 
              alignItems: "center", 
              gap: "6px" 
            }}>
              <span style={{ width: "12px", height: "12px", border: `2px solid ${INK}`, borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
            </span>
          )}
        </div>

        {!usingCustom && (
          <div className="lib library-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fill, minmax(clamp(180px, 25vw, 210px), 1fr))", 
            gap: "clamp(8px, 1.5vw, 10px)", 
            maxHeight: "clamp(160px, 25vh, 210px)", 
            overflowY: "auto", 
            padding: "2px", 
            marginBottom: "clamp(20px, 4vw, 28px)" 
          }}>
            {LIBRARY[level].map((t) => {
              const sel = t.id === activeId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  style={{
                    textAlign: "left", 
                    border: `1px solid ${sel ? INK : "#d8cbb0"}`,
                    background: sel ? INK : "#faf6ec", 
                    color: sel ? PAPER : INK,
                    borderRadius: "10px", 
                    padding: "clamp(8px, 1.5vw, 10px) clamp(10px, 2vw, 12px)", 
                    cursor: "pointer", 
                    transition: "all 0.15s",
                    touchAction: "manipulation",
                  }}
                >
                  <div style={{ 
                    fontFamily: "'Fraunces', Georgia, serif", 
                    fontWeight: 600, 
                    fontSize: "clamp(14px, 2.5vw, 16px)", 
                    marginBottom: "3px" 
                  }}>{t.title}</div>
                  <div style={{ 
                    fontFamily: "Spectral, serif", 
                    fontSize: "clamp(11px, 2vw, 12px)", 
                    opacity: sel ? 0.7 : 0.55, 
                    lineHeight: 1.35 
                  }}>{preview(t.body)}</div>
                </button>
              );
            })}
          </div>
        )}

        {usingCustom ? (
          <div>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Вставь сюда любой английский текст…"
              style={{
                width: "100%", 
                minHeight: "clamp(120px, 30vh, 200px)", 
                padding: "clamp(12px, 2vw, 16px)", 
                fontSize: "clamp(16px, 2.5vw, 17px)",
                fontFamily: "Spectral, serif", 
                border: `1px solid ${INK}`, 
                borderRadius: "8px",
                background: "#faf6ec", 
                color: INK, 
                resize: "vertical", 
                outline: "none",
                boxSizing: "border-box", 
                marginBottom: "16px",
                WebkitAppearance: "none", // Убирает стандартные стили на iOS
              }}
            />
            <button
              onClick={() => buildDictionary(customText)}
              disabled={!customText.trim() || dictLoading}
              style={{
                border: "none", 
                background: INK, 
                color: PAPER, 
                padding: "clamp(10px, 2vw, 12px) clamp(16px, 3vw, 18px)",
                borderRadius: "8px", 
                cursor: customText.trim() ? "pointer" : "default",
                opacity: customText.trim() ? 1 : 0.4, 
                fontFamily: "Spectral, serif",
                fontSize: "clamp(13px, 2vw, 14px)", 
                marginBottom: "24px",
                touchAction: "manipulation",
                width: "100%",
              }}
            >
              ⚡ Подготовить словарь (быстрые клики)
            </button>
          </div>
        ) : (
          <div style={{ marginBottom: "8px" }}>
            <div style={{ 
              fontFamily: "Spectral, serif", 
              fontSize: "clamp(11px, 2vw, 13px)", 
              letterSpacing: "1px", 
              textTransform: "uppercase", 
              opacity: 0.5 
            }}>{LEVELS[level]}</div>
            <h1 className="title-display" style={{ 
              fontFamily: "'Fraunces', Georgia, serif", 
              fontSize: "clamp(28px, 5.5vw, 40px)", 
              color: INK, 
              fontWeight: 900, 
              margin: "4px 0 24px", 
              lineHeight: 1.05 
            }}>{current?.title}</h1>
          </div>
        )}

        <p className="text-body" style={{ 
          fontFamily: "Spectral, Georgia, serif", 
          fontSize: "clamp(16px, 3vw, 21px)", 
          lineHeight: "clamp(1.8, 3.5vw, 1.95)", 
          margin: 0,
          wordBreak: "break-word",
        }}>
          {text.trim() ? renderText(text) : <span style={{ opacity: 0.4 }}>Текст пуст — вставь что-нибудь выше.</span>}
        </p>

      </div>

      {/* Окно «Мои слова» - адаптивное */}
      {showSaved && (
        <div
          className="saved-modal"
          onClick={() => setShowSaved(false)}
          style={{
            position: "fixed", 
            inset: 0, 
            zIndex: 50, 
            background: "rgba(20,16,12,0.55)",
            display: "flex", 
            alignItems: "flex-start", 
            justifyContent: "center",
            padding: "clamp(32px, 6vh, 48px) clamp(12px, 3vw, 16px)", 
            overflowY: "auto",
          }}
        >
          <div
            className="saved-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", 
              maxWidth: "560px", 
              background: PAPER, 
              color: INK,
              borderRadius: "16px", 
              padding: "clamp(16px, 3vw, 24px)", 
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              animation: "pop 0.22s ease",
              margin: "auto 0",
            }}
          >
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              marginBottom: "18px",
              flexWrap: "wrap",
              gap: "8px"
            }}>
              <h2 style={{ 
                fontFamily: "'Fraunces', Georgia, serif", 
                color: INK, 
                fontSize: "clamp(22px, 4vw, 26px)", 
                fontWeight: 900, 
                margin: 0 
              }}>
                ★ Мои слова <span style={{ opacity: 0.4, fontWeight: 400 }}>({saved.length})</span>
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {saved.length > 0 && (
                  <button
                    onClick={() => setSaved([])}
                    style={{ 
                      border: "none", 
                      background: "transparent", 
                      color: INK, 
                      opacity: 0.5, 
                      cursor: "pointer", 
                      fontFamily: "Spectral, serif", 
                      fontSize: "clamp(12px, 2vw, 13px)", 
                      textDecoration: "underline",
                      touchAction: "manipulation",
                    }}
                  >
                    очистить всё
                  </button>
                )}
                <button
                  onClick={() => setShowSaved(false)}
                  title="Закрыть"
                  style={{ 
                    border: "none", 
                    background: "transparent", 
                    color: INK, 
                    cursor: "pointer", 
                    fontSize: "clamp(24px, 4vw, 26px)", 
                    lineHeight: 1, 
                    padding: 0,
                    touchAction: "manipulation",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {saved.length === 0 ? (
              <p style={{ 
                fontFamily: "Spectral, serif", 
                fontSize: "clamp(15px, 2.5vw, 16px)", 
                opacity: 0.5, 
                margin: "8px 0 4px" 
              }}>
                Пока пусто. Нажми на слово в тексте и сохрани его кнопкой «★ Сохранить».
              </p>
            ) : (
              <div style={{ 
                border: "1px solid #d8cbb0", 
                borderRadius: "10px", 
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
              }}>
                <table className="saved-table" style={{ 
                  width: "100%", 
                  borderCollapse: "collapse", 
                  fontFamily: "Spectral, serif",
                  fontSize: "clamp(13px, 2vw, 15px)",
                  minWidth: "280px",
                }}>
                  <thead>
                    <tr style={{ background: "#ece2cc" }}>
                      <th style={{ 
                        textAlign: "left", 
                        padding: "8px 14px", 
                        fontSize: "clamp(10px, 1.5vw, 12px)", 
                        letterSpacing: "1px", 
                        textTransform: "uppercase", 
                        opacity: 0.6, 
                        borderRight: "1px solid #d8cbb0", 
                        width: "42%" 
                      }}>Слово</th>
                      <th style={{ 
                        textAlign: "left", 
                        padding: "8px 14px", 
                        fontSize: "clamp(10px, 1.5vw, 12px)", 
                        letterSpacing: "1px", 
                        textTransform: "uppercase", 
                        opacity: 0.6 
                      }}>Перевод</th>
                      <th style={{ width: "36px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {saved.map((s, i) => (
                      <tr key={s.word} style={{ background: i % 2 ? "#faf6ec" : "#fffdf7", borderTop: "1px solid #e6dcc4" }}>
                        <td style={{ 
                          padding: "8px 14px", 
                          fontFamily: "'Fraunces', Georgia, serif", 
                          fontWeight: 600, 
                          fontSize: "clamp(14px, 2.5vw, 16px)", 
                          borderRight: "1px solid #e6dcc4", 
                          verticalAlign: "middle",
                          wordBreak: "break-word",
                        }}>{s.word}</td>
                        <td style={{ 
                          padding: "8px 14px", 
                          fontSize: "clamp(13px, 2vw, 15px)", 
                          color: "#5f513c", 
                          verticalAlign: "middle",
                          wordBreak: "break-word",
                        }}>{s.translation}</td>
                        <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                          <button
                            onClick={() => removeSaved(s.word)}
                            title="Удалить"
                            style={{ 
                              border: "none", 
                              background: "transparent", 
                              color: INK, 
                              opacity: 0.3, 
                              cursor: "pointer", 
                              fontSize: "clamp(16px, 3vw, 18px)", 
                              lineHeight: 1, 
                              padding: "4px 6px",
                              touchAction: "manipulation",
                            }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}