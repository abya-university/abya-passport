import React, { useState, useEffect } from "react";

// ABYA Passport — Polished UI v3 (automated simulation preview)
// - Replaced flip-card with an automated simulation in the hero that
//   demonstrates: create DID -> resolve DID -> issue credential -> verify credential
// - Simulation auto-runs on mount and can be replayed with a button.
// - TailwindCSS is required. Keep the rest of the app as before.

const ABYA = {
    blue: "#0b5c85",
    teal: "#0b7aa3",
    deepBlue: "#0b3d61",
    gold: "#d99b18",
    brightGold: "#f2b705",
};

function useToasts() {
    const [toasts, setToasts] = useState([]);
    useEffect(() => {
        const t = setInterval(() => {
            setToasts((s) => s.filter((x) => Date.now() - x.ts < 4200));
        }, 700);
        return () => clearInterval(t);
    }, []);
    const push = (msg) => setToasts((s) => [...s, { id: Math.random().toString(36).slice(2), msg, ts: Date.now() }]);
    return { toasts, push };
}

// --- Simulation Preview component ---
function SimulationPreview({ onNotify }) {
    const steps = [
        { id: 'createDid', label: 'Generating DID', duration: 900, result: 'did:ic:0xyZ...9Ab' },
        { id: 'resolveDid', label: 'Resolving DID', duration: 800, result: 'principal: abcdef-ghijk-lmnop' },
        { id: 'issueVc', label: 'Issuing Credential', duration: 1100, result: 'vc-id: 0xCRED...123' },
        { id: 'verifyVc', label: 'Verifying Credential', duration: 1000, result: 'VERIFIED' },
    ];

    const [current, setCurrent] = useState(-1);
    // logs are objects so we can update the same entry with result for a cleaner timeline
    const [logs, setLogs] = useState([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [continuous, setContinuous] = useState(true); // demo loops by default

    const mountedRef = React.useRef(true);
    const stepLogIdsRef = React.useRef({});

    // add a new log entry and return its id
    const pushLog = (id, text) => {
        const entry = { id, text, ts: Date.now() };
        setLogs((s) => [entry, ...s].slice(0, 6));
    };

    // update an existing log entry (keeps timeline tidy)
    const updateLog = (id, text) => {
        setLogs((s) => s.map((l) => (l.id === id ? { ...l, text } : l)));
    };

    // run simulation sequence
    const run = async () => {
        if (running) return; // prevent parallel runs

        setLogs([]);
        stepLogIdsRef.current = {};
        setRunning(true);
        setProgress(0);

        for (let i = 0; i < steps.length; i++) {
            if (!mountedRef.current) return;
            setCurrent(i);
            const step = steps[i];

            // create a compact log entry and remember its id so we can update it with the result
            const logId = `${step.id}-${Date.now()}`;
            stepLogIdsRef.current[step.id] = logId;
            pushLog(logId, step.label);

            // animate progress for this step
            const start = Date.now();
            while (Date.now() - start < step.duration) {
                if (!mountedRef.current) return;
                const elapsed = Date.now() - start;
                const p = Math.min(100, Math.floor((elapsed / step.duration) * 100));
                const overall = Math.floor((i / steps.length) * 100 + (p / steps.length));
                setProgress(overall);
                // small wait
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, 80));
            }

            if (!mountedRef.current) return;

            // update the same log entry with a concise result line
            updateLog(logId, `${step.label} — ${step.result}`);
            setProgress(Math.floor(((i + 1) / steps.length) * 100));

            // short pause between steps
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, 220));
        }

        if (!mountedRef.current) return;

        setRunning(false);
        setCurrent(steps.length - 1);
        // intentionally do not emit a toast or 'mock' message — keep the demo seamless and quiet

        // restart automatically if continuous mode is enabled
        if (continuous && mountedRef.current) {
            setTimeout(() => {
                if (mountedRef.current) run();
            }, 800);
        }
    };

    // auto-run on mount
    useEffect(() => {
        mountedRef.current = true;
        const t = setTimeout(() => run(), 420);
        return () => {
            mountedRef.current = false;
            clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="w-full max-w-md bg-white/90 border border-gray-100 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <div className="text-xs text-slate-400">Live simulation</div>
                    <div className="text-sm font-semibold text-slate-900">Create & verify flow (demo)</div>
                </div>
                <div className="text-xs text-slate-500">Demo mode</div>
            </div>

            <div className="h-36 rounded-lg bg-gradient-to-br from-slate-50 to-white border border-gray-100 p-3 flex flex-col justify-between">
                <div>
                    <div className="text-xs text-slate-500">Current action</div>
                    <div className="mt-2 text-sm font-medium text-slate-800">{currentStep ? currentStep.label : 'Preparing'}</div>

                    {currentStep && (
                        <div className="mt-2 font-mono text-sm text-slate-700 bg-slate-50 p-2 rounded break-words">{currentStep.result}</div>
                    )}
                </div>

                <div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mt-3">
                        <div className="h-2 rounded-full" style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${ABYA.deepBlue}, ${ABYA.brightGold})`, transition: 'width 120ms linear' }} />
                    </div>
                    <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                        <div>{running ? 'Running' : 'Idle'}</div>
                        <div>{progress}%</div>
                    </div>
                </div>
            </div>

            {/* timeline/logs */}
            <div className="mt-4 grid grid-cols-1 gap-2">
                {logs.map((l) => (
                    <div key={l.id} className="text-xs text-slate-600 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-slate-300" />
                        <div className="truncate">{l.text}</div>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
                <button onClick={replay} disabled={running} className={`px-3 py-2 rounded-md text-sm font-medium ${running ? 'bg-gray-100 text-slate-400' : 'bg-white border border-gray-200 hover:shadow-sm'}`}>
                    {running ? 'Running' : 'Replay'}
                </button>

                <div className="flex items-center gap-2">
                    <button onClick={reset} className="px-3 py-2 rounded-md text-sm border border-gray-200">
                        Reset
                    </button>
                    <button onClick={() => setContinuous((c) => !c)} className="px-2 py-1 rounded-md text-xs border border-gray-200">
                        {continuous ? 'Loop: On' : 'Loop: Off'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- rest of app (navbar, features, pages) ---
const Navbar = ({ currentPage, setCurrentPage, theme, setTheme }) => {
    // (kept earlier Navbar implementation - replaced by new one in main file)
    // For brevity, the main navbar implementation is kept from previous canvas state.
    return null;
};

const Toasts = ({ toasts }) => (
    <div className="fixed right-4 top-24 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
            <div key={t.id} className="min-w-[220px] bg-white border border-gray-100 shadow rounded-lg px-4 py-2 text-sm text-slate-700">
                {t.msg}
            </div>
        ))}
    </div>
);

const SkeletonCard = ({ className = "" }) => (
    <div className={`animate-pulse bg-white/60 rounded-2xl p-6 h-40 ${className}`} />
);

const Feature = ({ title, desc, accent, icon }) => (
    <div className="bg-white/80 rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition transform hover:-translate-y-2 hover:scale-[1.01]">
        <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent}, ${ABYA.brightGold})` }}>
                <div className="w-7 h-7 text-white">{icon}</div>
            </div>
            <div>
                <h4 className="text-base font-semibold text-slate-900">{title}</h4>
                <p className="text-sm text-slate-600 mt-1">{desc}</p>
            </div>
        </div>
    </div>
);

const Testimonial = ({ quote, author }) => (
    <div className="bg-white/80 border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md transition">
        <div className="text-slate-700 text-sm">“{quote}”</div>
        <div className="text-xs text-slate-500 mt-3">— {author}</div>
    </div>
);

export default function App() {
    const [currentPage, setCurrentPage] = useState('home');
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [theme, setTheme] = useState('light');
    const { toasts, push } = useToasts();

    useEffect(() => setMounted(true), []);

    const go = (page) => {
        setLoading(true);
        setTimeout(() => {
            setCurrentPage(page);
            setLoading(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 380);
    };

    return (
        <div className={`${theme === 'dark' ? 'dark' : ''}`}>
            <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-900 text-slate-200' : 'bg-gradient-to-br from-white to-slate-50 text-slate-800'}`}>
                {/* use the previously provided Navbar implementation from canvas - it will remain unchanged */}
                <div className="pt-28 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

                    <Toasts toasts={toasts} />

                    {/* Hero with animated preview */}
                    {currentPage === 'home' && (
                        <section className={`relative overflow-visible grid grid-cols-1 md:grid-cols-2 items-center gap-8 mb-12 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                            {/* decorative blobs behind hero (subtle, non-interactive) */}
                            <div aria-hidden className="pointer-events-none absolute -left-20 -top-12 w-72 h-72 rounded-full blur-3xl" style={{ background: `radial-gradient(circle at 30% 30%, ${ABYA.blue}22, transparent 40%)`, zIndex: 0 }} />
                            <div aria-hidden className="pointer-events-none absolute -right-10 bottom-6 w-48 h-48 rounded-full blur-2xl" style={{ background: `radial-gradient(circle at 70% 70%, ${ABYA.brightGold}20, transparent 40%)`, zIndex: 0 }} />

                            <div className="relative z-20">
                                <div className="inline-flex items-center gap-3 mb-4">
                                    <img src="/abya.png" alt="ABYA logo" className="w-28 h-auto" />
                                    <span className="text-sm text-slate-500">Decentralized identity • ABYA</span>
                                </div>

                                <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                                    Your identity,{' '}
                                    <span style={{ background: `linear-gradient(90deg, ${ABYA.blue}, ${ABYA.brightGold})` }} className="bg-clip-text text-transparent">
                                        cryptographically proven
                                    </span>
                                </h1>

                                <p className="mt-4 text-lg text-slate-600 max-w-xl">Issue, manage and verify verifiable credentials with ABYA Passport — a lightweight, developer-friendly platform for the Web3 era.</p>

                                {/* micro-features for quick scannability */}
                                <div role="list" className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
                                    <div role="listitem" className="p-3 rounded-lg bg-white/60 border border-gray-100 shadow-sm flex items-start gap-3">
                                        <div aria-hidden className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${ABYA.blue}, ${ABYA.teal})` }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                                <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-800">Standards-first</div>
                                            <div className="text-xs text-slate-500">W3C DIDs & VCs — interoperable by design</div>
                                        </div>
                                    </div>

                                    <div role="listitem" className="p-3 rounded-lg bg-white/60 border border-gray-100 shadow-sm flex items-start gap-3">
                                        <div aria-hidden className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${ABYA.gold}, ${ABYA.brightGold})` }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                                                <path d="M13 2L3 14h9l-1 8L21 10h-9l1-8z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium text-slate-800">Fast demo flows</div>
                                            <div className="text-xs text-slate-500">Optimized for quick prototypes and hackathons</div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <div>
                                        <div>
                                            <div className="font-medium text-slate-800">Standards-first</div>
                                            <div className="text-xs text-slate-500">W3C DIDs & VCs</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="mt-1 w-9 h-9 rounded-md flex items-center justify-center bg-white/90 border border-gray-100 shadow-sm font-semibold">⚡</div>
                                        <div>
                                            <div className="font-medium text-slate-800">Fast demo flows</div>
                                            <div className="text-xs text-slate-500">Ready for hackathons</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex flex-wrap gap-3 items-center">
                                    <button onClick={() => { go('did'); push('Opening DID workspace'); }} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2" style={{ background: `linear-gradient(90deg, ${ABYA.deepBlue}, ${ABYA.brightGold})` }} aria-label="Create a DID">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                        Create DID
                                    </button>

                                    <button onClick={() => { go('vc'); push('Opening VC workspace'); }} className="px-4 py-3 rounded-xl border border-gray-200 text-slate-800 font-semibold hover:bg-slate-50" aria-label="Issue a credential">Issue Credential</button>

                                    <button onClick={() => { navigator.clipboard?.writeText(window.location.href); push('Copied demo link'); }} className="px-3 py-2 rounded-md text-sm border border-gray-200 text-slate-700">Share demo</button>
                                </div>

                                <div className="mt-8 flex items-center gap-4 text-sm text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <div className="h-7 w-7 rounded-full bg-white/80 border border-gray-100 flex items-center justify-center font-semibold text-xs text-slate-700">★</div>
                                        <div>Hackathon friendly • Demo ready</div>
                                    </div>

                                    <div className="px-3 py-2 bg-white/80 border rounded">Trusted by demo partners</div>
                                </div>
                            </div>

                            <div className="order-first md:order-last relative z-10 flex justify-center">
                                {/* SimulationPreview wrapped with frame and loop badge */}
                                <div className="relative">
                                    <div className="absolute -top-3 -left-3 px-2 py-1 rounded-full text-xs font-semibold bg-white/90 border border-gray-100 shadow-sm flex items-center gap-2" aria-hidden>
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <span>Live Demo</span>
                                    </div>

                                    <SimulationPreview onNotify={(msg) => push(msg)} />

                                    {/* loop indicator */}
                                    <div className="absolute -bottom-3 right-0 px-2 py-1 rounded-full text-xs bg-white/90 border border-gray-100 shadow-sm">Loop: On</div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Features */}


                    {/* Testimonials / Social proof */}
                    {currentPage === 'home' && (
                        <section className={`mb-12 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">What people say</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Testimonial quote="Super fast DID creation and a beautiful UX." author="Team Lead — DemoOrg" />
                                <Testimonial quote="Credentials verified instantly in our integration tests." author="Dev — IntegrateNow" />
                                <Testimonial quote="Perfect for hackathon demos — easy to show judges." author="Founder — HackCo" />
                            </div>
                        </section>
                    )}

                    {/* Page content: DIDs / VCs / Verify / Ethereum VCs */}
                    {currentPage !== 'home' && (
                        <div className="space-y-6">
                            {loading ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <SkeletonCard />
                                    <SkeletonCard />
                                    <SkeletonCard />
                                </div>
                            ) : (
                                <>
                                    {currentPage === 'did' && (
                                        <section className="bg-white/80 border border-gray-100 rounded-2xl p-6 shadow-sm">
                                            <div className="flex items-center justify-between mb-4">
                                                <h2 className="text-2xl font-bold">DID Documents</h2>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => push('Export DID (mock)')} className="px-3 py-2 rounded-md border border-gray-200 text-slate-700">Export</button>
                                                    <button onClick={() => push('Copied DID')} className="px-3 py-2 rounded-md bg-white/80 border border-gray-200">Copy</button>
                                                </div>
                                            </div>

                                            <p className="text-slate-600 mb-4">This view is a placeholder for your DIDDocument component — replace with your actual UI to show live data during the demo.</p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-white rounded-xl p-4 border border-gray-100">
                                                    <div className="text-xs text-slate-500 mb-2">DID</div>
                                                    <div className="font-mono bg-slate-50 p-2 rounded">did:ic:abcd1234...xyz</div>
                                                </div>

                                                <div className="bg-white rounded-xl p-4 border border-gray-100">
                                                    <div className="text-xs text-slate-500 mb-2">Controller</div>
                                                    <div className="text-slate-700">principal: [example-principal-address]</div>
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {currentPage === 'vc' && (
                                        <section className="bg-white/80 border border-gray-100 rounded-2xl p-6 shadow-sm">
                                            <h2 className="text-2xl font-bold mb-2">Verifiable Credentials</h2>
                                            <p className="text-slate-600 mb-4">Issue and manage credentials. Replace this placeholder with your VCManager component for live demo flows.</p>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-white rounded-xl p-4 border border-gray-100">
                                                    <div className="text-xs text-slate-500 mb-2">Example Credential</div>
                                                    <div className="text-slate-700">Certificate of Completion — Blockchain 101</div>
                                                </div>

                                                <div className="bg-white rounded-xl p-4 border border-gray-100">
                                                    <div className="text-xs text-slate-500 mb-2">Status</div>
                                                    <div className="text-slate-700">Unsigned</div>
                                                </div>
                                            </div>
                                        </section>
                                    )}

                                    {currentPage === 'verify' && (
                                        <section className="bg-white/80 border border-gray-100 rounded-2xl p-6 shadow-sm">
                                            <h2 className="text-2xl font-bold mb-2">Verify Credentials</h2>
                                            <p className="text-slate-600 mb-4">Paste or upload a credential to verify its signature and status.</p>

                                            <div className="bg-white rounded-xl p-4 border border-gray-100">(VCVerifier component goes here)</div>
                                        </section>
                                    )}

                                    {currentPage === 'ethr-vc' && (
                                        <section className="bg-white/80 border border-gray-100 rounded-2xl p-6 shadow-sm">
                                            <h2 className="text-2xl font-bold mb-2">Ethereum VCs</h2>
                                            <p className="text-slate-600 mb-4">Manage Ethereum-native verifiable credentials.</p>
                                        </section>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <footer className="mt-12 text-center text-sm text-slate-500 pb-12">
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-center justify-center gap-4 mb-4">
                                <div className="text-xs text-slate-400">Built with ♥ for ABYA • Hackathon demo</div>
                            </div>
                            <div className="text-xs text-slate-400">© {new Date().getFullYear()} ABYA Passport</div>
                        </div>
                    </footer>
                </div>

                {/* Floating help CTA */}
                <button onClick={() => push('Need help? Join Discord (mock)')} className="fixed right-6 bottom-6 z-50 px-4 py-3 rounded-full shadow-lg flex items-center gap-3" style={{ background: `linear-gradient(90deg, ${ABYA.deepBlue}, ${ABYA.brightGold})`, color: 'white' }} aria-label="Help">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm1.07-7.75c-.9.52-1.07.88-1.07 1.75h-2v-.5c0-1.2.6-2 1.6-2.6 1-.6 1.4-1.1 1.4-1.9 0-1.1-.9-2-2-2s-2 .9-2 2H9c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.2-.5 1.9-1.93 2.75z" /></svg>
                    <span className="text-sm font-semibold">Help</span>
                </button>
            </div >
        </div >
    );
}
