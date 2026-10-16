const STOCKS=[
{name:"Reliance Industries",symbol:"RELIANCE",sector:"Energy",price:1462.50,change:1.24,high:1478.00,low:1439.20},
{name:"HDFC Bank",symbol:"HDFCBANK",sector:"Banking",price:1748.30,change:.72,high:1761.40,low:1729.80},
{name:"ICICI Bank",symbol:"ICICIBANK",sector:"Banking",price:1284.75,change:.48,high:1295.00,low:1270.10},
{name:"Tata Consultancy Services",symbol:"TCS",sector:"IT",price:3892.10,change:-.35,high:3925.00,low:3860.50},
{name:"Infosys",symbol:"INFY",sector:"IT",price:1543.80,change:.91,high:1558.60,low:1520.00},
{name:"Bharti Airtel",symbol:"BHARTIARTL",sector:"Telecom",price:1845.25,change:1.12,high:1862.00,low:1810.20},
{name:"Tata Motors",symbol:"TATAMOTORS",sector:"Auto",price:684.60,change:-.64,high:699.00,low:677.20},
{name:"Mahindra & Mahindra",symbol:"M&M",sector:"Auto",price:2936.40,change:.82,high:2960.00,low:2892.00},
{name:"ITC",symbol:"ITC",sector:"FMCG",price:412.75,change:.26,high:416.90,low:409.10},
{name:"Hindustan Unilever",symbol:"HINDUNILVR",sector:"FMCG",price:2378.90,change:-.18,high:2398.00,low:2362.30},
{name:"State Bank of India",symbol:"SBIN",sector:"Banking",price:812.60,change:1.05,high:821.40,low:801.00},
{name:"NTPC",symbol:"NTPC",sector:"Energy",price:342.15,change:.37,high:346.00,low:338.20}
];
const $=id=>document.getElementById(id);
const safeRead=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let watchlist=safeRead("thirut_trader_watchlist",["RELIANCE","HDFCBANK","INFY"]);
let journal=safeRead("thirut_trader_journal",[]);
let selected=STOCKS[0], chart=null;
const money=n=>"₹"+Number(n).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=n=>(n>=0?"+":"")+n.toFixed(2)+"%";
function backendBaseUrl(){
  return (safeRead("thirut_trader_backend_url","")||"").trim().replace(/\/$/,"");
}
function validBackendUrl(value){
  try{
    const url=new URL(value);
    return url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1"].includes(url.hostname));
  }catch{return false}
}
function setKiteMessage(message,tone="neutral"){
  const el=$("kite-connection-message");if(!el)return;
  el.textContent=message;el.className="connection-message connection-"+tone;
}
async function checkKiteStatus(){
  const base=backendBaseUrl();
  if(!base){setKiteMessage("Enter your separately hosted Flask backend URL first.");$("kite-status-badge").textContent="NOT CONFIGURED";return null}
  if(!validBackendUrl(base)){setKiteMessage("Use an HTTPS backend URL. HTTP is allowed only for localhost development.","warning");$("kite-status-badge").textContent="INVALID URL";return null}
  setKiteMessage("Checking backend…");
  try{
    const response=await fetch(base+"/api/health",{credentials:"include"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||"Backend health check failed.");
    const configured=Boolean(data.kite_configured),authenticated=Boolean(data.authenticated);
    $("kite-status-badge").textContent=authenticated?"KITE CONNECTED":configured?"READY TO CONNECT":"API NOT CONFIGURED";
    setKiteMessage(authenticated?"Kite session is connected. You can request quotes if your account and API plan permit it.":configured?"Backend is reachable. Connect Kite to authorize this session.":"Backend is reachable, but Kite API credentials are not configured on the server.",authenticated?"success":configured?"neutral":"warning");
    return data;
  }catch(error){
    $("kite-status-badge").textContent="BACKEND OFFLINE";
    setKiteMessage("Could not reach backend. Check its URL, HTTPS, CORS and deployment settings. "+error.message,"warning");
    return null;
  }
}
async function connectKite(){
  const base=backendBaseUrl();
  if(!base){setKiteMessage("Enter and save your backend URL, then check the connection.","warning");return}
  const status=await checkKiteStatus();
  if(!status)return;
  if(!status.kite_configured){setKiteMessage("Kite API credentials are not configured on your backend yet. Do not enter secrets on this website.","warning");return}
  window.location.href=base+"/auth/login";
}
async function refreshSelectedQuote(){
  const base=backendBaseUrl();
  if(!base){setKiteMessage("Configure your backend URL first.","warning");return}
  if(!validBackendUrl(base)){setKiteMessage("Use an HTTPS backend URL. HTTP is allowed only for localhost development.","warning");return}
  setKiteMessage("Requesting a quote for "+selected.symbol+"…");
  try{
    const response=await fetch(base+"/api/quote?i="+encodeURIComponent("NSE:"+selected.symbol),{credentials:"include"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||data.error||"Quote request failed. Connect Kite first.");
    const quote=data["NSE:"+selected.symbol];
    if(!quote||!Number.isFinite(Number(quote.last_price)))throw new Error("No quote returned for this symbol. Check the NSE symbol and Kite access.");
    selected.price=Number(quote.last_price);
    const previousClose=Number(quote.ohlc?.close);
    if(Number.isFinite(previousClose)&&previousClose>0)selected.change=((selected.price-previousClose)/previousClose)*100;
    else if(Number.isFinite(Number(quote.net_change)))selected.change=Number(quote.net_change)/Math.max(.01,selected.price-Number(quote.net_change))*100;
    if(quote.ohlc){if(Number.isFinite(Number(quote.ohlc.high)))selected.high=Number(quote.ohlc.high);if(Number.isFinite(Number(quote.ohlc.low)))selected.low=Number(quote.ohlc.low)}
    $("selected-price").textContent=money(selected.price);$("selected-change").textContent=pct(selected.change);
    $("selected-change").className=selected.change>=0?"positive":"negative";
    $("selected-high").textContent=money(selected.high);$("selected-low").textContent=money(selected.low);
    $("selected-symbol").textContent=selected.symbol+" · NSE · KITE QUOTE SNAPSHOT";
    $("market-data-label").textContent="SELECTED QUOTE: KITE SNAPSHOT";
    $("market-data-notice").innerHTML='<span class="notice-icon">i</span><div><strong>One quote snapshot received.</strong> Only the selected stock quote was refreshed. Other stock rows, index cards, chart candles and technical-analysis candles remain sample data.</div>';
    $("table-data-note").textContent="Selected quote snapshot; other rows sample";
    resetAnalysisPanel();
    renderStocks();renderWatchlist();
    $("kite-status-badge").textContent="LIVE QUOTE RECEIVED";
    setKiteMessage("Quote snapshot received for NSE:"+selected.symbol+(quote.timestamp?" · last traded "+quote.timestamp:"")+". It does not stream or auto-refresh. Chart and technical signals still use sample candles.","success");
  }catch(error){setKiteMessage(error.message+" Sample values have not been replaced.","warning")}
}
function persist(){try{localStorage.setItem("thirut_trader_watchlist",JSON.stringify(watchlist));localStorage.setItem("thirut_trader_journal",JSON.stringify(journal))}catch{}}
function renderStocks(){const q=$("stock-search").value.trim().toLowerCase(),sector=$("sector-filter").value;const filtered=STOCKS.filter(s=>(sector==="All"||s.sector===sector)&&[s.name,s.symbol,s.sector].some(x=>x.toLowerCase().includes(q)));$("stock-rows").innerHTML=filtered.map(s=>`<tr data-symbol="${s.symbol}" class="${s.symbol===selected.symbol?"selected":""} tabindex="0"><td><span class="stock-name">${s.name}</span><span class="stock-symbol">${s.symbol} · NSE</span></td><td class="price-cell">${money(s.price)}</td><td><span class="change-pill ${s.change>=0?"positive":"negative"}">${s.change>=0?"▲":"▼"} ${pct(s.change)}</span></td><td><button class="star-button ${watchlist.includes(s.symbol)?"saved":""}" data-star="${s.symbol}" aria-label="Toggle ${s.symbol} watchlist">${watchlist.includes(s.symbol)?"★":"☆"}</button></td></tr>`).join("")||'<tr><td colspan="4">No matching stocks.</td></tr>';$("results-label").textContent=filtered.length+" sample stocks";$("watch-count").innerHTML=watchlist.length+' <small>stocks</small>'}
function makeChart(s){const ctx=$("price-chart");if(!window.Chart){ctx.parentElement.innerHTML='<div class="empty-state">Chart library unavailable. Reload when online.</div>';return}let seed=s.symbol.split("").reduce((a,c)=>a+c.charCodeAt(0),0);let val=s.price*(1-s.change/100);const points=Array.from({length:32},(_,i)=>{seed=(seed*9301+49297)%233280;val+=(seed/233280-.47)*s.price*.003;return Number(val.toFixed(2))});points[points.length-1]=s.price;if(chart)chart.destroy();chart=new Chart(ctx,{type:"line",data:{labels:points.map((_,i)=>i%4===0?["09:30","10:30","11:30","12:30","13:30","14:30","15:20"][Math.min(6,Math.floor(i/5))]:""),datasets:[{data:points,borderColor:"#8ca5ff",backgroundColor:"rgba(124,151,255,.12)",fill:true,tension:.32,pointRadius:0,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:"#10182a",borderColor:"#34415c",borderWidth:1,displayColors:false,callbacks:{label:c=>money(c.raw)}}},scales:{x:{grid:{display:false},ticks:{color:"#7886a1",font:{size:9},maxRotation:0,autoSkip:false}},y:{position:"right",grid:{color:"rgba(116,135,171,.12)"},ticks:{color:"#7886a1",font:{size:9},maxTicksLimit:5,callback:v=>"₹"+Number(v).toLocaleString("en-IN")}}}}})}
function selectStock(symbol){const s=STOCKS.find(x=>x.symbol===symbol);if(!s)return;selected=s;const analysisSymbol=$("analysis-symbol");if(analysisSymbol)analysisSymbol.textContent=s.symbol;resetAnalysisPanel();$("selected-name").textContent=s.name;$("selected-symbol").textContent=s.symbol+" · NSE";$("selected-price").textContent=money(s.price);$("selected-change").textContent=pct(s.change);$("selected-change").className=s.change>=0?"positive":"negative";$("selected-sector").textContent=s.sector;$("selected-high").textContent=money(s.high);$("selected-low").textContent=money(s.low);$("add-watch").textContent=watchlist.includes(s.symbol)?"★":"☆";$("add-watch").classList.toggle("saved",watchlist.includes(s.symbol));renderStocks();makeChart(s)}
function sampleHistory(stock){
  // Deterministic synthetic close/volume series for UI testing only. Not historical market data.
  let seed=stock.symbol.split("").reduce((a,c)=>a+c.charCodeAt(0),17);
  let close=stock.price*(1-stock.change/100),rows=[];
  for(let i=0;i<120;i++){
    seed=(seed*9301+49297)%233280;
    const noise=(seed/233280-.5)*stock.price*.014;
    const drift=stock.change*.00008*stock.price;
    close=Math.max(stock.price*.55,close+noise+drift);
    seed=(seed*9301+49297)%233280;
    const volume=500000+Math.floor((seed/233280)*1800000);
    const range=stock.price*(.002+(seed/233280)*.008);
    rows.push({open:close-noise*.35,high:close+range,low:Math.max(.01,close-range),close,volume});
  }
  // Keep the final synthetic OHLC candle internally consistent after anchoring its close.
  const last=rows[rows.length-1];
  last.close=stock.price;
  last.high=Math.max(last.high,last.open,last.close);
  last.low=Math.max(.01,Math.min(last.low,last.open,last.close));
  return rows;
}
function ema(values,period){
  if(!values.length)return [];
  const k=2/(period+1),out=Array(values.length).fill(null);
  if(values.length<period){let value=values[0];out[0]=value;for(let i=1;i<values.length;i++){value=values[i]*k+value*(1-k);out[i]=value}return out}
  let value=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  out[period-1]=value;
  for(let i=period;i<values.length;i++){value=values[i]*k+value*(1-k);out[i]=value}
  return out;
}
function rsi(values,period=14){
  if(values.length<=period)return 50;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>0)gains+=d;else losses-=d}
  let avgGain=gains/period,avgLoss=losses/period;
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1],gain=Math.max(0,d),loss=Math.max(0,-d);
    avgGain=((avgGain*(period-1))+gain)/period;
    avgLoss=((avgLoss*(period-1))+loss)/period;
  }
  if(avgLoss===0)return avgGain===0?50:100;
  if(avgGain===0)return 0;
  return 100-(100/(1+avgGain/avgLoss));
}
function calculateSignal(stock){
  const rows=sampleHistory(stock),closes=rows.map(x=>x.close),volumes=rows.map(x=>x.volume);
  const e20=ema(closes,20).at(-1),e50=ema(closes,50).at(-1);
  const e12=ema(closes,12),e26=ema(closes,26);
  const macdLine=closes.map((_,i)=>e12[i]===null||e26[i]===null?null:e12[i]-e26[i]);
  const validMacd=macdLine.filter(x=>x!==null),signalLine=ema(validMacd,9);
  const macd=validMacd.at(-1),macdSignal=signalLine.at(-1),macdPrevious=validMacd.at(-2),signalPrevious=signalLine.at(-2);
  const r=rsi(closes),recentVolume=volumes.at(-1),avgVolume=volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
  const volumeUp=recentVolume>avgVolume,trendUp=e20>e50,trendDown=e20<e50;
  const lastClose=closes.at(-1),priorClose=closes.at(-2);
  const priceUp=lastClose>priorClose,priceDown=lastClose<priorClose;
  const momentumUp=r>=50&&r<70,momentumDown=r<50;
  const macdUp=macd>macdSignal,macdDown=macd<macdSignal;
  // High volume is directional only when paired with the candle's direction.
  const volumeBullish=volumeUp&&priceUp,volumeBearish=volumeUp&&priceDown;
  const bullishVotes=[trendUp,momentumUp,macdUp,volumeBullish].filter(Boolean).length;
  const bearishVotes=[trendDown,momentumDown,macdDown,volumeBearish].filter(Boolean).length;
  let signal="HOLD / NO TRADE",tone="neutral",summary="The indicators are mixed. Wait for clearer confirmation rather than forcing a direction.";
  let score=Math.max(bullishVotes,bearishVotes),scoreDirection=bullishVotes>bearishVotes?"bullish":bearishVotes>bullishVotes?"bearish":"mixed";
  if(bullishVotes>=3&&trendUp&&momentumUp&&macdUp){signal="BUY CANDIDATE";tone="buy";score=bullishVotes;scoreDirection="bullish";summary="Trend, momentum and MACD align upward in this synthetic sample. This is a demo result, not a trade instruction."}
  else if(bearishVotes>=3&&trendDown&&momentumDown&&macdDown){signal="SELL / EXIT CANDIDATE";tone="sell";score=bearishVotes;scoreDirection="bearish";summary="Trend, momentum and MACD align downward in this synthetic sample. This is a demo result, not a trade instruction."}
  const reasons=[
    (trendUp?"EMA trend is bullish (EMA 20 above EMA 50).":trendDown?"EMA trend is bearish (EMA 20 below EMA 50).":"EMA trend is mixed."),
    (r>=70?"RSI is 70 or higher: momentum may be stretched.":r<=30?"RSI is 30 or lower: downside may be stretched.":r>=50?"RSI is above 50, supporting positive momentum.":"RSI is below 50, indicating weaker momentum."),
    (macdUp?"MACD is above its signal line.":macdDown?"MACD is below its signal line.":"MACD and signal line are equal."),
    (volumeBullish?"Sample volume is above average on an up candle.":volumeBearish?"Sample volume is above average on a down candle.":volumeUp?"Sample volume is above average, but candle direction is not a clear confirmation.":"Sample volume is not above its 20-period average."),
    "Signal score counts directional rule checks; it is not a probability or a measured win rate.",
    "This run uses generated sample candles, not actual NSE/BSE history."
  ];
  return {symbol:stock.symbol,signal,tone,summary,score,scoreDirection,bullishVotes,bearishVotes,ema20:e20,ema50:e50,rsi:r,macd,macdSignal,macdCrossUp:macdPrevious<=signalPrevious&&macd>macdSignal,macdCrossDown:macdPrevious>=signalPrevious&&macd<macdSignal,volumeUp,volumeBullish,volumeBearish,reasons,time:new Date().toLocaleString("en-IN"),timeframe:"Daily (sample)"};
}
function renderSignalHistory(){
  const history=safeRead("thirut_trader_signal_history",[]);
  $("signal-history").innerHTML=history.length?history.slice().reverse().map((x,i)=>`<div class="history-item"><div><strong>${x.symbol}</strong><span class="signal-chip signal-chip-${x.tone}">${x.signal}</span><small>${x.time} · ${x.timeframe}</small></div><span class="history-score">${x.score}/4</span></div>`).join(""):'<div class="empty-state">No saved analyses yet. Select a stock and run analysis.</div>';
}
function runAnalysis(){
  const result=calculateSignal(selected);
  $("analysis-symbol").textContent=result.symbol;
  $("signal-banner").className="signal-banner signal-"+result.tone;
  $("signal-label").textContent=result.signal;
  $("signal-summary").textContent=result.summary;
  $("signal-score").textContent=result.score+"/4";$("signal-score-label").textContent=result.scoreDirection+" votes · not probability";
  $("indicator-trend").textContent=result.ema20>result.ema50?"Bullish":result.ema20<result.ema50?"Bearish":"Mixed";
  $("indicator-ema").textContent="EMA20 "+money(result.ema20)+" · EMA50 "+money(result.ema50);
  $("indicator-rsi").textContent=result.rsi.toFixed(1);
  $("indicator-rsi-note").textContent=result.rsi>=70?"Potentially overbought":result.rsi<=30?"Potentially oversold":result.rsi>=50?"Positive momentum":"Weak momentum";
  $("indicator-macd").textContent=result.macdCrossUp?"Bullish crossover":result.macdCrossDown?"Bearish crossover":result.macd>result.macdSignal?"Above signal line":"Below signal line";
  $("indicator-macd-note").textContent="MACD "+result.macd.toFixed(2)+" · Signal "+result.macdSignal.toFixed(2);
  $("indicator-volume").textContent=result.volumeBullish?"Bullish confirmation":result.volumeBearish?"Bearish confirmation":result.volumeUp?"Above average only":"Not confirmed";
  $("indicator-volume-note").textContent="Synthetic volume + candle direction";
  $("signal-reasons").innerHTML=result.reasons.map(x=>`<li>${x}</li>`).join("");
  let history=safeRead("thirut_trader_signal_history",[]);
  if(!Array.isArray(history))history=[];
  history.push({symbol:result.symbol,signal:result.signal,tone:result.tone,score:result.score,time:result.time,timeframe:result.timeframe,scoreDirection:result.scoreDirection});
  try{localStorage.setItem("thirut_trader_signal_history",JSON.stringify(history.slice(-30)))}catch{}
  renderSignalHistory();
}
function resetAnalysisPanel(){
  if(!$("signal-label"))return;
  $("signal-banner").className="signal-banner signal-neutral";
  $("signal-label").textContent="HOLD / NO TRADE";
  $("signal-summary").textContent="Stock changed. Run analysis to calculate indicators for the selected symbol.";
  $("signal-score").textContent="—";
  $("signal-score-label").textContent="votes · not probability";
  ["indicator-trend","indicator-rsi","indicator-macd","indicator-volume"].forEach(id=>$(id).textContent="—");
  $("indicator-ema").textContent="Run analysis to calculate";
  $("indicator-rsi-note").textContent="Momentum";
  $("indicator-macd-note").textContent="Momentum confirmation";
  $("indicator-volume-note").textContent="Sample volume vs 20-period average";
  $("signal-reasons").innerHTML="<li>Select Analyze selected stock to calculate a new result.</li>";
}
function toggleWatch(symbol){watchlist=watchlist.includes(symbol)?watchlist.filter(x=>x!==symbol):[...watchlist,symbol];persist();renderStocks();renderWatchlist();$("add-watch").textContent=watchlist.includes(selected.symbol)?"★":"☆";$("add-watch").classList.toggle("saved",watchlist.includes(selected.symbol))}
function renderWatchlist(){$("watchlist-items").innerHTML=watchlist.map(sym=>{const s=STOCKS.find(x=>x.symbol===sym);if(!s)return"";return `<div class="watch-item"><button data-select="${s.symbol}"><span class="stock-name">${s.name}</span><span class="stock-symbol">${s.symbol}</span></button><div class="watch-price">${money(s.price)}<small class="${s.change>=0?"positive":"negative"}">${pct(s.change)}</small></div></div>`}).join("")||'<div class="empty-state">No saved stocks. Use ☆ in the market table to add one.</div>';$("watch-count").innerHTML=watchlist.length+' <small>stocks</small>'}
function renderJournal(){$("journal-entries").innerHTML=journal.length?journal.slice().reverse().map((j,i)=>`<div class="journal-entry"><div><strong>${j.symbol} · ${j.side}</strong><small>${money(j.price)} · ${j.date}</small></div><button data-delete-journal="${journal.length-1-i}">Remove</button></div>`).join(""):'<div class="empty-state">No practice entries yet. Add one above.</div>'}
document.addEventListener("click",e=>{const star=e.target.closest("[data-star]");if(star){e.stopPropagation();toggleWatch(star.dataset.star);return}const row=e.target.closest("tr[data-symbol]");if(row){selectStock(row.dataset.symbol);return}const pick=e.target.closest("[data-select]");if(pick){selectStock(pick.dataset.select);return}const del=e.target.closest("[data-delete-journal]");if(del){journal.splice(Number(del.dataset.deleteJournal),1);persist();renderJournal()}});
document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("tr[data-symbol]")){e.preventDefault();selectStock(e.target.dataset.symbol)}});
$("stock-search").addEventListener("input",renderStocks);$("sector-filter").addEventListener("change",renderStocks);
$("add-watch").addEventListener("click",()=>toggleWatch(selected.symbol));
$("journal-form").addEventListener("submit",e=>{e.preventDefault();const symbol=$("journal-symbol").value.trim().toUpperCase();const price=Number($("journal-price").value);if(!/^[A-Z0-9.&-]{1,20}$/.test(symbol)){ $("journal-symbol").setCustomValidity("Use a stock symbol with letters, numbers, dots, ampersands, or hyphens only."); $("journal-symbol").reportValidity(); return; } $("journal-symbol").setCustomValidity(""); if(!symbol||!Number.isFinite(price)||price<=0)return;journal.push({symbol,side:$("journal-side").value,price,date:new Date().toLocaleDateString("en-IN")});persist();renderJournal();e.target.reset()});
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-view]").forEach(n=>n.classList.toggle("active",n===b));const target={overview:"market-section",watchlist:"watch-section",analysis:"analysis-section",journal:"journal-section"}[b.dataset.view];$(target).scrollIntoView({behavior:"smooth",block:"start"})}));
$("today-label").textContent="INDIA · "+new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase();
renderStocks();renderWatchlist();renderJournal();renderSignalHistory();$("backend-url").value=backendBaseUrl();$("backend-url").addEventListener("change",()=>{const value=$("backend-url").value.trim().replace(/\/$/,"");$("backend-url").value=value;if(value&&!validBackendUrl(value)){setKiteMessage("Use an HTTPS backend URL. HTTP is allowed only for localhost development.","warning");return}try{localStorage.setItem("thirut_trader_backend_url",JSON.stringify(value))}catch{}});$("check-kite-status").addEventListener("click",checkKiteStatus);$("connect-kite").addEventListener("click",connectKite);$("refresh-live-quote").addEventListener("click",refreshSelectedQuote);$("run-analysis").addEventListener("click",runAnalysis);$("clear-signal-history").addEventListener("click",()=>{try{localStorage.removeItem("thirut_trader_signal_history")}catch{}renderSignalHistory()});selectStock(selected.symbol);if(backendBaseUrl())checkKiteStatus();