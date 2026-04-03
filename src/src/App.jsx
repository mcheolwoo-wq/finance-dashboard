import { useState, useEffect, useCallback } from "react";

const C = {
  bg: "#0a0e1a", surface: "#111827", surface2: "#1a2235",
  border: "#1e2d45", accent: "#00d4ff", accent2: "#00ff9d",
  purple: "#a78bfa", text: "#e2e8f0", muted: "#64748b",
  dim: "#94a3b8", danger: "#f87171", warning: "#fbbf24", success: "#34d399",
};

const DEFAULT_KPI = {
  kics:      { label: "K-ICS 비율",     value: "", unit: "%",    target: "200", desc: "지급여력 건전성" },
  combined:  { label: "합산비율",        value: "", unit: "%",    target: "100", desc: "100% 초과 시 손실" },
  csm:       { label: "CSM 잔액",        value: "", unit: "억원", target: "",    desc: "미래이익 잔액" },
  duration:  { label: "듀레이션 갭",     value: "", unit: "",     target: "0",   desc: "금리리스크 노출" },
  loss:      { label: "손해율",          value: "", unit: "%",    target: "80",  desc: "보험금/보험료" },
  npl:       { label: "NPL 비율",        value: "", unit: "%",    target: "1",   desc: "여신 건전성" },
  roe:       { label: "ROE",             value: "", unit: "%",    target: "10",  desc: "자본 효율성" },
  liquidity: { label: "유동성 커버리지", value: "", unit: "%",    target: "100", desc: "단기 유동성" },
};

function kpiStatus(key, val, target) {
  if (!val || !target) return "neutral";
  const v = parseFloat(val), t = parseFloat(target);
  if (isNaN(v) || isNaN(t)) return "neutral";
  const lowerBetter = ["combined", "loss", "npl", "duration"].includes(key);
  if (lowerBetter) {
    if (v < t * 0.9) return "good";
    if (v < t) return "warn";
    return "bad";
  }
  if (v >= t * 1.1) return "good";
  if (v >= t) return "warn";
  return "bad";
}

const STATUS_COLOR = { good: C.success, warn: C.warning, bad: C.danger, neutral: C.muted };
const fmt = (n, d = 2) => n != null ? Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtChg = (n) => n != null ? `${n >= 0 ? "+" : ""}${n.toFixed(2)}%` : "";
const chgColor = (n) => n == null ? C.muted : n > 0 ? C.success : n < 0 ? C.danger : C.muted;

export default function App() {
  const [tab, setTab] = useState("market");
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [errors, setErrors] = useState([]);
  const [kpi, setKpi] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fc_kpi3") || "null") || DEFAULT_KPI; }
    catch { return DEFAULT_KPI; }
  });
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    const errs = [];
    const result = {};

    // 1) 환율
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const d = await r.json();
      if (d.result === "success") {
        result.usdkrw = { value: d.rates.KRW, label: "원/달러", unit: "원", color: C.accent };
        result.jpykrw = { value: d.rates.KRW / d.rates.JPY * 100, label: "원/100엔", unit: "원", color: C.accent };
        result.eurkrw = { value: d.rates.KRW / d.rates.EUR, label: "원/유로", unit: "원", color: C.accent };
      }
    } catch { errs.push("환율"); }

    // 2) KOSPI
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=1d&range=2d");
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta) {
        const cur = meta.regularMarketPrice, prev = meta.previousClose;
        result.kospi = { value: cur, change: prev ? ((cur - prev) / prev) * 100 : null, label: "KOSPI", unit: "", color: C.accent2 };
      }
    } catch { errs.push("KOSPI"); }

    // 3) KOSDAQ
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EKQ11?interval=1d&range=2d");
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta) {
        const cur = meta.regularMarketPrice, prev = meta.previousClose;
        result.kosdaq = { value: cur, change: prev ? ((cur - prev) / prev) * 100 : null, label: "KOSDAQ", unit: "", color: C.accent2 };
      }
    } catch { errs.push("KOSDAQ"); }

    // 4) S&P500
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=2d");
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta) {
        const cur = meta.regularMarketPrice, prev = meta.previousClose;
        result.sp500 = { value: cur, change: prev ? ((cur - prev) / prev) * 100 : null, label: "S&P 500", unit: "", color: C.accent2 };
      }
    } catch { errs.push("S&P500"); }

    // 5) WTI
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/CL%3DF?interval=1d&range=2d");
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta) {
        const cur = meta.regularMarketPrice, prev = meta.previousClose;
        result.wti = { value: cur, change: prev ? ((cur - prev) / prev) * 100 : null, label: "WTI 유가", unit: "$", color: C.warning };
      }
    } catch { errs.push("WTI"); }

    // 6) 금
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1d&range=2d");
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta) {
        const cur = meta.regularMarketPrice, prev = meta.previousClose;
        result.gold = { value: cur, change: prev ? ((cur - prev) / prev) * 100 : null, label: "금 (Gold)", unit: "$", color: C.warning };
      }
    } catch { errs.push("금"); }

    // 7) 미국 10년 국채
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=2d");
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (meta) {
        const cur = meta.regularMarketPrice, prev = meta.previousClose;
        result.us10y = { value: cur, changeBp: prev ? (cur - prev) * 100 : null, label: "미국 10년물", unit: "%", color: C.purple };
      }
    } catch { errs.push("미국채"); }

    setMarket(result);
    setErrors(errs);
    setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    setLoading(false);
    showToast(errs.length === 0 ? "✓ 업데이트 완료" : `✓ 완료 (${errs.join(", ")} 실패)`);
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const saveKpi = (key, value) => {
    const next = { ...kpi, [key]: { ...kpi[key], value } };
    setKpi(next);
    try { localStorage.setItem("fc_kpi3", JSON.stringify(next)); } catch {}
    setEditKey(null);
    showToast("✓ 저장되었습니다");
  };

  const runAnalysis = async () => {
    setAiLoading(true);
    setAiText("");
    const kpiStr = Object.entries(kpi).filter(([, v]) => v.value)
      .map(([, v]) => `${v.label}: ${v.value}${v.unit} (목표: ${v.target}${v.unit})`).join(", ") || "입력 없음";
    const mktStr = market ? [
      market.usdkrw && `원/달러: ${fmt(market.usdkrw.value, 1)}원`,
      market.kospi  && `KOSPI: ${fmt(market.kospi.value, 2)}`,
      market.us10y  && `미국채10년: ${market.us10y.value}%`,
      market.wti    && `WTI: $${fmt(market.wti.value, 1)}`,
    ].filter(Boolean).join(", ") : "없음";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content:
            `금융·보험사 재경팀장 전문 어드바이저로서 아래 데이터를 분석해 핵심 시사점과 즉각 조치사항을 한국어로 간결하게 알려주세요.\n\n📊 내부 KPI: ${kpiStr}\n📈 시장 데이터: ${mktStr}\n\n형식:\n① [가장 중요한 리스크/이슈]\n② [두 번째 이슈]\n③ [권고 조치]`
          }]
        })
      });
      const data = await res.json();
      setAiText(data.content?.filter(b => b.type === "text").map(b => b.text).join("") || "");
    } catch { setAiText("분석 중 오류가 발생했습니다."); }
    setAiLoading(false);
  };

  const now = new Date();
  const months = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

  const MCard = ({ d, decimals = 2 }) => {
    if (!d) return (
      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 11px", opacity: 0.3 }}>
        <div style={{ fontSize: 10, color: C.muted }}>—</div>
        <div style={{ fontFamily: "monospace", fontSize: 17, color: C.muted }}>—</div>
      </div>
    );
    const chgVal = d.changeBp != null
      ? `${d.changeBp >= 0 ? "+" : ""}${d.changeBp.toFixed(1)}bp`
      : d.change != null ? fmtChg(d.change) : null;
    return (
      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 11px" }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{d.label}</div>
        <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 600, color: d.color, marginBottom: 1 }}>
          {d.unit === "$" ? "$" : ""}{fmt(d.value, decimals)}{d.unit !== "$" ? d.unit : ""}
        </div>
        {chgVal && <div style={{ fontSize: 10, fontFamily: "monospace", color: chgColor(d.changeBp ?? d.change) }}>{chgVal}</div>}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'Noto Sans KR',sans-serif", background: C.bg, color: C.text, minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 90 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.25}}*{box-sizing:border-box}`}</style>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg,${C.bg},#0d1b2e)`, padding: "16px 16px 0", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 3, color: C.accent, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 3 }}>Finance · Insurance</div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.25 }}>재경팀장<br />실시간 모니터링</div>
          </div>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 600, color: C.accent, lineHeight: 1, textAlign: "right" }}>{now.getDate()}</div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textAlign: "right" }}>{now.getFullYear()} {months[now.getMonth()]}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingTop: 8, scrollbarWidth: "none" }}>
          {[["market","📈 시장"],["kpi","📊 KPI"],["analysis","🤖 분석"]].map(([k, l]) => (
            <div key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, padding: "6px 13px", borderRadius: "16px 16px 0 0", fontSize: 12, fontWeight: tab === k ? 700 : 500, cursor: "pointer", border: `1px solid ${tab === k ? C.accent : C.border}`, borderBottom: `1px solid ${tab === k ? C.bg : C.border}`, background: tab === k ? C.bg : "transparent", color: tab === k ? C.accent : C.muted }}>{l}</div>
          ))}
        </div>
      </div>

      <div style={{ padding: "12px 14px" }}>

        {/* 시장 데이터 */}
        {tab === "market" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: C.muted }}>{updatedAt ? `업데이트: ${updatedAt}` : "로딩 중..."}</span>
            <button onClick={fetchAll} disabled={loading} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, color: loading ? C.accent : C.muted, cursor: "pointer" }}>
              {loading ? "⟳ 조회 중..." : "⟳ 새로고침"}
            </button>
          </div>
          {errors.length > 0 && (
            <div style={{ background: "rgba(248,113,113,0.06)", border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C.danger, marginBottom: 8 }}>
              ⚠ {errors.join(", ")} 일부 조회 실패
            </div>
          )}
          {loading && !market
            ? <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 12, justifyContent: "center", padding: "30px 0" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1s ${i*0.2}s infinite` }}/>)}
                <span>실시간 데이터 조회 중...</span>
              </div>
            : market && <>
                {[
                  { title: "환율", keys: ["usdkrw","jpykrw","eurkrw"], dec: 1 },
                  { title: "주가 지수", keys: ["kospi","kosdaq","sp500"], dec: 2 },
                  { title: "금리 · 원자재", keys: ["us10y","wti","gold"], dec: 2 },
                ].map(({ title, keys, dec }) => (
                  <div key={title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: C.purple, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>{title}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                      {keys.map(k => <MCard key={k} d={market[k]} decimals={dec} />)}
                    </div>
                  </div>
                ))}
              </>
          }
        </>}

        {/* 내부 KPI */}
        {tab === "kpi" && <>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>항목을 탭해서 수치를 입력하세요</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            {Object.entries(kpi).map(([key, item]) => {
              const st = kpiStatus(key, item.value, item.target);
              return (
                <div key={key} onClick={() => { setEditKey(key); setEditVal(item.value); }}
                  style={{ background: C.surface2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${STATUS_COLOR[st]}`, borderRadius: 9, padding: "10px 11px", cursor: "pointer" }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{item.label}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 19, fontWeight: 600, color: STATUS_COLOR[st], marginBottom: 2 }}>
                    {item.value ? `${item.value}${item.unit}` : <span style={{ fontSize: 12, color: C.muted }}>미입력 ✎</span>}
                  </div>
                  {item.target && <div style={{ fontSize: 10, color: C.muted }}>목표 {item.target}{item.unit}</div>}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{item.desc}</div>
                </div>
              );
            })}
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["good", C.success,"양호"],["warn",C.warning,"주의"],["bad",C.danger,"위험"],["neutral",C.muted,"미입력"]].map(([k,c,l]) => (
              <span key={k} style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, background: `${c}18`, color: c, border: `1px solid ${c}30` }}>● {l}</span>
            ))}
          </div>
        </>}

        {/* AI 분석 */}
        {tab === "analysis" && <>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C.purple, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>AI 종합 분석</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>입력된 KPI + 실시간 시장 데이터를 기반으로 재경팀장 관점 핵심 시사점을 분석합니다.</div>
            <button onClick={runAnalysis} disabled={aiLoading} style={{ width: "100%", background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
              {aiLoading ? "⟳ 분석 중..." : "🤖 AI 분석 실행"}
            </button>
            {aiLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: C.muted, fontSize: 12, justifyContent: "center", padding: "10px 0" }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: `pulse 1s ${i*0.2}s infinite` }}/>)}
                <span>분석 중...</span>
              </div>
            )}
            {aiText && (
              <div style={{ background: "rgba(0,212,255,0.04)", border: `1px solid rgba(0,212,255,0.15)`, borderRadius: 9, padding: "12px 13px", fontSize: 13, color: C.dim, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                {aiText}
              </div>
            )}
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C.purple, textTransform: "uppercase", fontFamily: "monospace", marginBottom: 10 }}>분석 데이터 현황</div>
            <div style={{ fontSize: 12, marginBottom: 6 }}>시장 데이터 <span style={{ color: market ? C.success : C.warning, fontFamily: "monospace" }}>{market ? `✓ 연동됨 (${updatedAt})` : "⚠ 미연동"}</span></div>
            <div style={{ fontSize: 12 }}>KPI 입력 <span style={{ color: C.accent, fontFamily: "monospace" }}>{Object.values(kpi).filter(v => v.value).length}/{Object.keys(kpi).length}개</span></div>
          </div>
        </>}
      </div>

      {/* KPI 입력 모달 */}
      {editKey && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setEditKey(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "14px 14px 0 0", padding: "18px 16px 30px", width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{kpi[editKey]?.label}</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{kpi[editKey]?.desc} · 목표: {kpi[editKey]?.target}{kpi[editKey]?.unit}</div>
            <input style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 16, color: C.text, fontFamily: "monospace", outline: "none", marginBottom: 10 }}
              type="number" placeholder={`수치 입력 (${kpi[editKey]?.unit})`} value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditKey(null)} style={{ flex: 1, background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: 11, fontSize: 14, cursor: "pointer" }}>취소</button>
              <button onClick={() => saveKpi(editKey, editVal)} style={{ flex: 1, background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: 11, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "rgba(10,14,26,0.97)", borderTop: `1px solid ${C.border}`, padding: "10px 10px 20px", display: "flex", justifyContent: "space-around", zIndex: 200 }}>
        {[["market","📈","시장"],["kpi","📊","KPI"],["analysis","🤖","분석"]].map(([k,ic,lb]) => (
          <button key={k} onClick={() => setTab(k)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", padding: "4px 14px", borderRadius: 10, border: "none", background: tab === k ? "rgba(0,212,255,0.08)" : "transparent" }}>
            <span style={{ fontSize: 18 }}>{ic}</span>
            <span style={{ fontSize: 10, color: tab === k ? C.accent : C.muted }}>{lb}</span>
          </button>
        ))}
      </div>

      {/* TOAST */}
      <div style={{ position: "fixed", top: 18, left: "50%", transform: `translateX(-50%) translateY(${toast ? 0 : -60}px)`, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 9, padding: "8px 16px", fontSize: 12, color: C.accent, zIndex: 999, transition: "transform 0.3s", whiteSpace: "nowrap" }}>
        {toast}
      </div>
    </div>
  );
}
