// 縦3ペイン版のミニ実装
// - course JSON (course-0... / course-tokaido...) を同一フォルダから fetch で読み込む前提
// - 手入力履歴はローカルStorage (key: manpo_entries)
// - compute distances は事前に JSON に埋めてある想定（.completed.json があればそちらを使う）

(async function(){
  const DEFAULT_STEP_LEN = 0.72;
  const courseFiles = {
    yamanote: 'course-0-yamanote-shinjuku-shibuya.json',
    tokaido: 'course-tokaido-53-full.json'
  };

  // DOM
  const dateInput = document.getElementById('dateInput');
  const stepsInput = document.getElementById('stepsInput');
  const sourceSelect = document.getElementById('sourceSelect');
  const addBtn = document.getElementById('addBtn');
  const pasteParseBtn = document.getElementById('pasteParseBtn');
  const historyList = document.getElementById('historyList');

  const btnY = document.getElementById('btnYamanote');
  const btnT = document.getElementById('btnTokaido');
  const displayDate = document.getElementById('displayDate');
  const boardSummary = document.getElementById('boardSummary');

  const svg = document.getElementById('boardSvg');

  // map init
  const map = L.map('map', { zoomControl: false }).setView([35.2, 137.2], 6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
  let stationMarkers = [];
  let playerMarker = null;

  // storage helpers
  const STORAGE_KEY = 'manpo_entries_v1';
  function loadEntries(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e){ return []; }
  }
  function saveEntries(entries){ localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }

  // initialize date to today
  dateInput.value = new Date().toISOString().slice(0,10);

  // entries UI
  function renderHistory(){
    const entries = loadEntries().sort((a,b)=> b.dateIso.localeCompare(a.dateIso));
    historyList.innerHTML = '';
    entries.forEach((e, i) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `<div>
          <div><strong>${e.dateIso}</strong></div>
          <div class="meta">${e.steps.toLocaleString()} steps ・ ${e.source || 'manual'}</div>
        </div>
        <div>
          <button class="btn small edit" data-idx="${i}">編集</button>
          <button class="btn secondary small del" data-idx="${i}">削除</button>
        </div>`;
      historyList.appendChild(el);
    });
    // attach events
    historyList.querySelectorAll('.del').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        const idx = Number(ev.target.dataset.idx);
        const arr = loadEntries();
        arr.splice(idx,1);
        saveEntries(arr);
        renderHistory();
        updateFromInput();
      });
    });
    historyList.querySelectorAll('.edit').forEach(btn=>{
      btn.addEventListener('click', (ev)=>{
        const idx = Number(ev.target.dataset.idx);
        const arr = loadEntries();
        const e = arr[idx];
        if (e){
          dateInput.value = e.dateIso;
          stepsInput.value = e.steps;
          sourceSelect.value = e.source || 'manual';
        }
      });
    });
  }

  // add entry
  addBtn.addEventListener('click', ()=>{
    const dateIso = dateInput.value;
    const steps = Math.max(0, Math.floor(Number(stepsInput.value) || 0));
    const source = sourceSelect.value;
    if (!dateIso){ alert('日付を選択してください'); return; }
    const arr = loadEntries();
    // allow multiple entries on same date; you may choose to merge instead
    arr.push({ id: Date.now().toString(36), dateIso, steps, source });
    saveEntries(arr);
    stepsInput.value = '';
    renderHistory();
    updateFromInput();
  });

  // paste parse (quick extract integer)
  pasteParseBtn.addEventListener('click', async ()=>{
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { alert('クリップボードにテキストがありません'); return; }
      // find first group of digits
      const m = text.replace(/,/g,'').match(/(\d{2,7})/);
      if (m){
        stepsInput.value = m[1];
        alert('歩数を自動抽出しました: ' + m[1]);
      } else {
        alert('歩数らしき数字が見つかりませんでした。');
      }
    } catch(err){
      alert('クリップボード読み取りエラー: ' + err.message);
    }
  });

  // load and render course
  let currentCourse = null;
  let currentCourseKey = 'yamanote';

  async function loadCourseByKey(key){
    const url = (key === 'yamanote') ? courseFiles.yamanote : courseFiles.tokaido;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const course = await res.json();
      // compute board positions (if not present)
      computeBoardPositions(course);
      currentCourse = course;
      currentCourseKey = key;
      // ui toggle style
      btnY.classList.toggle('active', key==='yamanote');
      btnT.classList.toggle('active', key==='tokaido');
      renderCourseOnMap(course);
      renderBoard(course);
      updateFromInput();
    } catch(err){
      console.error('course load failed', err);
      boardSummary.textContent = 'コース読み込みに失敗しました: ' + err.message;
    }
  }

  function computeBoardPositions(course){
    const viewW = 1200;
    const pad = 60;
    const usableW = viewW - pad*2;
    const total = course.totalDistanceMeters || (course.stations.length>0 ? course.stations[course.stations.length-1].cumulativeMeters || 1 : 1);
    course.stations.forEach((s,i)=>{
      s.boardX = pad + ((s.cumulativeMeters || 0) / total) * usableW;
      s.boardY = 110 + (i % 2 === 0 ? -12 : 12);
    });
  }

  function renderBoard(course){
    svg.innerHTML = '';
    // defs
    svg.innerHTML = `<defs>
        <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.08"></feDropShadow></filter>
      </defs>`;
    // edges
    for (let i=1;i<course.stations.length;i++){
      const a = course.stations[i-1], b = course.stations[i];
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1', a.boardX); line.setAttribute('y1', a.boardY);
      line.setAttribute('x2', b.boardX); line.setAttribute('y2', b.boardY);
      line.setAttribute('class','edge');
      svg.appendChild(line);
    }
    // nodes
    course.stations.forEach((s,i)=>{
      const g = document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('transform', `translate(${s.boardX},${s.boardY})`);
      const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
      c.setAttribute('r','18'); c.setAttribute('class','node-circle');
      g.appendChild(c);
      const inner = document.createElementNS('http://www.w3.org/2000/svg','circle');
      inner.setAttribute('r','6'); inner.setAttribute('fill', i===0? '#2f7cab': '#fff');
      inner.setAttribute('stroke','#2f7cab'); inner.setAttribute('stroke-width','1.5');
      g.appendChild(inner);
      const label = document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('y','40'); label.setAttribute('text-anchor','middle'); label.setAttribute('class','node-label');
      label.textContent = `${s.name}${s.cumulativeMeters ? ' ・ ' + (s.cumulativeMeters/1000).toFixed(1)+'km' : ''}`;
      g.appendChild(label);
      svg.appendChild(g);
    });
    // player mark (initially hidden)
    const player = document.createElementNS('http://www.w3.org/2000/svg','g');
    player.setAttribute('id','playerMark');
    const pm = document.createElementNS('http://www.w3.org/2000/svg','circle');
    pm.setAttribute('r','10'); pm.setAttribute('class','player-mark');
    player.appendChild(pm);
    const pLabel = document.createElementNS('http://www.w3.org/2000/svg','text');
    pLabel.setAttribute('y','-28'); pLabel.setAttribute('text-anchor','middle'); pLabel.setAttribute('class','node-label');
    pLabel.textContent = 'あなた';
    player.appendChild(pLabel);
    svg.appendChild(player);
  }

  function renderCourseOnMap(course){
    stationMarkers.forEach(m=>map.removeLayer(m));
    stationMarkers = [];
    if (playerMarker){ map.removeLayer(playerMarker); playerMarker=null; }
    const latlngs = course.stations.map(s => [s.lat, s.lon]).filter(a=>a[0]!=null);
    // polyline
    if (latlngs.length) L.polyline(latlngs, {color:'#2f7cab', weight:4, opacity:0.6}).addTo(map);
    course.stations.forEach(s=>{
      if (s.lat==null || s.lon==null) return;
      const mk = L.circleMarker([s.lat, s.lon], {radius:6, color:'#2f7cab', fillColor:'#fff', weight:2}).addTo(map);
      mk.bindPopup(`${s.name}<br/>累積: ${s.cumulativeMeters ? (s.cumulativeMeters/1000).toFixed(2)+' km':''}`);
      stationMarkers.push(mk);
    });
    if (latlngs.length) map.fitBounds(latlngs, {padding:[40,40]});
  }

  // update position from total steps sum in history up to selected date
  function totalStepsUpTo(dateIso){
    const arr = loadEntries();
    // sum steps where dateIso <= selected date
    const sum = arr.reduce((acc,e)=>{
      if (e.dateIso <= dateIso) return acc + Number(e.steps || 0);
      return acc;
    }, 0);
    return sum;
  }

  function updateFromInput(){
    if (!currentCourse) return;
    const selDate = dateInput.value;
    displayDate.textContent = selDate || '--';
    const totalSteps = totalStepsUpTo(selDate);
    const stepLen = currentCourse.defaultStepLengthMeters || DEFAULT_STEP_LEN;
    const distMeters = totalSteps * stepLen;
    const clamped = Math.min(distMeters, currentCourse.totalDistanceMeters || (currentCourse.stations[currentCourse.stations.length-1].cumulativeMeters || Infinity));

    // find station index
    let idx = 0;
    for (let i=0;i<currentCourse.stations.length;i++){
      if ((currentCourse.stations[i].cumulativeMeters || 0) <= clamped) idx = i;
      else break;
    }
    const cur = currentCourse.stations[idx];
    const next = currentCourse.stations[Math.min(idx+1, currentCourse.stations.length-1)];
    const between = Math.max(1, (next.cumulativeMeters || 0) - (cur.cumulativeMeters || 0));
    const progressed = (clamped - (cur.cumulativeMeters || 0)) / between;

    // board player
    const player = document.getElementById('playerMark');
    if (player && cur && next){
      const px = (cur.boardX || 0) + ((next.boardX || 0) - (cur.boardX || 0)) * progressed;
      const py = (cur.boardY || 0) + ((next.boardY || 0) - (cur.boardY || 0)) * progressed;
      player.setAttribute('transform', `translate(${px},${py})`);
    }

    // map player
    if (playerMarker){ map.removeLayer(playerMarker); playerMarker = null; }
    if (cur && cur.lat != null && next && next.lat != null){
      const pLat = cur.lat + (next.lat - cur.lat) * progressed;
      const pLon = cur.lon + (next.lon - cur.lon) * progressed;
      playerMarker = L.circleMarker([pLat,pLon], {radius:10, color:'#f05a28', fillColor:'#fff', weight:2}).addTo(map);
      playerMarker.bindPopup(`位置: ${(clamped/1000).toFixed(2)} km<br/>次: ${next.name}まで ${((next.cumulativeMeters || 0) - clamped)/1000 .toFixed(2)} km`);
      playerMarker.openPopup();
    }

    boardSummary.innerHTML = `累計歩数（〜${selDate}）: <strong>${totalSteps.toLocaleString()}</strong> steps （${(distMeters/1000).toFixed(2)} km）<br/>
      現在: <strong>${cur.name}</strong> ${(clamped/1000).toFixed(2)} km ・ 次: <strong>${next.name}</strong>まで ${(((next.cumulativeMeters||0)-clamped)/1000).toFixed(2)} km`;
  }

  // course toggle events
  btnY.addEventListener('click', ()=> loadCourseByKey('yamanote'));
  btnT.addEventListener('click', ()=> loadCourseByKey('tokaido'));

  // date change triggers update
  dateInput.addEventListener('change', updateFromInput);

  // initial load
  renderHistory();
  await loadCourseByKey('yamanote');

})();