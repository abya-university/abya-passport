import React, { useState, useEffect, useRef } from "react";

const ABYA = {
  blue: "#0b5c85",
  teal: "#0b7aa3",
  deepBlue: "#0b3d61",
  gold: "#d99b18",
  brightGold: "#f2b705",
};

function SimulationPreview({ onNotify, darkMode }) {
  // Increased durations for slower simulation
  const steps = [
    { id: 'createDid', label: 'Generating DID', duration: 1800, result: 'did:ic:0xyZ...9Ab' },
    { id: 'resolveDid', label: 'Resolving DID', duration: 2700, result: 'principal: abcdef-ghijk-lmnop' },
    { id: 'issueVc', label: 'Issuing Credential', duration: 2200, result: 'vc-id: 0xCRED...123' },
    { id: 'verifyVc', label: 'Verifying Credential', duration: 2000, result: 'VERIFIED' },
  ];

  const [current, setCurrent] = useState(-1);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [continuous, setContinuous] = useState(true);

  const mountedRef = useRef(true);
  const stepLogIdsRef = useRef({});

  const pushLog = (id, text) => {
    const entry = { id, text, ts: Date.now() };
    setLogs((s) => [entry, ...s].slice(0, 6));
  };

  const updateLog = (id, text) => {
    setLogs((s) => s.map((l) => (l.id === id ? { ...l, text } : l)));
  };

  const run = async () => {
    if (running) return;
    setLogs([]);
    stepLogIdsRef.current = {};
    setRunning(true);
    setProgress(0);
    for (let i = 0; i < steps.length; i++) {
      if (!mountedRef.current) return;
      setCurrent(i);
      const step = steps[i];
      const logId = `${step.id}-${Date.now()}`;
      stepLogIdsRef.current[step.id] = logId;
      pushLog(logId, step.label);
      const start = Date.now();
      while (Date.now() - start < step.duration) {
        if (!mountedRef.current) return;
        const elapsed = Date.now() - start;
        const p = Math.min(100, Math.floor((elapsed / step.duration) * 100));
        const overall = Math.floor((i / steps.length) * 100 + (p / steps.length));
        setProgress(overall);
        await new Promise((r) => setTimeout(r, 80));
      }
      if (!mountedRef.current) return;
      updateLog(logId, `${step.label} — ${step.result}`);
      setProgress(Math.floor(((i + 1) / steps.length) * 100));
      await new Promise((r) => setTimeout(r, 220));
    }
    if (!mountedRef.current) return;
    setRunning(false);
    setCurrent(steps.length - 1);
    if (continuous && mountedRef.current) {
      setTimeout(() => {
        if (mountedRef.current) run();
      }, 800);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const t = setTimeout(() => run(), 420);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, [continuous]);

  const replay = () => {
    setContinuous(true);
    run();
  };

  const reset = () => {
    if (running) return;
    setLogs([]);
    setProgress(0);
    setCurrent(-1);
    setContinuous(false);
  };

  const currentStep = current >= 0 ? steps[current] : null;

  return (
    <div className={`w-full max-w-md h-96 border rounded-3xl p-5 shadow-2xl flex flex-col justify-between transition-colors duration-300 backdrop-blur-xl
      ${darkMode ? 'bg-[#18181b] border-gray-100 text-yellow-100' : 'bg-white/90 border-gray-100 text-slate-800'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className={`text-xs ${darkMode ? 'text-yellow-300' : 'text-slate-400'}`}>Flow simulation</div>
        </div>
        <div className={`text-xs ${darkMode ? 'text-yellow-200' : 'text-slate-500'}`}>Demo mode</div>
      </div>
      <div className={`h-36 rounded-lg p-3 flex flex-col justify-between border transition-colors duration-300
        ${darkMode
          ? 'bg-transparent border-gray-100'
          : 'bg-gradient-to-br from-slate-50 to-white border-gray-100'}
      `}>
        <div>
          <div className={`text-xs ${darkMode ? 'text-yellow-200' : 'text-slate-500'}`}>Current action</div>
          <div className={`mt-2 text-sm font-medium ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>{currentStep ? currentStep.label : 'Preparing'}</div>
          {currentStep && (
            <div className={`mt-2 font-mono text-sm p-2 rounded break-words transition-colors duration-300
              ${darkMode ? 'text-yellow-100 bg-transparent' : 'text-slate-700 bg-slate-50'}`}>{currentStep.result}</div>
          )}
        </div>
        <div>
          <div className={`w-full rounded-full h-2 overflow-hidden mt-3 ${darkMode ? 'bg-yellow-900/30' : 'bg-gray-100'}`}> 
            <div className="h-2 rounded-full" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${ABYA.deepBlue}, ${ABYA.brightGold})`, transition: 'width 120ms linear' }} />
          </div>
          <div className={`mt-2 text-xs flex items-center justify-between ${darkMode ? 'text-yellow-300' : 'text-slate-500'}`}> 
            <div>{running ? 'Running' : 'Idle'}</div>
            <div>{progress}%</div>
          </div>
        </div>
      </div>
      {/* timeline/logs: show steps in chronological order (first at top, last at bottom) */}
      <div className="mt-4 grid grid-cols-1 gap-2">
        {logs.slice().reverse().map((l) => (
          <div key={l.id} className={`text-xs flex items-center gap-3 ${darkMode ? 'text-yellow-200' : 'text-slate-600'}`}>
            <div className={`w-2 h-2 rounded-full ${darkMode ? 'bg-yellow-400' : 'bg-emerald-300'}`} />
            <div className="truncate">{l.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className={`mt-4 text-xs ${darkMode ? 'text-yellow-300' : 'text-slate-500'}`}>This is a simulated demo — values are mock data for presentation only.</div>
        {/* <button onClick={replay} disabled={running} className={`px-3 py-2 rounded-md text-sm font-medium ${running ? 'bg-gray-100 text-slate-400' : 'bg-white border border-gray-200 hover:shadow-sm'}`}>
          {running ? 'Running' : 'Replay'}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="px-3 py-2 rounded-md text-sm border border-gray-200">
            Reset
          </button>
          <button onClick={() => setContinuous((c) => !c)} className="px-2 py-1 rounded-md text-xs border border-gray-200">
            {continuous ? 'Loop: On' : 'Loop: Off'}
          </button>
        </div> */}
      </div>
    </div>
  );
}

export default SimulationPreview;
