(() => {
  'use strict';

  const api = window.lastwave;
  const q = s => document.querySelector(s);
  const qa = (s, root = document) => [...root.querySelectorAll(s)];
  const page = q('#page');
  const audio = q('#audio');

  const S = {
    bootstrap: null,
    local: null,
    profile: null,
    streamBase: '',
    route: 'feed',
    routeParams: {},
    history: [{ route: 'feed', params: {} }],
    historyIndex: 0,
    home: null,
    explore: null,
    current: null,
    queue: [],
    queueIndex: -1,
    shuffle: false,
    repeat: false,
    volume: .85,
    playerReady: false,
    audioCtx: null,
    sourceNode: null,
    analyser: null,
    delayNode: null,
    djGain: null,
    compressor: null,
    djTimer: null,
    djDb: 0,
    avgDb: -60,
    impactAt: 0,
    impactUntil: 0,
    cooldownUntil: 0,
    lyrics: null,
    parsedLyrics: [],
    playedHistoryFor: null,
    scrobbledFor: null,
    activeSearchType: 'all',
    trackCache: new Map(),
    fullPlayerOpen: false,
    playerTab: 'now'
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtTime = sec => {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };
  const placeholder = (text='LW') => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#242b31"/><stop offset="1" stop-color="#13171b"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" fill="#8d9aa4" font-family="Segoe UI" font-size="62" font-weight="700">${escapeHtml(text).slice(0,2)}</text></svg>`)}`;

  function toast(message, timeout = 3200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    q('#toastHost').appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }

  function loading(label='Loading') {
    return `<div class="loading"><span class="spinner"></span><span>${escapeHtml(label)}…</span></div>`;
  }

  function empty(title, copy='') {
    return `<div class="empty"><b>${escapeHtml(title)}</b>${copy ? `<span>${escapeHtml(copy)}</span>` : ''}</div>`;
  }

  function img(url, alt='') {
    const src = url || placeholder(alt);
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" onerror="this.onerror=null;this.src='${placeholder(alt).replace(/'/g, '%27')}'">`;
  }

  function cacheTrack(track) {
    if (track?.videoId) S.trackCache.set(track.videoId, track);
    return track;
  }

  function card(track) {
    cacheTrack(track);
    const id = escapeHtml(track.videoId || '');
    return `<article class="music-card" data-play="${id}">
      <div class="card-overlay">${img(track.artworkUrl, track.title)}<button class="card-play" data-play="${id}">▶</button></div>
      <h3 title="${escapeHtml(track.title)}">${escapeHtml(track.title || 'Untitled')}</h3>
      <p title="${escapeHtml(track.artist)}">${escapeHtml(track.artist || 'Unknown artist')}</p>
    </article>`;
  }

  function entityCard(entity) {
    return `<article class="music-card" data-entity-kind="${escapeHtml(entity.kind)}" data-entity-id="${escapeHtml(entity.browseId)}">
      <div class="card-overlay">${img(entity.artworkUrl, entity.title)}</div>
      <h3>${escapeHtml(entity.title || 'Untitled')}</h3>
      <p>${escapeHtml(entity.subtitle || entity.kind || '')}</p>
    </article>`;
  }

  function trackRow(track, index = 0, options = {}) {
    cacheTrack(track);
    const liked = S.local?.liked?.some(x => x.videoId === track.videoId);
    return `<div class="track-row" data-play="${escapeHtml(track.videoId || '')}">
      ${img(track.artworkUrl, track.title)}
      <div class="track-main"><strong>${escapeHtml(track.title || 'Untitled')}</strong><span>${escapeHtml(track.artist || 'Unknown artist')}</span></div>
      <div class="track-album">${escapeHtml(track.album || '')}</div>
      <div class="track-duration">${track.durationSeconds ? fmtTime(track.durationSeconds) : ''}</div>
      <div class="track-actions">
        <button class="tiny-btn ${liked ? 'active':''}" data-like="${escapeHtml(track.videoId || '')}" title="Like">${liked ? '♥':'♡'}</button>
        <button class="tiny-btn" data-context="${escapeHtml(track.videoId || '')}" title="More">•••</button>
      </div>
    </div>`;
  }

  function findTrack(videoId) {
    if (!videoId) return null;
    const cached = S.trackCache.get(videoId);
    if (cached) return cached;
    const pools = [
      S.queue,
      S.home?.flatMap?.(x => x.tracks || []) || [],
      S.explore?.tracks || [],
      S.local?.liked || [],
      S.local?.history || [],
      ...(S.local?.playlists || []).map(p => p.tracks || [])
    ];
    for (const pool of pools) {
      const found = pool?.find?.(x => x.videoId === videoId);
      if (found) return found;
    }
    return null;
  }

  function androidHeader(title, subtitle='', actions='', options={}) {
    const pushed = options.pushed ?? !['feed','stats','playlists'].includes(S.route);
    const back = pushed ? '<button class="header-icon header-back" data-history-back title="Back">←</button>' : '';
    return `<header class="expressive-header">
      <div class="header-row">
        ${back}
        <div class="header-copy"><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>
        <div class="header-actions">${actions}</div>
      </div>
    </header>`;
  }

  function headerAction(symbol, label, route, id='') {
    return `<button class="header-icon" ${route ? `data-route="${route}"` : ''} ${id ? `id="${id}"` : ''} title="${escapeHtml(label)}">${symbol}</button>`;
  }

  function pageHead(title, subtitle='', actions='') {
    return androidHeader(title, subtitle, actions);
  }
  function setConnection(text, kind='online') {
    const el = q('#connectionBadge');
    el.textContent = text;
    el.className = 'connection-badge ' + kind;
  }

  function setTheme() {
    const theme = S.local?.settings?.theme || 'dark';
    document.body.classList.toggle('light', theme === 'light');
    const accent = S.local?.settings?.accent || '#c6f100';
    document.documentElement.style.setProperty('--accent', accent);
  }

  function navigate(route, params = {}, push = true) {
    S.route = route;
    S.routeParams = params || {};
    if (push) {
      S.history = S.history.slice(0, S.historyIndex + 1);
      S.history.push({ route, params });
      S.historyIndex = S.history.length - 1;
    }
    const isRoot = ['feed','stats','playlists'].includes(route);
    q('#nav')?.classList.toggle('hidden', !isRoot);
    q('#generatorFab')?.classList.toggle('hidden', route !== 'playlists');
    qa('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.route === route));
    renderRoute().catch(err => {
      console.error(err);
      page.innerHTML = `<div class="android-content pushed">${pageHead('Something went wrong')}${empty(err?.message || 'Could not open this screen.')}</div>`;
    });
    const back=q('#backBtn'), forward=q('#forwardBtn');
    if(back) back.disabled=S.historyIndex<=0;
    if(forward) forward.disabled=S.historyIndex>=S.history.length-1;
  }
  async function renderRoute() {
    switch (S.route) {
      case 'feed': return renderFeed();
      case 'stats': return renderStats();
      case 'playlists': return renderPlaylists();
      case 'discover': return renderDiscover();
      case 'genres': return renderGenres();
      case 'search': return renderSearch(S.routeParams.query || '');
      case 'generator': return renderGenerator();
      case 'friends': return renderFriends();
      case 'downloads': return renderDownloads();
      case 'settings': return renderSettings();
      case 'entity': return renderEntity(S.routeParams.kind, S.routeParams.id, S.routeParams.title);
      case 'playlist-detail': return renderLocalPlaylist(S.routeParams.id);
      default: return renderFeed();
    }
  }

  async function renderFeed() {
    const actions =
      headerAction('⇩','Downloads','downloads') +
      headerAction('⌕','Search','search') +
      '<button class="profile-avatar" data-route="settings" title="Settings">LW</button>';
    page.innerHTML = `<div class="android-content">${androidHeader('Home','',actions,{pushed:false})}<div class="screen-body flush">${loading('Loading your music feed')}</div></div>`;
    try {
      if (!S.home) S.home = await api.youtube.home();
      setConnection('YouTube Music ready');
      const sections=(S.home||[]).filter(x=>x?.tracks?.length);
      const liked=S.local?.liked||[];
      const playlists=S.local?.playlists||[];
      const history=S.local?.history||[];
      const quickTiles=[
        {title:'Liked songs',subtitle:`${liked.length} tracks`,icon:'♥',route:'playlists',tone:'primary'},
        {title:'Your playlists',subtitle:`${playlists.length} playlists`,icon:'≡',route:'playlists',tone:'secondary'},
        {title:'Discover',subtitle:'Fresh music',icon:'✦',route:'discover',tone:'tertiary'},
        {title:'New releases',subtitle:'Fresh drops',icon:'●',query:'new music releases 2026',tone:'surface'}
      ];
      const quickTileHtml=quickTiles.map(t=>`<article class="quick-tile" ${t.route?`data-route="${t.route}"`:`data-search-query="${escapeHtml(t.query)}"`}>
        <div class="quick-tile-art">${t.icon}</div><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.subtitle)}</span>
      </article>`).join('');

      let html=`<div class="android-content">${androidHeader('Home','',actions,{pushed:false})}<div class="screen-body flush">
        <section class="section"><div class="quick-tile-row">${quickTileHtml}</div></section>`;

      const first=sections[0]?.tracks||[];
      if(first.length){
        first.forEach(cacheTrack);
        html+=`<section class="section">
          <div class="section-head"><div class="section-copy"><h2>Quick picks</h2><p>Start listening instantly</p></div><button class="section-action" data-shuffle-list="home-first">Shuffle</button></div>
          <div class="quick-picks-scroll"><div class="quick-picks-grid">${first.slice(0,18).map(t=>`<div class="quick-pick ${S.current?.videoId===t.videoId?'playing':''}" data-play="${escapeHtml(t.videoId||'')}">
            ${img(t.artworkUrl,t.title)}<div class="quick-pick-copy"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist||'Unknown artist')}</span></div>
            <button class="tiny-btn" data-context="${escapeHtml(t.videoId||'')}">⋮</button></div>`).join('')}</div></div>
        </section>`;
      }

      if(history.length){
        const recent=[];
        const seen=new Set();
        for(const t of history){if(t?.videoId&&!seen.has(t.videoId)){seen.add(t.videoId);recent.push(t);}if(recent.length>=12)break;}
        if(recent.length){
          recent.forEach(cacheTrack);
          html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>Jump back in</h2><p>Recently played</p></div></div><div class="card-row">${recent.map(card).join('')}</div></section>`;
        }
      }

      sections.slice(first.length?1:0).forEach((sec,index)=>{
        const tracks=(sec.tracks||[]).slice(0,16);tracks.forEach(cacheTrack);
        if(!tracks.length)return;
        html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>${escapeHtml(sec.title||'For you')}</h2><p>${index%2===0?'Made for your listening':'More music to explore'}</p></div><button class="section-action" data-search-query="${escapeHtml(sec.title||'music')}">More</button></div><div class="card-row">${tracks.map(card).join('')}</div></section>`;
      });
      html+='</div></div>';
      page.innerHTML=html;
      q('[data-shuffle-list="home-first"]')?.addEventListener('click',()=>{
        if(!first.length)return;const shuffled=[...first].sort(()=>Math.random()-.5);playTrack(shuffled[0],shuffled);
      });
    } catch (e) {
      setConnection('Catalog unavailable','error');
      page.innerHTML=`<div class="android-content">${androidHeader('Home','',actions,{pushed:false})}${empty('Could not load Home',e.message)}</div>`;
    }
  }
  async function renderStats() {
    page.innerHTML=`<div class="android-content pushed">${androidHeader('Statistics','',headerAction('⇩','Downloads','downloads')+headerAction('⌕','Search','search')+'<button class="profile-avatar" data-route="settings">LW</button>',{pushed:false})}${loading('Loading your listening history')}</div>`;
    const stats=await api.library.stats();
    await refreshLocal();
    const history=S.local?.history||[];
    const albums=new Set(history.map(x=>x.album).filter(Boolean)).size;
    const username=S.local.settings.lastfm?.username||'Guest';
    let html=`<div class="android-content pushed">${androidHeader('Statistics','',headerAction('⇩','Downloads','downloads')+headerAction('⌕','Search','search')+'<button class="profile-avatar" data-route="settings">LW</button>',{pushed:false})}
      <div class="screen-body">
        <div class="section-head" style="padding:2px 0 8px"><div class="section-copy"><h2>${escapeHtml(username)}</h2><p>Listening history</p></div><button class="section-action" data-route="friends">Friends</button></div>
        <div class="stats-hero">
          <div class="stats-label">Plays</div><div class="stats-number">${stats.totalPlays.toLocaleString()}</div>
          <div class="stats-pill-row">
            <div class="stat-pill"><strong>${stats.uniqueTracks}</strong><span>Tracks</span></div>
            <div class="stat-pill"><strong>${stats.topArtists.length}</strong><span>Artists</span></div>
            <div class="stat-pill"><strong>${albums}</strong><span>Albums</span></div>
          </div>
          <div class="page-actions" style="margin-top:14px"><button class="secondary" data-route="genres">Your Genres</button><button class="secondary" data-route="discover">Discover</button></div>
        </div>`;
    if(stats.topTracks.length){
      stats.topTracks.forEach(cacheTrack);
      html+=`<section class="section"><div class="section-head" style="padding-left:0;padding-right:0"><div class="section-copy"><h2>List</h2><p>Recent and most played</p></div><span class="section-action">Recent</span></div><div class="track-list" style="margin:0">${stats.topTracks.map(trackRow).join('')}</div></section>`;
    } else html+=empty('No listening history yet','Play some music and your statistics will appear here.');
    html+='</div></div>';
    page.innerHTML=html;
  }
  function playlistCard(p) {
    const cover=p.tracks?.[0]?.artworkUrl||'';
    return `<div class="playlist-row" data-local-playlist="${escapeHtml(p.id)}">
      ${img(cover,p.title)}
      <div class="playlist-copy"><strong>${escapeHtml(p.title)}</strong><span>${p.tracks?.length||0} tracks · ${escapeHtml(p.source||'LastWave')}</span></div>
      ${p.tracks?.length?'<button class="round-icon playlist-play" data-playlist-play="'+escapeHtml(p.id)+'">▶</button>':'<span></span>'}
      <button class="tiny-btn" data-playlist-menu="${escapeHtml(p.id)}">⋮</button>
    </div>`;
  }
  async function refreshLocal() {
    S.local = await api.state();
    setTheme();
    updatePlayerLike();
  }

  async function renderPlaylists() {
    await refreshLocal();
    const count=S.local.playlists.length+(S.local.liked.length?1:0);
    const tracks=S.local.playlists.reduce((n,p)=>n+(p.tracks?.length||0),0)+S.local.liked.length;
    const actions='<button class="header-icon" id="createPlaylistBtn" title="Create playlist">＋</button><button class="section-action" id="sortPlaylistBtn">≡ Sort</button>';
    let html=`<div class="android-content pushed">${androidHeader('Playlist',`${count} Playlists · ${tracks} Tracks`,actions,{pushed:false})}<div class="screen-body flush">`;
    const rows=[];
    if(S.local.liked.length) rows.push({id:'__liked__',title:'Liked songs',tracks:S.local.liked,source:'LastWave'});
    rows.push(...S.local.playlists);
    html+=rows.length?`<div class="playlist-list">${rows.map(playlistCard).join('')}</div>`:empty('No playlists yet','Tap + to create one, or use the sparkle button to generate a playlist.');
    html+='</div></div>';
    page.innerHTML=html;
    q('#createPlaylistBtn')?.addEventListener('click',createPlaylistDialog);
    q('#sortPlaylistBtn')?.addEventListener('click',()=>toast('Playlists are sorted by newest first'));
    qa('[data-playlist-play]').forEach(b=>b.addEventListener('click',e=>{
      e.stopPropagation();const id=b.dataset.playlistPlay;const p=id==='__liked__'?{tracks:S.local.liked}:S.local.playlists.find(x=>String(x.id)===id);if(p?.tracks?.length)playTrack(p.tracks[0],p.tracks);
    }));
  }
  async function renderLocalPlaylist(id) {
    await refreshLocal();
    const p=id==='__liked__'?{id,title:'Liked songs',tracks:S.local.liked,source:'LastWave'}:S.local.playlists.find(x=>String(x.id)===String(id));
    if(!p)return navigate('playlists');
    const cover=p.tracks?.[0]?.artworkUrl||'';
    p.tracks?.forEach(cacheTrack);
    page.innerHTML=`<div class="android-content pushed">
      ${androidHeader(p.title,`${p.tracks.length} tracks`,'')}
      <div class="entity-hero">${img(cover,p.title)}<div><span class="eyebrow">Playlist</span><h1>${escapeHtml(p.title)}</h1><p>${p.tracks.length} tracks · ${escapeHtml(p.source||'LastWave')}</p><div class="page-actions"><button class="primary" id="playPlaylistBtn">▶ Play</button>${id!=='__liked__'?'<button class="secondary" id="renamePlaylistBtn">Rename</button><button class="danger-btn" id="deletePlaylistBtn">Delete</button>':''}</div></div></div>
      ${p.tracks.length?`<div class="track-list">${p.tracks.map(trackRow).join('')}</div>`:empty('This playlist is empty')}
    </div>`;
    q('#playPlaylistBtn')?.addEventListener('click',()=>p.tracks[0]&&playTrack(p.tracks[0],p.tracks));
    q('#renamePlaylistBtn')?.addEventListener('click',()=>renamePlaylistDialog(p));
    q('#deletePlaylistBtn')?.addEventListener('click',async()=>{if(confirm(`Delete "${p.title}"?`)){await api.library.deletePlaylist(p.id);navigate('playlists');}});
  }
  async function renderDiscover() {
    page.innerHTML=`<div class="android-content pushed">${pageHead('Discover','Explore new music, releases, artists and albums.',headerAction('↻','Refresh','', 'refreshDiscoverBtn'))}${loading('Exploring YouTube Music')}</div>`;
    try{
      if(!S.explore)S.explore=await api.youtube.explore();
      let html=`<div class="android-content pushed">${pageHead('Discover','Explore new music, releases, artists and albums.',headerAction('↻','Refresh','', 'refreshDiscoverBtn'))}<div class="screen-body flush">`;
      if(S.explore.entities?.length)html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>Explore</h2><p>Artists, albums and playlists</p></div></div><div class="card-row">${S.explore.entities.slice(0,18).map(entityCard).join('')}</div></section>`;
      for(const sec of S.explore.sections||[]){
        const tracks=(sec.tracks||[]).slice(0,18);tracks.forEach(cacheTrack);
        if(tracks.length)html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>${escapeHtml(sec.title||'Music')}</h2></div></div><div class="card-row">${tracks.map(card).join('')}</div></section>`;
      }
      if(S.explore.tracks?.length){S.explore.tracks.forEach(cacheTrack);html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>Tracks</h2><p>Fresh picks</p></div></div><div class="track-list">${S.explore.tracks.slice(0,35).map(trackRow).join('')}</div></section>`;}
      html+='</div></div>';page.innerHTML=html;
      q('#refreshDiscoverBtn')?.addEventListener('click',()=>{S.explore=null;renderDiscover();});
    }catch(e){page.innerHTML=`<div class="android-content pushed">${pageHead('Discover')}${empty('Discovery is unavailable',e.message)}</div>`;}
  }
  async function renderGenres() {
    const stats=await api.library.stats().catch(()=>({topArtists:[]}));
    const base=GENRES.map((name,i)=>({name,percent:Math.max(.08,1-i/(GENRES.length+4))}));
    page.innerHTML=`<div class="android-content pushed">${pageHead('Your Genres','Based on your listening history','<button class="section-action">Overall</button>')}
      <div class="screen-body">
        <div id="genreBars">${base.slice(0,14).map(g=>`<div class="genre-bar-row" data-genre="${escapeHtml(g.name)}"><div class="genre-bar-label"><strong>${escapeHtml(g.name)}</strong><span>${Math.round(g.percent*100)}%</span></div><div class="genre-bar"><i style="width:${Math.round(g.percent*100)}%"></i></div></div>`).join('')}</div>
        <section id="genreResults" class="section">${empty('Choose a genre','Open any genre to see matching tracks.')}</section>
      </div></div>`;
    qa('[data-genre]').forEach(btn=>btn.addEventListener('click',async()=>{
      qa('[data-genre]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
      const host=q('#genreResults');host.innerHTML=loading(`Finding ${btn.dataset.genre}`);
      const result=await api.youtube.search(btn.dataset.genre+' music','song').catch(()=>({tracks:[]}));
      result.tracks?.forEach(cacheTrack);
      host.innerHTML=`<div class="section-head" style="padding:0"><div class="section-copy"><h2>${escapeHtml(btn.dataset.genre)}</h2><p>Your Tracks · discoveries</p></div><button class="primary" id="genreStartMix">Start Mix</button></div>`+
        (result.tracks?.length?`<div class="track-list" style="margin:0">${result.tracks.slice(0,35).map(trackRow).join('')}</div>`:empty('No tracks found'));
      q('#genreStartMix')?.addEventListener('click',()=>result.tracks?.[0]&&playTrack(result.tracks[0],result.tracks));
    }));
  }
  async function renderSearch(query='') {
    S.activeSearchType=S.routeParams.type||'all';
    const tabs=[['all','All'],['song','Tracks'],['album','Albums'],['artist','Artists'],['playlist','Playlists']];
    const header=`<div class="search-header"><div class="search-input-row"><button class="header-icon header-back" data-history-back>←</button><div class="search-pill"><span>⌕</span><input id="screenSearchInput" value="${escapeHtml(query)}" placeholder="${S.activeSearchType==='users'?'Search Last.fm users…':'Search YouTube Music…'}" autocomplete="off"><button id="screenSearchClear" class="round-icon ${query?'':'hidden'}">×</button></div></div><div class="search-filters">${tabs.map(([v,l])=>`<button class="chip ${S.activeSearchType===v?'active':''}" data-search-type="${v}">${l}</button>`).join('')}</div></div>`;
    page.innerHTML=`<div class="android-content pushed">${header}<div id="searchBody" class="screen-body flush">${query?loading('Searching'):`<section class="section"><div class="section-head"><div class="section-copy"><h2>Explore genres & moods</h2></div></div><div class="genre-cloud">${GENRES.slice(0,15).map(g=>`<button class="chip" data-search-query="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}</div></section>${(S.local?.searchHistory||[]).length?`<section class="section"><div class="section-head"><div class="section-copy"><h2>Recent searches</h2></div></div><div class="track-list">${S.local.searchHistory.slice(0,8).map(x=>`<div class="track-row" style="grid-template-columns:40px 1fr 40px" data-search-query="${escapeHtml(x)}"><div style="font-size:18px;text-align:center">↺</div><div class="track-main"><strong>${escapeHtml(x)}</strong></div><span>↗</span></div>`).join('')}</div></section>`:''}`}</div></div>`;
    const input=q('#screenSearchInput');
    let suggestTimer;
    input?.focus();
    input?.addEventListener('input',()=>{
      clearTimeout(suggestTimer);const v=input.value.trim();q('#screenSearchClear')?.classList.toggle('hidden',!v);
      if(!v){q('#searchBody').innerHTML=`<section class="section"><div class="section-head"><div class="section-copy"><h2>Explore genres & moods</h2></div></div><div class="genre-cloud">${GENRES.slice(0,15).map(g=>`<button class="chip" data-search-query="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}</div></section>`;return;}
      suggestTimer=setTimeout(async()=>{
        const suggestions=await api.youtube.suggestions(v).catch(()=>[]);
        if(input.value.trim()!==v)return;
        q('#searchBody').innerHTML=suggestions.length?`<div class="track-list" style="margin-top:10px">${suggestions.map(x=>`<div class="track-row" style="grid-template-columns:40px 1fr 40px" data-search-query="${escapeHtml(x)}"><div style="font-size:18px;text-align:center">⌕</div><div class="track-main"><strong>${escapeHtml(x)}</strong></div><span>↗</span></div>`).join('')}</div>`:empty('No suggestions');
      },180);
    });
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){const v=input.value.trim();if(v)navigate('search',{query:v,type:S.activeSearchType},false);}});
    q('#screenSearchClear')?.addEventListener('click',()=>navigate('search',{query:'',type:S.activeSearchType},false));
    qa('[data-search-type]').forEach(btn=>btn.addEventListener('click',()=>navigate('search',{query:input?.value.trim()||query,type:btn.dataset.searchType},false)));
    if(!query)return;
    try{
      const result=await api.youtube.search(query,S.activeSearchType);
      result.tracks?.forEach(cacheTrack);
      let html='';
      if(result.entities?.length&&['all','album','artist','playlist'].includes(S.activeSearchType))html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>Top results</h2></div></div><div class="card-row">${result.entities.slice(0,18).map(entityCard).join('')}</div></section>`;
      if(result.tracks?.length)html+=`<section class="section"><div class="section-head"><div class="section-copy"><h2>Tracks</h2><p>${result.tracks.length} results</p></div></div><div class="track-list">${result.tracks.map(trackRow).join('')}</div></section>`;
      q('#searchBody').innerHTML=html||empty('No results found','Try another title, artist or album.');
    }catch(e){q('#searchBody').innerHTML=empty('Search failed',e.message);}
  }
  async function renderGenerator() {
    const modes=[
      ['Top','Your most played tracks','★'],['Recent','Your latest listening','↺'],['Similar Tracks','Build song radio','♫'],
      ['Similar Artists','Artist-based radio','♙'],['Tag','Generate from genre or tag','#'],['Mix','Balanced taste mix','↝'],
      ['Recommendations','Fresh dual-engine picks','✦'],['Never Heard','Strictly new discoveries','◇'],['Library','Your saved music','▣']
    ];
    page.innerHTML=`<div class="android-content settings">${pageHead('Generator','Choose a mode to generate a playlist.')}
      <div class="screen-body">
        <div class="generator-group">${modes.map((m,i)=>`<button class="generator-row ${i===0?'selected':''}" data-gen-mode="${escapeHtml(m[0])}"><span class="generator-badge">${m[2]}</span><span><strong>${m[0]}</strong><small>${m[1]}</small></span><i>✓</i></button>`).join('')}</div>
        <div class="panel-card generator-options" style="margin-top:14px"><div class="section-head" style="padding:0"><div class="section-copy"><h2>Options</h2><p id="generatorHint">Tune your generated playlist</p></div></div>
          <div class="field"><label>Seed / genre / idea</label><input id="genSeed" placeholder="Optional seed artist, track, genre or mood"></div>
          <div class="field" style="margin-top:12px"><label>Track count</label><input id="genCount" type="range" min="5" max="35" value="25"></div>
          <button class="primary" id="generateBtn" style="width:100%;height:52px;margin-top:14px">✦ Generate Playlist</button>
        </div>
        <section id="generatedMix" class="section">${empty('Choose a mode and generate')}</section>
      </div></div>`;
    let mode='Top';
    qa('[data-gen-mode]').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.genMode;qa('[data-gen-mode]').forEach(x=>x.classList.toggle('selected',x===btn));q('#generatorHint').textContent=btn.querySelector('small')?.textContent||'';}));
    q('#generateBtn').addEventListener('click',async()=>{
      const seed=q('#genSeed').value.trim();const count=Number(q('#genCount').value)||25;
      q('#generatedMix').innerHTML=loading('Generating playlist');
      let tracks=[];
      if(['Top','Recent','Library','Mix'].includes(mode)&&!seed)tracks=await api.library.smartMix({limit:count});
      if(!tracks.length){const query=[seed,mode==='Never Heard'?'new discoveries':mode,'music'].filter(Boolean).join(' ');const result=await api.youtube.search(query,'song').catch(()=>({tracks:[]}));tracks=result.tracks.slice(0,count);}
      showGenerated(tracks,mode);
    });
  }
  function showGenerated(tracks,title) {
    const host=q('#generatedMix');
    host.innerHTML=`<div class="section-head"><h2>${escapeHtml(title)}</h2><button class="primary" id="playGeneratedBtn">Play mix</button></div>`+
      (tracks.length?`<div class="track-list">${tracks.map(trackRow).join('')}</div>`:empty('Not enough music signals yet'));
    q('#playGeneratedBtn')?.addEventListener('click',()=>tracks[0]&&playTrack(tracks[0],tracks));
  }

  async function renderFriends() {
    const lf=S.local.settings.lastfm||{};
    const head=pageHead('Friends','See Last.fm friends and what they are listening to.',headerAction('⚙','Last.fm settings','settings'));
    page.innerHTML=`<div class="android-content pushed">${head}<div class="screen-body">${lf.username&&lf.apiKey?loading('Loading friends'):empty('Connect Last.fm first','Add your API key and username in Settings → Integrations.')}</div></div>`;
    if(!lf.username||!lf.apiKey)return;
    try{
      const friends=await api.lastfm.friends(lf.username);
      page.innerHTML=`<div class="android-content pushed">${pageHead('Friends',`Last.fm friends for ${lf.username}`,headerAction('⚙','Last.fm settings','settings'))}<div class="screen-body"><div class="wide-grid">${friends.map(f=>`<div class="friend-card">${img(f.artworkUrl,f.username)}<div><strong>${escapeHtml(f.realname||f.username)}</strong><span>@${escapeHtml(f.username)}${f.recentTrack?` · ${escapeHtml(f.recentTrack.artist)} — ${escapeHtml(f.recentTrack.title)}`:''}</span></div><button class="secondary" data-friend-open="${escapeHtml(f.username)}">Open</button></div>`).join('')}</div></div></div>`;
      qa('[data-friend-open]').forEach(b=>b.addEventListener('click',()=>showFriendProfile(b.dataset.friendOpen)));
    }catch(e){page.innerHTML=`<div class="android-content pushed">${pageHead('Friends')}${empty('Could not load Last.fm friends',e.message)}</div>`;}
  }
  async function showFriendProfile(username) {
    openRightPanel(username,'Last.fm profile',loading('Loading profile'));
    try {
      const [user,recent,top]=await Promise.all([api.lastfm.user(username),api.lastfm.recent(username,20),api.lastfm.top(username,'7day',10)]);
      q('#rightPanelBody').innerHTML=`<div class="panel-card" style="margin-bottom:10px">${img(user.image,user.username)}<h2>${escapeHtml(user.realname||user.username)}</h2><div class="mini-note">${user.playcount.toLocaleString()} scrobbles</div></div>
        <h3>Recent</h3>${recent.map(x=>`<div class="queue-row"><div></div><div><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.artist)}</span></div></div>`).join('')}
        <h3>Top this week</h3>${top.map(x=>`<div class="queue-row"><div></div><div><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(x.artist)} • ${x.plays} plays</span></div></div>`).join('')}`;
    } catch(e) { q('#rightPanelBody').innerHTML=empty('Could not load profile',e.message); }
  }

  async function renderDownloads() {
    await refreshLocal();const rows=S.local.downloads||[];
    page.innerHTML=`<div class="android-content pushed">${pageHead('Downloads','Audio saved by LastWave on this PC.','<button class="header-icon" id="openDownloadsBtn">↗</button>')}<div class="screen-body"><div class="wide-grid">${rows.map(x=>`<div class="download-row">${img(x.artworkUrl,x.title)}<div><strong>${escapeHtml(x.title)}</strong><div class="mini-note">${escapeHtml(x.artist||'')} · ${escapeHtml(x.format||'audio')}</div></div><button class="secondary" data-show-file="${escapeHtml(x.file||'')}">Show</button></div>`).join('')}</div>${rows.length?'':empty('No downloads yet','Use ⋮ on a track and choose Download.')}</div></div>`;
    q('#openDownloadsBtn')?.addEventListener('click',()=>api.openDownloads());qa('[data-show-file]').forEach(b=>b.addEventListener('click',()=>api.showFile(b.dataset.showFile)));
  }
  async function renderSettings() {
    await refreshLocal();
    const s=S.local.settings, lf=s.lastfm||{};
    page.innerHTML=`<div class="android-content settings">${pageHead('Settings','Playback, Personal DJ, integrations, downloads, appearance and backup.',headerAction('⌕','Search settings',''))}<div class="screen-body">` +
      `<div class="setting-group"><h2>Audio & Playback</h2><div class="setting-card">
        ${settingToggle('DJ Energy','Laya-personalized −2 dB to +5 dB predictive pre-drop + impact shaping','djEnergy',s.djEnergy)}
        ${settingToggle('Loudness normalization','Keep perceived playback level more consistent between tracks','loudnessNormalization',s.loudnessNormalization)}
        <div class="setting-row"><div class="setting-copy"><strong>Crossfade</strong><span>Fade between tracks</span></div><select id="crossfadeSetting"><option value="0">Off</option><option value="2">2 seconds</option><option value="4">4 seconds</option><option value="6">6 seconds</option></select></div>
        <div class="setting-row"><div class="setting-copy"><strong>Audio quality</strong><span>Preferred YouTube Music stream quality</span></div><select id="qualitySetting"><option value="best">Best</option><option value="balanced">Balanced</option><option value="data-saver">Data saver</option></select></div>
      </div></div>
      <div class="setting-group"><h2>Appearance</h2><div class="setting-card">
        <div class="setting-row"><div class="setting-copy"><strong>Theme</strong><span>Choose dark, light or system</span></div><select id="themeSetting"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div>
        <div class="setting-row"><div class="setting-copy"><strong>Accent</strong><span>LastWave highlight color</span></div><input type="color" id="accentSetting" value="${escapeHtml(s.accent||'#c6f100')}"></div>
      </div></div>
      <div class="setting-group"><h2>Downloads & Library</h2><div class="setting-card">
        <div class="setting-row"><div class="setting-copy"><strong>Download folder</strong><span>${escapeHtml(s.downloadFolder||'Windows Music/LastWave')}</span></div><button class="secondary" id="chooseDownloadFolder">Choose</button></div>
        <div class="setting-row"><div class="setting-copy"><strong>Import playlist</strong><span>YouTube playlist URL or local CSV/JSON/M3U</span></div><button class="secondary" id="settingsImportBtn">Import</button></div>
      </div></div>
      <div class="setting-group"><h2>YouTube Music</h2><div class="setting-card">
        <div class="setting-row"><div class="setting-copy"><strong>Account connection</strong><span>${s.youtubeCookie ? 'Authenticated session saved' : 'Anonymous catalog mode'}</span></div><div class="page-actions"><button class="primary" id="youtubeLoginBtn">Sign in</button><button class="secondary" id="youtubeLogoutBtn">Sign out</button></div></div>
        <div class="field"><label>Advanced: authenticated cookie fallback</label><textarea id="youtubeCookie" placeholder="Optional manual cookie string if browser sign-in is unavailable.">${escapeHtml(s.youtubeCookie||'')}</textarea></div>
        <div class="page-actions" style="margin-top:12px"><button class="secondary" id="saveYouTubeCookie">Save manual connection</button></div>
      </div></div>
      <div class="setting-group"><h2>Last.fm Integration</h2><div class="setting-card"><div class="form-grid">
        <div class="field"><label>Username</label><input id="lfUsername" value="${escapeHtml(lf.username||'')}"></div>
        <div class="field"><label>API key</label><input id="lfApiKey" value="${escapeHtml(lf.apiKey||'')}"></div>
        <div class="field"><label>API secret</label><input id="lfApiSecret" type="password" value="${escapeHtml(lf.apiSecret||'')}"></div>
        <div class="field"><label>Session key (optional)</label><input id="lfSessionKey" type="password" value="${escapeHtml(lf.sessionKey||'')}"></div>
      </div><div class="page-actions" style="margin-top:14px"><button class="primary" id="saveLastFm">Save Last.fm</button><button class="secondary" id="authLastFm">Web sign-in</button></div></div></div>
      <div class="setting-group"><h2>Backup</h2><div class="setting-card"><div class="setting-row"><div class="setting-copy"><strong>Export / restore</strong><span>Playlists, likes, history, settings and friends</span></div><div class="page-actions"><button class="secondary" id="exportBackup">Export</button><button class="secondary" id="importBackup">Restore</button></div></div></div></div>
      <div class="setting-group"><h2>Personal DJ profile</h2><div class="setting-card"><pre class="mini-note" style="white-space:pre-wrap">${escapeHtml(JSON.stringify(S.profile,null,2))}</pre></div></div>`;

    q('#crossfadeSetting').value=String(s.crossfadeSeconds||0);
    q('#qualitySetting').value=s.audioQuality||'best';
    q('#themeSetting').value=s.theme||'dark';

    qa('[data-setting-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{
      const key=btn.dataset.settingToggle, value=!btn.classList.contains('on');
      S.local.settings=await api.settings.update({[key]:value}); btn.classList.toggle('on',value);
      if(key==='djEnergy'){updateDjUi();configureDjDelay();}
    }));
    q('#crossfadeSetting').addEventListener('change',e=>api.settings.update({crossfadeSeconds:Number(e.target.value)}));
    q('#qualitySetting').addEventListener('change',e=>api.settings.update({audioQuality:e.target.value}));
    q('#themeSetting').addEventListener('change',async e=>{S.local.settings=await api.settings.update({theme:e.target.value});setTheme();});
    q('#accentSetting').addEventListener('change',async e=>{S.local.settings=await api.settings.update({accent:e.target.value});setTheme();});
    q('#chooseDownloadFolder').addEventListener('click',async()=>{await api.settings.chooseDownloadFolder();renderSettings();});
    q('#settingsImportBtn').addEventListener('click',importDialog);
    q('#youtubeLoginBtn').addEventListener('click',async()=>{
      toast('A YouTube Music sign-in window has opened. Close it after your account is visible.',5000);
      const result=await api.youtube.login();
      await refreshLocal();S.home=null;S.explore=null;
      toast(result?.connected?'YouTube Music account connected':'No authenticated YouTube session was detected');
      renderSettings();
    });
    q('#youtubeLogoutBtn').addEventListener('click',async()=>{
      await api.youtube.logout();await refreshLocal();S.home=null;S.explore=null;toast('YouTube Music account disconnected');renderSettings();
    });
    q('#saveYouTubeCookie').addEventListener('click',async()=>{S.local.settings=await api.settings.update({youtubeCookie:q('#youtubeCookie').value});S.home=null;S.explore=null;toast('YouTube connection saved');});
    q('#saveLastFm').addEventListener('click',saveLastFmSettings);
    q('#authLastFm').addEventListener('click',async()=>{await saveLastFmSettings();const url=await api.lastfm.authUrl();if(url)api.openExternal(url);else toast('Add your Last.fm API key first');});
    q('#exportBackup').addEventListener('click',async()=>{const file=await api.backup.export();if(file)toast('Backup exported');});
    q('#importBackup').addEventListener('click',async()=>{const data=await api.backup.import();if(data){S.local=data;setTheme();toast('Backup restored');renderSettings();}});
  }

  function settingToggle(title,copy,key,on) {
    return `<div class="setting-row"><div class="setting-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div><button class="toggle ${on?'on':''}" data-setting-toggle="${escapeHtml(key)}"></button></div>`;
  }

  async function saveLastFmSettings(){
    const patch={username:q('#lfUsername').value.trim(),apiKey:q('#lfApiKey').value.trim(),apiSecret:q('#lfApiSecret').value.trim(),sessionKey:q('#lfSessionKey').value.trim()};
    S.local.settings.lastfm=await api.lastfm.save(patch);toast('Last.fm settings saved');
  }

  async function renderEntity(kind,id,title='') {
    page.innerHTML=`<div class="android-content pushed">${loading('Loading details')}</div>`;
    try{
      const data=await api.youtube.entity(kind,id);const name=data.title||title||kind;const cover=data.tracks?.[0]?.artworkUrl||data.entities?.[0]?.artworkUrl||'';data.tracks?.forEach(cacheTrack);
      page.innerHTML=`<div class="android-content pushed">${pageHead(name,kind[0].toUpperCase()+kind.slice(1))}
        <div class="entity-hero">${img(cover,name)}<div><span class="eyebrow">${escapeHtml(kind)}</span><h1>${escapeHtml(name)}</h1><p>${data.tracks.length} playable tracks</p><div class="page-actions"><button class="primary" id="entityPlay">▶ Play</button><button class="secondary" id="entitySave">Save playlist</button></div></div></div>
        ${data.tracks.length?`<div class="track-list">${data.tracks.map(trackRow).join('')}</div>`:empty('No playable tracks returned')}</div>`;
      q('#entityPlay')?.addEventListener('click',()=>data.tracks[0]&&playTrack(data.tracks[0],data.tracks));
      q('#entitySave')?.addEventListener('click',async()=>{if(!data.tracks.length)return;const p=await api.library.createPlaylist(name);await api.library.addToPlaylist(p.id,data.tracks);await refreshLocal();toast('Saved to your playlists');});
    }catch(e){page.innerHTML=`<div class="android-content pushed">${pageHead(title||'Details')}${empty('Could not load this item',e.message)}</div>`;}
  }
  function modal(title,body,actions) {
    const host=q('#modalHost');
    host.innerHTML=`<div class="modal-wrap"><div class="modal"><h2>${escapeHtml(title)}</h2>${body}<div class="modal-actions">${actions}</div></div></div>`;
    host.querySelector('[data-close-modal]')?.addEventListener('click',()=>host.innerHTML='');
    host.querySelector('.modal-wrap')?.addEventListener('click',e=>{if(e.target.classList.contains('modal-wrap'))host.innerHTML='';});
  }

  function createPlaylistDialog(){
    modal('New playlist',`<div class="field"><label>Name</label><input id="newPlaylistName" autofocus placeholder="Playlist name"></div>`,`<button class="secondary" data-close-modal>Cancel</button><button class="primary" id="confirmCreatePlaylist">Create</button>`);
    q('#confirmCreatePlaylist').addEventListener('click',async()=>{const p=await api.library.createPlaylist(q('#newPlaylistName').value);q('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id});});
  }

  function renamePlaylistDialog(p){
    modal('Rename playlist',`<div class="field"><label>Name</label><input id="renamePlaylistName" value="${escapeHtml(p.title)}"></div>`,`<button class="secondary" data-close-modal>Cancel</button><button class="primary" id="confirmRename">Save</button>`);
    q('#confirmRename').addEventListener('click',async()=>{await api.library.renamePlaylist(p.id,q('#renamePlaylistName').value);q('#modalHost').innerHTML='';renderLocalPlaylist(p.id);});
  }

  function importDialog(){
    modal('Import playlist',`<div class="field"><label>Public playlist URL</label><input id="importYoutubeUrl" placeholder="YouTube Music, Spotify or Apple Music playlist URL"></div><p class="mini-note">LastWave reads public playlist metadata and matches songs to the YouTube Music catalog. You can also import CSV, JSON, M3U or text lists.</p>`,
      `<button class="secondary" data-close-modal>Cancel</button><button class="secondary" id="importFileBtn">Choose file</button><button class="primary" id="importYoutubeBtn">Import URL</button>`);
    q('#importFileBtn').addEventListener('click',async()=>{toast('Matching imported tracks…',6000);const p=await api.imports.file();if(p){q('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id});}});
    q('#importYoutubeBtn').addEventListener('click',async()=>{const input=q('#importYoutubeUrl').value.trim();if(!input)return;toast('Reading and matching playlist…',7000);try{const p=await api.imports.externalUrl(input);q('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id});}catch(e){toast(e.message,6000);}});
  }

  function openRightPanel(title,subtitle,bodyHtml){
    q('#rightPanelTitle').textContent=title;q('#rightPanelSubtitle').textContent=subtitle||'';q('#rightPanelBody').innerHTML=bodyHtml||'';q('#rightPanel').classList.remove('hidden');
  }
  function closeRightPanel(){ q('#rightPanel').classList.add('hidden'); }

  function setPlayerTab(tab) {
    S.playerTab=tab;
    qa('[data-player-tab]').forEach(b=>b.classList.toggle('active',b.dataset.playerTab===tab));
    q('#fullNowPlaying')?.classList.toggle('active',tab==='now');
    q('#fullLyrics')?.classList.toggle('active',tab==='lyrics');
    q('#fullQueue')?.classList.toggle('active',tab==='queue');
    if(tab==='queue') renderFullQueue();
    if(tab==='lyrics' && S.current) {
      if(S.lyrics) renderLyricsPanel();
      else showLyrics();
    }
  }

  function openFullPlayer(tab='now') {
    if(!S.current)return;
    S.fullPlayerOpen=true;
    q('#fullPlayer')?.classList.remove('hidden');
    q('#fullPlayer')?.setAttribute('aria-hidden','false');
    q('#miniPlayer')?.classList.add('hidden');
    setPlayerTab(tab);
    updatePlayerUi();
  }

  function closeFullPlayer() {
    S.fullPlayerOpen=false;
    q('#fullPlayer')?.classList.add('hidden');
    q('#fullPlayer')?.setAttribute('aria-hidden','true');
    if(S.current)q('#miniPlayer')?.classList.remove('hidden');
  }

  async function showLyrics(){
    if(!S.current)return toast('Play a song first');
    openFullPlayer('lyrics');
    q('#lyricsSubtitle').textContent=S.current.title||'';
    q('#lyricsBody').innerHTML=loading('Finding synced lyrics');
    try{
      S.lyrics=await api.lyrics.get(S.current);
      S.parsedLyrics=parseLrc(S.lyrics.synced);
      renderLyricsPanel();
    }catch(e){q('#lyricsBody').innerHTML=empty('No lyrics available',e.message);}
  }

  function parseLrc(text){
    if(!text)return[];
    const lines=[];
    for(const raw of text.split(/\r?\n/)){
      const matches=[...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      const content=raw.replace(/\[[^\]]+\]/g,'').trim();
      for(const m of matches)lines.push({time:Number(m[1])*60+Number(m[2]),text:content});
    }
    return lines.sort((a,b)=>a.time-b.time);
  }

  function renderLyricsPanel(){
    const host=q('#lyricsBody');if(!host)return;
    q('#lyricsSubtitle').textContent=S.current?.title||'';
    if(S.parsedLyrics.length){
      host.innerHTML=`<div class="lyrics">${S.parsedLyrics.map((x,i)=>`<div class="lyric-line" data-lyric-index="${i}">${escapeHtml(x.text||'♪')}</div>`).join('')}</div><div class="mini-note" style="padding:10px;color:rgba(255,255,255,.62)">Provider: ${escapeHtml(S.lyrics?.provider||'Unknown')}</div>`;
      qa('[data-lyric-index]',host).forEach(el=>el.addEventListener('click',()=>{audio.currentTime=S.parsedLyrics[Number(el.dataset.lyricIndex)].time+(djLookahead()/1000);}));
    }else if(S.lyrics?.plain){
      host.innerHTML=`<div class="plain-lyrics">${escapeHtml(S.lyrics.plain)}</div><div class="mini-note" style="margin-top:12px;color:rgba(255,255,255,.62)">Provider: ${escapeHtml(S.lyrics.provider||'Unknown')}</div>`;
    }else host.innerHTML=empty(S.lyrics?.instrumental?'Instrumental track':'Lyrics not found');
  }

  function syncLyrics(){
    if(!S.fullPlayerOpen||S.playerTab!=='lyrics'||!S.parsedLyrics.length)return;
    const t=Math.max(0,audio.currentTime-djLookahead()/1000);
    let idx=-1;
    for(let i=0;i<S.parsedLyrics.length;i++){if(S.parsedLyrics[i].time<=t)idx=i;else break;}
    qa('#lyricsBody .lyric-line').forEach((el,i)=>el.classList.toggle('active',i===idx));
    const active=q('#lyricsBody .lyric-line.active');
    if(active&&!active.matches(':hover'))active.scrollIntoView({block:'center',behavior:'smooth'});
  }

  function renderFullQueue(){
    const host=q('#queueBody');if(!host)return;
    q('#queueSubtitle').textContent=`${S.queue.length} tracks`;
    host.innerHTML=S.queue.length?S.queue.map((t,i)=>`<div class="queue-row ${i===S.queueIndex?'playing':''}" data-queue-index="${i}">${img(t.artworkUrl,t.title)}<div><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}</span></div><span>${i===S.queueIndex?'▶':''}</span></div>`).join(''):empty('Queue is empty');
    qa('[data-queue-index]',host).forEach(el=>el.addEventListener('click',()=>playIndex(Number(el.dataset.queueIndex))));
  }

  function showQueue(){
    if(!S.current)return toast('Play a song first');
    openFullPlayer('queue');
    renderFullQueue();
  }
  async function playTrack(track,queue=null){
    if(!track?.videoId)return;
    if(queue?.length){S.queue=[...queue];S.queueIndex=Math.max(0,S.queue.findIndex(x=>x.videoId===track.videoId));}
    else if(!S.queue.length||!S.queue.some(x=>x.videoId===track.videoId)){S.queue=[track];S.queueIndex=0;}
    else S.queueIndex=S.queue.findIndex(x=>x.videoId===track.videoId);
    S.current=track;S.lyrics=null;S.parsedLyrics=[];S.playedHistoryFor=null;S.scrobbledFor=null;
    updatePlayerUi();renderFullQueue();
    await ensureAudioGraph();
    audio.src=S.streamBase+encodeURIComponent(track.videoId);
    audio.load();
    try{await audio.play();setConnection('Playing · YouTube Music');await api.lastfm.nowPlaying(track).catch(()=>{});}catch(e){toast('Playback failed: '+e.message);}
    updateMediaSession();
  }
  function playIndex(index){
    if(!S.queue.length)return;
    if(S.shuffle)index=Math.floor(Math.random()*S.queue.length);
    index=(index+S.queue.length)%S.queue.length;
    S.queueIndex=index;playTrack(S.queue[index]);
  }
  function next(){if(S.repeat&&S.current){audio.currentTime=0;audio.play();return;}if(S.queue.length)playIndex(S.queueIndex+1);}
  function prev(){if(audio.currentTime>4){audio.currentTime=0;return;}if(S.queue.length)playIndex(S.queueIndex-1);}

  async function ensureAudioGraph(){
    if(S.playerReady)return;
    const AC=window.AudioContext||window.webkitAudioContext;S.audioCtx=new AC();
    S.sourceNode=S.audioCtx.createMediaElementSource(audio);
    S.analyser=S.audioCtx.createAnalyser();S.analyser.fftSize=2048;S.analyser.smoothingTimeConstant=.18;
    S.delayNode=S.audioCtx.createDelay(1);S.djGain=S.audioCtx.createGain();S.compressor=S.audioCtx.createDynamicsCompressor();
    S.compressor.threshold.value=-1.5;S.compressor.knee.value=4;S.compressor.ratio.value=20;S.compressor.attack.value=.002;S.compressor.release.value=.16;
    S.sourceNode.connect(S.analyser);S.sourceNode.connect(S.delayNode);S.delayNode.connect(S.djGain);S.djGain.connect(S.compressor);S.compressor.connect(S.audioCtx.destination);
    configureDjDelay();S.playerReady=true;startDjLoop();
  }

  function djLookahead(){return Number(S.profile?.lookahead_ms||80);}
  function configureDjDelay(){if(S.delayNode){const enabled=Boolean(S.local?.settings?.djEnergy);S.delayNode.delayTime.setTargetAtTime(enabled?djLookahead()/1000:0,S.audioCtx.currentTime,.03);}}
  function dbToGain(db){return Math.pow(10,db/20);}

  function startDjLoop(){
    if(S.djTimer)clearInterval(S.djTimer);
    const time=new Float32Array(S.analyser.fftSize),freq=new Float32Array(S.analyser.frequencyBinCount);
    S.djTimer=setInterval(()=>{
      if(audio.paused||!S.current||!S.audioCtx)return;
      S.analyser.getFloatTimeDomainData(time);S.analyser.getFloatFrequencyData(freq);
      let power=0;for(const x of time)power+=x*x;power/=time.length;
      const rmsDb=10*Math.log10(Math.max(power,1e-10));
      const sr=S.audioCtx.sampleRate,binHz=sr/S.analyser.fftSize;
      let vocal=0,full=0,vCount=0,fCount=0;
      for(let i=1;i<freq.length;i++){const hz=i*binHz,lin=Math.pow(10,freq[i]/10);if(Number.isFinite(lin)){full+=lin;fCount++;if(hz>=180&&hz<=4000){vocal+=lin;vCount++;}}}
      const bandRatio=(vocal/Math.max(vCount,1))/(full/Math.max(fCount,1)+1e-12);
      const vocalProb=clamp((bandRatio-.9)/1.6,0,1);
      const energy=clamp((rmsDb+42)/24,0,1);
      let baseDb=(1-vocalProb)*(.75+4.25*energy)-vocalProb*2;
      if(rmsDb<-52)baseDb=0;baseDb=clamp(baseDb,Number(S.profile.minimum_db??-2),Number(S.profile.maximum_db??5));

      const now=performance.now(),enabled=Boolean(S.local?.settings?.djEnergy);
      if(enabled){
        const surge=rmsDb-S.avgDb;
        const strong=surge>=Number(S.profile.strong_surge_db??4.5)&&rmsDb>-24;
        const loud=surge>=Number(S.profile.loud_surge_db??2.5)&&rmsDb>-10;
        if((strong||loud)&&now>S.cooldownUntil&&now>S.impactUntil){
          S.impactAt=now+djLookahead();S.impactUntil=S.impactAt+Number(S.profile.impact_hold_ms||70);S.cooldownUntil=S.impactAt+Number(S.profile.cooldown_ms||420);
        }
      }
      S.avgDb=S.avgDb*.92+rmsDb*.08;
      let target=enabled?baseDb:0;
      if(enabled&&now<S.impactAt)target=Number(S.profile.pre_drop_db??-2);
      else if(enabled&&now<S.impactUntil)target=Number(S.profile.impact_db??5);
      const tau=target<S.djDb?Number(S.profile.pre_duck_ms||22):now<S.impactUntil?Number(S.profile.impact_attack_ms||6):Number(S.profile.impact_release_ms||180);
      const alpha=1-Math.exp(-20/Math.max(tau,1));S.djDb+= (target-S.djDb)*alpha;
      S.djGain.gain.setTargetAtTime(dbToGain(S.djDb),S.audioCtx.currentTime,.012);
      updateDjMeter();
    },20);
  }

  function updateDjMeter(){
    const el=q('#djMeter');if(!el)return;const enabled=Boolean(S.local?.settings?.djEnergy);el.classList.toggle('off',!enabled);el.querySelector('b').textContent=(S.djDb>=0?'+':'')+S.djDb.toFixed(1)+' dB';
  }
  function updateDjUi(){const enabled=Boolean(S.local?.settings?.djEnergy);q('#djQuickToggle').classList.toggle('active',enabled);q('#djQuickToggle').textContent=enabled?'DJ Energy':'DJ Off';updateDjMeter();}

  function updatePlayerUi(){
    const t=S.current;
    const title=t?.title||'Nothing playing',artist=t?.artist||'Choose a song to start',art=t?.artworkUrl||placeholder(t?.title||'LW');
    q('#playerTitle').textContent=title;q('#playerArtist').textContent=artist;q('#playerArt').src=art;
    q('#fullPlayerTitle').textContent=title;q('#fullPlayerArtist').textContent=artist;q('#fullPlayerArt').src=art;
    if(t?.artworkUrl)q('#fullPlayerBackdrop').style.backgroundImage=`url("${String(t.artworkUrl).replace(/"/g,'%22')}")`;
    else q('#fullPlayerBackdrop').style.backgroundImage='none';
    q('#miniPlayer').classList.toggle('hidden',!t||S.fullPlayerOpen);
    updatePlayerLike();updateDjUi();
  }
  function updatePlayerLike(){
    const liked=Boolean(S.current&&S.local?.liked?.some(x=>x.videoId===S.current.videoId));
    for(const el of [q('#likeBtn'),q('#fullLikeBtn')])if(el){el.textContent=liked?'♥':'♡';el.classList.toggle('active',liked);}
  }
  function updateMediaSession(){
    if(!('mediaSession'in navigator)||!S.current)return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:S.current.title||'',artist:S.current.artist||'',album:S.current.album||'',artwork:S.current.artworkUrl?[{src:S.current.artworkUrl,sizes:'512x512'}]:[]});
      navigator.mediaSession.setActionHandler('play',()=>audio.play());navigator.mediaSession.setActionHandler('pause',()=>audio.pause());navigator.mediaSession.setActionHandler('previoustrack',prev);navigator.mediaSession.setActionHandler('nexttrack',next);
      navigator.mediaSession.setActionHandler('seekto',d=>{if(d.seekTime!=null)audio.currentTime=d.seekTime;});
    }catch{}
  }

  function contextMenu(track,x,y){
    if(!track)return;
    const menu=q('#contextMenu');const liked=S.local.liked.some(t=>t.videoId===track.videoId);
    menu.innerHTML=`<button data-cm="play">Play now</button><button data-cm="next">Play next</button><button data-cm="like">${liked?'Remove from liked':'Add to liked'}</button><button data-cm="playlist">Add to playlist…</button><button data-cm="download">Download</button><button data-cm="related">Related tracks</button>`;
    menu.style.left=Math.min(x,innerWidth-240)+'px';menu.style.top=Math.min(y,innerHeight-280)+'px';menu.classList.remove('hidden');
    menu.querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{menu.classList.add('hidden');switch(b.dataset.cm){case'play':playTrack(track);break;case'next':{const i=Math.max(0,S.queueIndex+1);S.queue.splice(i,0,track);toast('Added next');break;}case'like':await toggleLike(track);break;case'playlist':playlistPicker(track);break;case'download':downloadTrack(track);break;case'related':showRelated(track);break;}}));
  }

  async function toggleLike(track){const liked=await api.library.toggleLike(track);await refreshLocal();toast(liked?'Added to liked songs':'Removed from liked songs');updatePlayerLike();}
  function playlistPicker(track){
    const rows=S.local.playlists.map(p=>`<button class="secondary" style="width:100%;margin:4px 0" data-pick-playlist="${escapeHtml(p.id)}">${escapeHtml(p.title)} <span class="mini-note">(${p.tracks.length})</span></button>`).join('');
    modal('Add to playlist',rows||empty('No playlists yet'),`<button class="secondary" data-close-modal>Cancel</button><button class="primary" id="pickerNewPlaylist">New playlist</button>`);
    qa('[data-pick-playlist]').forEach(b=>b.addEventListener('click',async()=>{await api.library.addToPlaylist(b.dataset.pickPlaylist,track);q('#modalHost').innerHTML='';await refreshLocal();toast('Added to playlist');}));
    q('#pickerNewPlaylist')?.addEventListener('click',()=>{ q('#modalHost').innerHTML=''; createPlaylistDialog(); });
  }
  async function downloadTrack(track){toast('Downloading '+track.title+'…',6000);try{const r=await api.downloads.track(track);await refreshLocal();toast('Saved '+r.name);}catch(e){toast('Download failed: '+e.message);}}
  async function showRelated(track){openRightPanel('Related',track.title,loading('Finding related music'));const list=await api.youtube.related(track.videoId).catch(()=>[]);q('#rightPanelBody').innerHTML=list.length?`<div class="track-list">${list.slice(0,30).map(trackRow).join('')}</div>`:empty('No related tracks returned');}

  document.addEventListener('click',e=>{
    const back=e.target.closest('[data-history-back]');if(back){goBack();return;}
    const search=e.target.closest('[data-search-query]');if(search){navigate('search',{query:search.dataset.searchQuery});return;}
    const route=e.target.closest('[data-route]');if(route){navigate(route.dataset.route);return;}
    const local=e.target.closest('[data-local-playlist]');if(local){navigate('playlist-detail',{id:local.dataset.localPlaylist});return;}
    const entity=e.target.closest('[data-entity-id]');if(entity){navigate('entity',{kind:entity.dataset.entityKind,id:entity.dataset.entityId,title:entity.querySelector('h3')?.textContent||''});return;}
    const like=e.target.closest('[data-like]');if(like){e.stopPropagation();const t=findTrack(like.dataset.like);if(t)toggleLike(t);return;}
    const more=e.target.closest('[data-context]');if(more){e.stopPropagation();const t=findTrack(more.dataset.context);contextMenu(t,e.clientX,e.clientY);return;}
    const play=e.target.closest('[data-play]');if(play){const t=findTrack(play.dataset.play);if(t){const list=play.closest('.track-list')?qa('.track-row',play.closest('.track-list')).map(el=>findTrack(el.dataset.play)).filter(Boolean):null;playTrack(t,list);}return;}
    if(!e.target.closest('#contextMenu'))q('#contextMenu').classList.add('hidden');
  });
  function goBack(){
    if(S.fullPlayerOpen){closeFullPlayer();return;}
    if(S.historyIndex>0){
      S.historyIndex--;const h=S.history[S.historyIndex];S.route=h.route;S.routeParams=h.params;
      const isRoot=['feed','stats','playlists'].includes(S.route);
      q('#nav').classList.toggle('hidden',!isRoot);q('#generatorFab').classList.toggle('hidden',S.route!=='playlists');
      qa('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.route===S.route));renderRoute();
    }else navigate('feed',{},false);
  }

  function installTopbar(){
    q('#nav')?.addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b)navigate(b.dataset.route);});
    q('#generatorFab')?.addEventListener('click',()=>navigate('generator'));
    q('#backBtn')?.addEventListener('click',goBack);
    q('#forwardBtn')?.addEventListener('click',()=>{if(S.historyIndex<S.history.length-1){S.historyIndex++;const h=S.history[S.historyIndex];navigate(h.route,h.params,false);}});
  }
  function installPlayer(){
    const toggle=async()=>{if(!S.current)return navigate('search');if(audio.paused)await audio.play();else audio.pause();};
    q('#playBtn')?.addEventListener('click',e=>{e.stopPropagation();toggle();});
    q('#fullPlayBtn')?.addEventListener('click',toggle);
    q('#nextBtn')?.addEventListener('click',e=>{e.stopPropagation();next();});
    q('#fullNextBtn')?.addEventListener('click',next);
    q('#prevBtn')?.addEventListener('click',prev);
    q('#miniPlayer')?.addEventListener('click',e=>{if(!e.target.closest('button'))openFullPlayer('now');});
    q('#collapsePlayerBtn')?.addEventListener('click',closeFullPlayer);
    qa('[data-player-tab]').forEach(b=>b.addEventListener('click',()=>setPlayerTab(b.dataset.playerTab)));
    q('#shuffleBtn')?.addEventListener('click',()=>{S.shuffle=!S.shuffle;q('#shuffleBtn').classList.toggle('active',S.shuffle);});
    q('#repeatBtn')?.addEventListener('click',()=>{S.repeat=!S.repeat;q('#repeatBtn').classList.toggle('active',S.repeat);});
    q('#volume')?.addEventListener('input',e=>{S.volume=Number(e.target.value)/100;audio.volume=S.volume;});
    q('#seek')?.addEventListener('input',e=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(e.target.value)/1000*audio.duration;});
    q('#likeBtn')?.addEventListener('click',e=>{e.stopPropagation();if(S.current)toggleLike(S.current);});
    q('#fullLikeBtn')?.addEventListener('click',()=>S.current&&toggleLike(S.current));
    q('#lyricsBtn')?.addEventListener('click',showLyrics);q('#queueBtn')?.addEventListener('click',showQueue);q('#closeRightPanel')?.addEventListener('click',closeRightPanel);
    q('#djQuickToggle')?.addEventListener('click',async()=>{const value=!S.local.settings.djEnergy;S.local.settings=await api.settings.update({djEnergy:value});updateDjUi();configureDjDelay();});
    q('#fullPlayerArtist')?.addEventListener('click',()=>{if(S.current?.artist)navigate('search',{query:S.current.artist});closeFullPlayer();});
    audio.volume=S.volume;
    audio.addEventListener('play',()=>{for(const el of [q('#playBtn'),q('#fullPlayBtn')])if(el)el.textContent='❚❚';if(S.audioCtx?.state==='suspended')S.audioCtx.resume();});
    audio.addEventListener('pause',()=>{for(const el of [q('#playBtn'),q('#fullPlayBtn')])if(el)el.textContent='▶';});
    audio.addEventListener('loadedmetadata',()=>{q('#duration').textContent=fmtTime(audio.duration);});
    audio.addEventListener('timeupdate',async()=>{
      if(Number.isFinite(audio.duration)&&audio.duration>0){
        const ratio=clamp(audio.currentTime/audio.duration,0,1);
        q('#seek').value=String(Math.floor(ratio*1000));q('#currentTime').textContent=fmtTime(audio.currentTime);q('#duration').textContent=fmtTime(audio.duration);
        q('#miniProgressFill').style.width=`${ratio*100}%`;
      }
      syncLyrics();
      if(S.current&&audio.currentTime>5&&S.playedHistoryFor!==S.current.videoId){S.playedHistoryFor=S.current.videoId;api.history.add(S.current,audio.currentTime).catch(()=>{});}
      const threshold=Math.min(240,Math.max(30,(audio.duration||180)*.5));
      if(S.current&&audio.currentTime>=threshold&&S.scrobbledFor!==S.current.videoId){S.scrobbledFor=S.current.videoId;api.lastfm.scrobble(S.current,Math.floor(Date.now()/1000-audio.currentTime)).catch(()=>{});}
    });
    audio.addEventListener('ended',next);
    audio.addEventListener('error',()=>toast('The current stream could not be played. Try another track.'));
  }
  async function init(){
    try{
      S.bootstrap=await api.bootstrap();S.local=S.bootstrap.state;S.profile=S.bootstrap.profile||{};S.streamBase=S.bootstrap.streamBase;
      setTheme();setConnection('Ready');installTopbar();installPlayer();updatePlayerUi();navigate('feed',{},false);
    }catch(e){setConnection('Startup failed','error');page.innerHTML=pageHead('LastWave could not start')+empty(e.message);}
  }

  window.addEventListener('DOMContentLoaded',init);
})();
