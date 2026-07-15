// Extracted from src/app.jsx for readability — injected into a <style> tag at
// runtime (see App()'s useEffect), not processed by esbuild's CSS pipeline.
// Editing this file requires no build-config changes; it's just a JS string.
export const PRESS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=JetBrains+Mono:wght@400;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--paper:#f5f0e2;--paper2:#ede8d4;--ink:#0d0b08;--rule:#c4b898;--dim:#6b5d44;--gold:#6b5800;--navy:#1a2f54;--forest:#1a4f2a;--ember:#7a3400;--red:#7a1414;--plum:#3d2452;--teal:#1a4f4f;--hdr:72px}
html,body{height:100%;background:var(--paper)}
body{font-family:'Times New Roman',Times,Georgia,serif;color:var(--ink)}
.hdr{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--paper);border-bottom:3px solid var(--ink)}
.masthead{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:8px 20px 6px;border-bottom:1px solid var(--rule)}
.mast-left{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.mast-title{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(22px,5vw,30px);letter-spacing:-.01em;text-align:center;color:var(--ink)}
.mast-right{text-align:right;font-size:8px;letter-spacing:.12em;color:var(--dim);white-space:nowrap}
.mast-right-stack{display:flex;flex-direction:column;align-items:flex-end;gap:3px}
.mast-right-row{display:flex;gap:10px;align-items:center}
.ticker-wrap{background:var(--paper2);overflow:hidden;height:28px;display:flex;align-items:center;border-top:1px solid var(--rule)}
.ticker-track{display:flex;gap:0;animation:rtl 40s linear infinite;white-space:nowrap;will-change:transform}
.ticker-track:hover{animation-play-state:paused}
@keyframes rtl{0%{transform:translateX(0)}100%{transform:translateX(-33.333%)}}
.tick{display:inline-flex;gap:8px;align-items:center;padding:0 20px;font-size:10px;letter-spacing:.06em;border-right:1px solid var(--rule);font-family:'JetBrains Mono',monospace}
.t-sym{color:var(--rule)}.t-val{color:var(--dim)}.t-up{color:var(--forest)}.t-dn{color:var(--red)}
.scroll{padding-top:var(--hdr);column-width:440px;column-gap:0;column-rule:1px solid var(--rule)}
@media(min-width:481px){.scroll{padding-right:40px}}
section{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;overflow:visible;position:relative;border-bottom:3px solid var(--ink);padding:24px 20px 20px;display:flex;flex-direction:column}
.fade{opacity:0;transform:translateY(18px);transition:opacity .55s ease,transform .55s ease}
section.visible .fade{opacity:1;transform:translateY(0)}
section.visible .fade:nth-child(2){transition-delay:.10s}
section.visible .fade:nth-child(3){transition-delay:.20s}
section.visible .fade:nth-child(4){transition-delay:.32s}
section.visible .fade:nth-child(5){transition-delay:.45s}
section.visible .fade:nth-child(6){transition-delay:.56s}
@media(prefers-reduced-motion:reduce){.fade,.ticker-track{animation:none;transition:none}.fade{opacity:1;transform:none}}
.kicker{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--ink);display:inline-block;padding-bottom:2px;margin-bottom:8px}
.headline{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(26px,6.5vw,44px);line-height:1.0;letter-spacing:-.01em;color:var(--ink);margin-bottom:10px}
.deck{font-size:12px;font-style:italic;color:var(--dim);line-height:1.5;border-left:2px solid var(--gold);padding-left:10px;margin-bottom:14px}
.pull{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(14px,3.5vw,18px);line-height:1.4;color:var(--dim);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:10px 0;margin:12px 0}
.pull strong{font-style:normal;color:var(--gold)}
.stat-cols{display:grid;gap:0}
.stat-cols-2{grid-template-columns:1fr 1fr}
.stat-cols-3{grid-template-columns:1fr 1fr 1fr}
.stat-cols-4{grid-template-columns:repeat(4,1fr)}
.stat-cell{padding:10px 0;border-right:1px solid var(--rule);padding-right:14px;padding-left:2px}
.stat-cell:last-child{border-right:none;padding-right:0}
.stat-cell+.stat-cell{padding-left:14px}
.sc-label{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:3px}
.sc-num{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(22px,5vw,32px);letter-spacing:-.03em;line-height:1;color:var(--ink)}
.sc-num.gold{color:var(--gold)}.sc-num.navy{color:var(--navy)}.sc-num.forest{color:var(--forest)}.sc-num.red{color:var(--red)}.sc-num.plum{color:var(--plum)}
.sc-delta{font-size:9px;margin-top:3px}.up{color:var(--forest)}.dn{color:var(--red)}
.chart-wrap{flex:1;min-height:0;position:relative;margin:0 -20px;padding:0 20px}
.ch{width:100%;height:100%;display:block;overflow:visible}
.rule-bold{height:2px;background:var(--ink);margin:10px 0}
.rule-thin{height:1px;background:var(--rule);margin:10px 0}
.data-table{width:100%;border-collapse:collapse;font-family:'JetBrains Mono',monospace}
.data-table th{font-size:7px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);padding:4px 0;text-align:right;font-weight:400;border-bottom:1px solid var(--rule)}
.data-table th:first-child{text-align:left}
.data-table td{font-size:11px;padding:6px 0;text-align:right;color:var(--dim);border-bottom:1px solid var(--paper2)}
.data-table td:first-child{text-align:left;color:var(--ink)}
.data-table td.hi{color:var(--ink);font-weight:600}.data-table td.up{color:var(--forest)}.data-table td.dn{color:var(--red)}.data-table td.gld{color:var(--gold);font-weight:600}
.macro{margin-bottom:7px}
.macro-lbl{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);font-family:'JetBrains Mono',monospace;margin-bottom:3px}
.macro-track{height:5px;background:var(--paper2);border-radius:1px}
.macro-fill{height:100%;border-radius:1px}
.sec-nav{position:fixed;right:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px;z-index:200}
.sn-dot{width:5px;height:5px;border-radius:50%;background:var(--rule);transition:all .3s;pointer-events:none}
.sn-dot.active{background:var(--ink);transform:scale(2.2);box-shadow:0 0 0 4px rgba(13,11,8,.08)}
.prog-head{font-size:8px;letter-spacing:.2em;text-transform:uppercase;color:var(--dim);margin-bottom:9px}
.prog-row{display:flex;align-items:center;gap:9px;margin-bottom:8px}
.prog-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.prog-label{font-size:8px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);width:68px;flex-shrink:0}
.prog-track{flex:1;height:7px;background:var(--paper2);border-radius:1px;overflow:hidden}
.prog-fill{height:100%;border-radius:1px}
.prog-val{font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--dim);width:80px;text-align:right;flex-shrink:0;white-space:nowrap}
.prog-sub{opacity:.45}
.body-view svg{display:block}
.ol-hdr{position:sticky;top:0;background:var(--paper);border-bottom:3px solid var(--ink);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;z-index:10}
.ol-btn{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:6px 14px;cursor:pointer;border:none}
.ol-btn-ghost{background:none;border:1px solid var(--rule)!important;color:var(--dim)}
.ol-btn-solid{background:var(--ink);color:var(--paper)}
.set-input{width:52px;text-align:right;background:none;border:none;border-bottom:1px solid var(--rule);font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;padding:2px 0}
.ex-input{flex:1;background:none;border:none;border-bottom:2px solid var(--ink);font-family:'Times New Roman',serif;font-style:italic;font-size:15px;color:var(--ink);outline:none;padding:4px 0}
.action-row{display:flex;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--rule)}
.action-btn{flex:1;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;cursor:pointer;text-align:center;border:1px solid var(--ink);background:none;color:var(--ink)}
.action-btn.primary{background:var(--ink);color:var(--paper)}
.auth-wrap{min-height:100svh;background:var(--paper);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 20px}
.auth-rule{width:100%;max-width:380px;height:3px;background:var(--ink);margin-bottom:24px}
.auth-logo{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(40px,10vw,60px);letter-spacing:-.02em;color:var(--ink);margin-bottom:4px}
.auth-tag{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-bottom:32px}
.auth-form{width:100%;max-width:380px;display:flex;flex-direction:column;gap:14px}
.auth-field{display:flex;flex-direction:column;gap:5px}
.auth-lbl{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.auth-input{font-family:'JetBrains Mono',monospace;font-size:13px;background:none;border:none;border-bottom:2px solid var(--ink);padding:6px 0;outline:none;color:var(--ink);width:100%}
.auth-input::placeholder{color:var(--rule)}
.auth-submit{margin-top:6px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;padding:12px;background:var(--ink);color:var(--paper);border:none;cursor:pointer;width:100%}
.auth-submit:disabled{opacity:.45;cursor:default}
.auth-toggle{font-size:10px;color:var(--dim);text-align:center;margin-top:10px;font-style:italic}
.auth-toggle span{color:var(--gold);cursor:pointer;text-decoration:underline}
.auth-err{font-size:10px;color:var(--red);font-family:'JetBrains Mono',monospace;text-align:center;border:1px solid var(--red);padding:8px}
.auth-rule-bottom{width:100%;max-width:380px;height:1px;background:var(--rule);margin-top:24px}
.tab-bar{display:flex;border-bottom:2px solid var(--ink);margin-bottom:12px;gap:0}
.tab-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;padding:7px 16px;cursor:pointer;background:none;border:none;color:var(--dim);border-bottom:2px solid transparent;margin-bottom:-2px;min-height:44px;display:flex;align-items:center}
.tab-btn.active{color:var(--ink);border-bottom-color:var(--ink)}
.muscle-scroll{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
.muscle-scroll::-webkit-scrollbar{width:3px}.muscle-scroll::-webkit-scrollbar-track{background:var(--paper2)}.muscle-scroll::-webkit-scrollbar-thumb{background:var(--rule)}
.muscle-row{display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--paper2)}
.muscle-name{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);width:80px;flex-shrink:0;text-transform:capitalize}
.muscle-bar-track{flex:1;height:6px;background:var(--paper2);border-radius:1px;overflow:hidden}
.muscle-bar-fill{height:100%;border-radius:1px;transition:width .4s ease}
.muscle-pct{font-family:'JetBrains Mono',monospace;font-size:9px;width:30px;text-align:right;color:var(--dim);flex-shrink:0}
.soreness-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:4px 0}
.soreness-btn{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:capitalize;padding:7px 4px;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--dim);position:relative;text-align:center}
.soreness-btn.has-log{border-color:var(--navy);color:var(--navy)}
.soreness-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--navy)}
.soreness-slider-wrap{background:var(--paper2);border:1px solid var(--rule);padding:10px 12px;margin-top:8px}
.prof-field{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}
.prof-lbl{font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.prof-val{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink)}
.prof-input{font-family:'JetBrains Mono',monospace;font-size:12px;background:none;border:none;border-bottom:1px solid var(--ink);outline:none;color:var(--ink);width:120px;text-align:right}
.prof-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--dim)}
.prof-btn.solid{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.onboard-overlay{position:fixed;inset:0;z-index:9999;background:var(--paper);overflow-y:auto}
.ob-progress{position:sticky;top:0;left:0;right:0;height:2px;background:var(--rule);z-index:10}
.ob-progress-fill{height:100%;background:var(--gold);transition:width .4s ease}
.ob-wrap{max-width:480px;margin:0 auto;padding:32px 20px 60px}
.ob-step-ind{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:28px}
.ob-logo{font-family:'Playfair Display',Georgia,serif;font-weight:900;font-size:clamp(48px,12vw,72px);letter-spacing:-.02em;color:var(--gold);line-height:.9;margin-bottom:10px}
.ob-sub{font-size:14px;color:var(--ink);line-height:1.6;margin-bottom:8px;font-family:'Times New Roman',serif}
.ob-lede{font-size:12px;color:var(--dim);font-style:italic;margin-bottom:32px;line-height:1.6}
.ob-h{font-family:'Playfair Display',serif;font-weight:900;font-size:26px;color:var(--ink);margin-bottom:6px;line-height:1.05}
.ob-deck{font-size:12px;color:var(--dim);font-style:italic;margin-bottom:24px;line-height:1.5}
.ob-label{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);display:block;margin-bottom:4px;margin-top:16px}
.ob-input{width:100%;border:none;border-bottom:2px solid var(--ink);padding:8px 0;background:transparent;font-family:'Times New Roman',serif;font-size:16px;outline:none;color:var(--ink);margin-bottom:4px}
.ob-input::placeholder{color:var(--rule)}
.ob-unit-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:4px}
.ob-unit-row .ob-input{flex:1;margin-bottom:0}
.ob-unit-toggle{display:flex;border:1px solid var(--rule);overflow:hidden;flex-shrink:0;height:36px}
.ob-unit-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:0 10px;border:none;background:none;cursor:pointer;color:var(--dim)}
.ob-unit-btn.active{background:var(--ink);color:var(--paper)}
.ob-goal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}
.ob-goal-card{padding:14px 12px;border:1px solid var(--rule);cursor:pointer;text-align:left;background:none;transition:all .15s}
.ob-goal-card.selected{background:var(--ink);border-color:var(--ink)}
.ob-goal-card-title{font-family:'Playfair Display',serif;font-size:15px;font-weight:700;color:var(--ink);margin-bottom:4px}
.ob-goal-card.selected .ob-goal-card-title{color:var(--paper)}
.ob-goal-card-desc{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.08em;color:var(--dim)}
.ob-goal-card.selected .ob-goal-card-desc{color:rgba(255,255,255,.6)}
.ob-stepper{display:flex;align-items:center;gap:14px}
.ob-stepper-btn{width:30px;height:30px;border:1px solid var(--rule);background:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:16px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.ob-stepper-val{font-family:'Syne',sans-serif;font-weight:800;font-size:26px;color:var(--ink);min-width:32px;text-align:center}
.ob-service-row{padding:16px 0;border-bottom:1px solid var(--rule);display:flex;flex-direction:column;gap:8px}
.ob-svc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ob-svc-title{font-family:'Playfair Display',serif;font-weight:700;font-size:16px;color:var(--ink)}
.ob-svc-desc{font-size:11px;color:var(--dim);font-style:italic;margin-top:2px;line-height:1.5}
.ob-svc-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:7px 14px;border:1px solid var(--ink);background:none;color:var(--ink);cursor:pointer;white-space:nowrap;flex-shrink:0}
.ob-svc-btn.done{background:var(--forest);border-color:var(--forest);color:var(--paper)}
.ob-guide{background:var(--paper2);border-left:2px solid var(--gold);padding:12px 14px;margin-top:8px;font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim);line-height:2}
.ob-guide strong{color:var(--ink)}
.ob-copy-url{display:flex;align-items:center;gap:8px;margin:4px 0 8px;background:var(--paper);border:1px solid var(--rule);padding:7px 10px;cursor:pointer}
.ob-copy-url span{flex:1;font-size:9px;letter-spacing:.04em;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ob-copy-url button{font-family:'JetBrains Mono',monospace;font-size:7px;letter-spacing:.14em;text-transform:uppercase;border:none;background:none;cursor:pointer;color:var(--gold);flex-shrink:0}
.ob-hevy-modes{display:flex;gap:8px;margin-top:8px}
.ob-nav{display:flex;align-items:center;justify-content:space-between;margin-top:32px;padding-top:16px;border-top:1px solid var(--rule)}
.ob-back{background:none;border:none;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);cursor:pointer;padding:0}
.ob-next{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;padding:11px 28px;background:var(--ink);color:var(--paper);border:none;cursor:pointer}
.ob-next:disabled{opacity:.45;cursor:default}
.ob-summary-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--rule)}
.ob-summary-check{width:16px;height:16px;border-radius:50%;background:var(--forest);flex-shrink:0}
.ob-summary-check.empty{background:var(--rule)}
.ob-summary-lbl{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink);letter-spacing:.06em}
.pr-search{font-family:'JetBrains Mono',monospace;font-size:11px;background:none;border:none;border-bottom:1px solid var(--ink);outline:none;color:var(--ink);width:100%;padding:6px 0;margin-bottom:10px}
.pr-search::placeholder{color:var(--rule)}
.nutri-log-form{display:flex;flex-direction:column;gap:8px;padding:10px 0;border-top:1px solid var(--rule)}
.nutri-log-row{display:flex;gap:6px;align-items:center}
.nutri-input{font-family:'JetBrains Mono',monospace;font-size:11px;background:none;border:none;border-bottom:1px solid var(--rule);outline:none;color:var(--ink);padding:3px 0}
.nutri-input.wide{flex:1}.nutri-input.narrow{width:52px;text-align:right}
.nutri-photo-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:6px 12px;cursor:pointer;border:1px solid var(--rule);background:none;color:var(--dim)}
.nutri-submit-btn{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:6px 12px;cursor:pointer;background:var(--ink);color:var(--paper);border:none}
.chat-bubble{position:fixed;bottom:24px;right:20px;z-index:500;width:44px;height:44px;border-radius:50%;background:var(--ink);color:var(--paper);border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;box-shadow:0 2px 12px rgba(0,0,0,.18)}
.chat-panel{position:fixed;right:0;top:0;bottom:0;width:min(380px,100vw);background:var(--paper);border-left:3px solid var(--ink);z-index:600;display:flex;flex-direction:column}
.chat-hdr{padding:14px 16px;border-bottom:2px solid var(--ink);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.chat-msgs{flex:1;overflow-y:auto;padding:14px 14px 8px;display:flex;flex-direction:column;gap:10px}
.chat-msg-user{align-self:flex-end;background:var(--ink);color:var(--paper);padding:8px 12px;max-width:82%;font-size:13px;line-height:1.5}
.chat-msg-asst{align-self:flex-start;background:var(--paper2);border:1px solid var(--rule);padding:8px 12px;max-width:82%;font-size:13px;line-height:1.5;color:var(--ink)}
.chat-msg-thinking{align-self:flex-start;font-size:11px;color:var(--dim);font-style:italic;font-family:'JetBrains Mono',monospace}
.chat-input-row{display:flex;border-top:2px solid var(--ink);flex-shrink:0}
.chat-input{flex:1;border:none;padding:12px 14px;font-family:'JetBrains Mono',monospace;font-size:13px;outline:none;background:var(--paper);color:var(--ink)}
.chat-send{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:0 16px;background:var(--ink);color:var(--paper);border:none;cursor:pointer;flex-shrink:0}
.hist-overlay{position:fixed;inset:0;z-index:1000;background:var(--paper);overflow-y:auto;display:flex;flex-direction:column}
.hist-row{padding:12px 0;border-bottom:1px solid var(--rule);cursor:pointer}
.hist-row-hdr{display:flex;align-items:baseline;gap:12px}
.hist-date{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--dim)}
.hist-name{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:var(--ink);text-transform:capitalize}
.hist-detail{margin-top:6px;padding-left:12px}
.hist-ex{font-size:11px;color:var(--dim);font-family:'JetBrains Mono',monospace;margin-bottom:2px}
.streak-row{display:flex;gap:0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);margin:10px 0}
.streak-cell{flex:1;padding:8px 0;text-align:center;border-right:1px solid var(--rule)}
.streak-cell:last-child{border-right:none}
.streak-num{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;line-height:1}
.streak-lbl{font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-top:2px}
.sleep-debt-bar{padding:10px 0 6px;border-left:3px solid var(--ember);padding-left:10px;margin:10px 0}
.notif-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--rule)}
.scan-preview{width:72px;height:72px;object-fit:cover;border:1px solid var(--rule);flex-shrink:0}
.scan-preview.analysing{animation:pulse-opacity 1.4s ease-in-out infinite}
@keyframes pulse-opacity{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes pulse-bar{0%,100%{opacity:.4}50%{opacity:1}}
.scan-mode-toggle{display:flex;border:1px solid var(--rule);overflow:hidden;margin-bottom:10px}
.scan-mode-btn{flex:1;font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.12em;text-transform:uppercase;padding:6px;border:none;background:none;cursor:pointer;color:var(--dim)}
.scan-mode-btn.active{background:var(--ink);color:var(--paper)}
.cam-overlay{position:fixed;inset:0;z-index:2000;background:#000;display:flex;flex-direction:column}
.cam-video{flex:1;width:100%;object-fit:cover}
.cam-frame{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:240px;height:160px;border:2px solid var(--gold);box-shadow:0 0 0 9999px rgba(0,0,0,.55)}
.cam-frame::before,.cam-frame::after{content:'';position:absolute;width:20px;height:20px;border-color:var(--gold);border-style:solid}
.cam-frame::before{top:-2px;left:-2px;border-width:3px 0 0 3px}
.cam-frame::after{bottom:-2px;right:-2px;border-width:0 3px 3px 0}
.cam-lbl{position:absolute;bottom:100px;left:0;right:0;text-align:center;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.cam-close{position:absolute;top:20px;right:20px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.3);color:#fff;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;padding:8px 14px;cursor:pointer}
.portion-row{display:flex;align-items:center;gap:10px;margin:6px 0}
.portion-btn{width:24px;height:24px;border:1px solid var(--rule);background:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:14px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.briefing-overlay{position:fixed;inset:0;z-index:1100;background:var(--paper);display:flex;flex-direction:column;overflow-y:auto}
.briefing-hdr{background:var(--ink);color:var(--paper);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;position:sticky;top:0;z-index:1}
.briefing-masthead{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;letter-spacing:.04em}
.briefing-edition{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:rgba(245,240,226,.5)}
.briefing-body{padding:24px 20px 48px;max-width:1000px;width:100%;margin:0 auto}
.briefing-headline{font-family:'Playfair Display',serif;font-size:clamp(28px,5vw,40px);font-weight:900;color:var(--gold);line-height:1.05;text-transform:uppercase;margin-bottom:8px;break-inside:avoid}
.briefing-sub{font-family:'Times New Roman',serif;font-size:15px;font-style:italic;color:var(--ink);line-height:1.5;margin-bottom:0;break-inside:avoid}
.briefing-top{margin-bottom:16px}
.briefing-rule{border:none;border-top:1px solid var(--rule);margin:16px 0}
.briefing-columns{column-width:420px;column-gap:36px;column-rule:1px solid var(--rule)}
.briefing-section{break-inside:avoid;-webkit-column-break-inside:avoid;margin-bottom:20px}
.briefing-kicker{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
.briefing-bullets{display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-bottom:8px}
.briefing-win{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--forest);line-height:1.6}
.briefing-miss{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ember);line-height:1.6}
.briefing-stat-grid{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:0;margin-top:10px}
.briefing-stat{border-right:1px solid var(--rule);padding:0 12px 0 0}
.briefing-stat:first-child{padding-left:0}
.briefing-stat+.briefing-stat{padding-left:12px}
.briefing-stat:last-child{border-right:none}
.briefing-stat-val{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(18px,3.5vw,24px);letter-spacing:-.02em;color:var(--ink);line-height:1}
.briefing-stat-lbl{font-family:'JetBrains Mono',monospace;font-size:7px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-top:4px}
.briefing-pull{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(16px,3vw,20px);line-height:1.4;color:var(--dim);border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);padding:14px 0;margin:20px 0}
.briefing-byline{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim);border-top:2px solid var(--ink);padding-top:8px;margin-top:0;margin-bottom:2px}
.briefing-byline-role{font-family:'JetBrains Mono',monospace;font-size:7px;color:var(--dim);margin-bottom:8px}
.briefing-prose{font-family:'Times New Roman',serif;font-size:14px;line-height:1.85;color:var(--ink)}
.briefing-open-btn{display:block;width:100%;background:var(--ink);color:var(--paper);border:none;padding:14px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;margin-top:28px;break-inside:avoid}
.briefing-preview{border-bottom:1px solid var(--rule);padding:10px 0;cursor:pointer}
.deload-banner{background:var(--ember);padding:10px 12px;margin:8px 0;border-left:3px solid var(--ink)}
.week-strip{display:flex;gap:3px;overflow-x:auto;padding:8px 0;border-top:1px solid var(--rule);margin-top:8px;scrollbar-width:none}
.week-strip::-webkit-scrollbar{display:none}
.week-day{flex:1 0 0;min-width:34px;min-height:44px;padding:6px 3px 5px;border:1px solid var(--rule);text-align:center;cursor:default;position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center}
.week-day.today{border:2px solid var(--ink)}
.week-day.has-session{background:var(--ink)}
.week-day.clickable{cursor:pointer}
.week-day-label{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.08em;color:var(--dim);margin-bottom:3px;text-transform:uppercase}
.week-day.today .week-day-label{color:var(--ink);font-weight:700}
.week-day.has-session .week-day-label{color:rgba(245,240,226,.7)}
.week-day-dot{width:5px;height:5px;background:var(--gold);border-radius:50%;margin:0 auto}
.week-day-type{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.06em;color:var(--gold);line-height:1.3;margin-top:2px}
.week-day-type.past{color:var(--rule)}
.niggle-list{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.niggle-card{padding:10px 12px;border-left:3px solid var(--ember)}
.niggle-area{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;color:var(--ink);text-transform:capitalize}
.niggle-meta{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);margin-top:2px}
.niggle-note{font-family:Times New Roman,serif;font-size:12px;color:var(--ink);margin-top:4px;font-style:italic;line-height:1.5}
.niggle-resolve{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;background:none;border:1px solid var(--rule);color:var(--dim);padding:3px 8px;cursor:pointer;margin-top:6px}
.niggle-form{margin-top:16px;padding-top:12px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:8px}
.niggle-input{width:100%;border:none;border-bottom:2px solid var(--ink);padding:6px 0;background:transparent;font-family:Times New Roman,serif;font-size:14px;color:var(--ink);outline:none}
.niggle-sev{display:flex;gap:6px}
.niggle-sev-btn{flex:1;font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:5px;border:1px solid var(--rule);background:none;cursor:pointer;color:var(--dim)}
.niggle-sev-btn.active{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.travel-banner{margin:0 0 14px;padding:8px 12px;background:var(--navy);color:var(--paper);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between}
.experiment-card{padding:10px 12px;border-left:3px solid var(--gold);margin-bottom:10px}
.experiment-h{font-family:'Playfair Display',serif;font-size:13px;font-weight:700;color:var(--ink);margin-bottom:3px}
.experiment-meta{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);margin-bottom:4px}
.experiment-outcome{font-family:Times New Roman,serif;font-size:12px;font-style:italic;color:var(--forest);margin-top:4px}
.experiment-form{margin-top:12px;padding-top:12px;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:8px}
.experiment-input{width:100%;border:none;border-bottom:2px solid var(--ink);padding:6px 0;background:transparent;font-family:Times New Roman,serif;font-size:14px;color:var(--ink);outline:none}
.supp-item{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--rule)}
.supp-check{width:18px;height:18px;border:2px solid var(--ink);background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px}
.supp-check.done{background:var(--ink);color:var(--paper)}
.supp-name{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink);flex:1;margin:0 10px}
.supp-meta{font-family:'JetBrains Mono',monospace;font-size:8px;color:var(--dim)}
.measure-row{display:flex;align-items:baseline;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--rule)}
.measure-lbl{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);letter-spacing:.06em;text-transform:uppercase;width:80px;flex-shrink:0}
.measure-val{font-family:'Playfair Display',serif;font-size:16px;font-weight:700;color:var(--ink)}
.measure-delta{font-family:'JetBrains Mono',monospace;font-size:8px;margin-left:6px}
.alcohol-row{display:flex;align-items:center;gap:8px;padding:10px 0}
.pr-group-hdr{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);padding:8px 0 4px;border-top:1px solid var(--rule);margin-top:4px}
.pr-group-hdr:first-child{border-top:none;margin-top:0}
.settings-overlay{position:fixed;inset:0;z-index:1200;background:var(--paper);display:flex;flex-direction:column;overflow:hidden}
.settings-hdr{background:var(--ink);color:var(--paper);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;position:sticky;top:0;z-index:1}
.settings-hdr-title{font-family:'Playfair Display',serif;font-size:18px;font-weight:900;letter-spacing:-.01em}
.settings-close{background:none;border:none;color:rgba(245,240,226,.7);cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:0}
.settings-body{flex:1;overflow-y:auto;padding:0 20px 80px;-webkit-overflow-scrolling:touch}
.settings-sec{padding:20px 0 4px;border-top:2px solid var(--ink);margin-top:8px}
.settings-sec:first-child{border-top:none;margin-top:0;padding-top:20px}
.settings-sh{font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--dim);margin-bottom:14px}
.settings-open-btn{width:100%;background:none;border:1px solid var(--ink);color:var(--ink);font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.14em;text-transform:uppercase;padding:11px 14px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-top:12px;box-sizing:border-box}
.echelon-card{width:100%;padding:12px 14px;border:1px solid var(--rule);cursor:pointer;text-align:left;background:none;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px;box-sizing:border-box}
.echelon-card.selected{border-color:var(--ink);background:rgba(0,0,0,.04)}
.echelon-card-dot{width:8px;height:8px;border-radius:50%;border:2px solid var(--rule);flex-shrink:0;margin-top:5px;transition:all .15s}
.echelon-card.selected .echelon-card-dot{border-color:var(--ink);background:var(--ink)}
.echelon-card-title{font-family:'Playfair Display',serif;font-size:14px;font-weight:700;color:var(--ink);margin-bottom:3px}
.echelon-card-desc{font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--dim);line-height:1.6}
@media(max-width:480px){
:root{--hdr:138px}
.masthead{grid-template-columns:1fr;row-gap:6px;text-align:center;padding:10px 14px 8px}
.mast-left{order:2}
.mast-title{order:1}
.mast-right{order:3}
.mast-right-stack{align-items:center}
.mast-right-row{justify-content:center}
.week-day{min-width:44px}
}
`;

