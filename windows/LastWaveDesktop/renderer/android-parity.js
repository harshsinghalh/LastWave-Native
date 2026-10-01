
(function () {
  'use strict';

  var api = window.lastwave;
  var $ = function (s, root) { return (root || document).querySelector(s); };
  var $$ = function (s, root) { return Array.from((root || document).querySelectorAll(s)); };
  var audio = $('#audio');
  var page = $('#page');

  var ICONS = {
    back:'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    search:'M9.5 3a6.5 6.5 0 1 0 3.98 11.64L19.85 21 21 19.85l-6.36-6.37A6.5 6.5 0 0 0 9.5 3zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
    download:'M5 20h14v-2H5v2zm7-18v10.17l3.59-3.58L17 10l-5 5-5-5 1.41-1.41L11 12.17V2h1z',
    settings:'M19.14 12.94a7.6 7.6 0 0 0 .05-.94 7.6 7.6 0 0 0-.05-.94l2.03-1.58-1.92-3.32-2.39.96a7.1 7.1 0 0 0-1.63-.95L14.87 3h-3.74l-.36 3.17c-.58.23-1.12.55-1.63.95l-2.39-.96-1.92 3.32 2.03 1.58a7.6 7.6 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58 1.92 3.32 2.39-.96c.5.4 1.05.72 1.63.95l.36 3.17h3.74l.36-3.17c.58-.23 1.12-.55 1.63-.95l2.39.96 1.92-3.32-2.03-1.58zM13 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
    explore:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z',
    magic:'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zM11.5 9.5L10 6 8.5 9.5 5 11l3.5 1.5L10 16l1.5-3.5L15 11l-3.5-1.5zM19 15l-1 2-2 1 2 1 1 2 1-2 2-1-2-1-1-2z',
    heart:'M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.02 6.02 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    thumb:'M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32a1.5 1.5 0 0 0-.44-1.06L14.17 1 7.59 7.59A2 2 0 0 0 7 9v10a2 2 0 0 0 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
    history:'M13 3a9 9 0 0 0-8.95 8H1l4 4 4-4H6.05A7 7 0 1 1 13 19a6.9 6.9 0 0 1-4.9-2.02l-1.42 1.41A9 9 0 1 0 13 3zm-1 5v5l4.25 2.52.75-1.23-3.5-2.04V8H12z',
    release:'M12 2 9.5 7.5 4 10l5.5 2.5L12 18l2.5-5.5L20 10l-5.5-2.5L12 2zm7 14-1 2-2 1 2 1 1 2 1-2 2-1-2-1-1-2z',
    more:'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    play:'M8 5v14l11-7z',
    shuffle:'M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
    forward:'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z',
    sort:'M3 18h6v-2H3v2zm0-5h12v-2H3v2zm0-7v2h18V6H3z',
    add:'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    genres:'M3 17h2v-7H3v7zm4 0h2V7H7v10zm4 0h2V4h-2v13zm4 0h2V9h-2v8zm4 0h2V12h-2v5z',
    friends:'M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    playlist:'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zm14-10v8.18A3 3 0 1 0 19 17V8h3V6h-5z',
    album:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 12.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm0-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    person:'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    backup:'M12 2a10 10 0 1 0 9.95 11H20a8 8 0 1 1-2.34-5.66L15 10h7V3l-2.92 2.92A9.95 9.95 0 0 0 12 2z',
    palette:'M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0 0-3h-1a2 2 0 0 1 0-4H15a6 6 0 0 0 0 0-12h-3zm-4 5.5A1.5 1.5 0 1 1 8 5a1.5 1.5 0 0 1 0 3.5zm-2 4A1.5 1.5 0 1 1 6 9a1.5 1.5 0 0 1 0 3.5zm3 4A1.5 1.5 0 1 1 9 13a1.5 1.5 0 0 1 0 3.5z',
    audio:'M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12z',
    link:'M3.9 12a5 5 0 0 1 5-5h3v2h-3a3 3 0 0 0 0 6h3v2h-3a5 5 0 0 1-5-5zm5.1 1h6v-2H9v2zm6.1-6h-3v2h3a3 3 0 1 1 0 6h-3v2h3a5 5 0 0 0 0-10z',
    folder:'M10 4 12 6h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6z',
    chevron:'M9.29 6.71 13.58 11l-4.29 4.29L10.7 16.7 16.4 11l-5.7-5.7z',
    close:'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.3 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.3-6.3z'
  };

  var S = {
    bootstrap:null,local:null,profile:{},streamBase:'',
    route:'feed',params:{},history:[{route:'feed',params:{}}],historyIndex:0,
    home:null,explore:null,trackCache:new Map(),
    current:null,queue:[],queueIndex:-1,shuffle:false,repeat:false,
    audioCtx:null,sourceNode:null,analyser:null,delayNode:null,djGain:null,compressor:null,djTimer:null,
    djDb:0,avgDb:-60,impactAt:0,impactUntil:0,cooldownUntil:0,
    lyrics:null,parsedLyrics:[],playedHistoryFor:null,scrobbledFor:null,
    searchType:'all',fullTab:'now',isFullPlayer:false,sortMode:'recent'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function icon(name,cls) {
    var d=ICONS[name]||ICONS.play;
    return '<svg'+(cls?' class="'+cls+'"':'')+' viewBox="0 0 24 24" aria-hidden="true"><path d="'+d+'"/></svg>';
  }
  function placeholder(label) {
    var text=String(label||'LW').slice(0,2).toUpperCase();
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#303137"/><stop offset="1" stop-color="#1d1e22"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" fill="#c8c6d0" font-family="sans-serif" font-size="60" font-weight="700">'+esc(text)+'</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }
  function art(url,label,cls) {
    var src=url||placeholder(label);
    return '<img class="'+(cls||'')+'" src="'+esc(src)+'" alt="'+esc(label||'')+'" onerror="this.onerror=null;this.src=''+placeholder(label).replace(/'/g,'%27')+''">';
  }
  function cacheTrack(t){if(t&&t.videoId)S.trackCache.set(t.videoId,t);return t}
  function findTrack(id){
    if(!id)return null;
    if(S.trackCache.has(id))return S.trackCache.get(id);
    var pools=[S.queue,S.local&&S.local.liked||[],S.local&&S.local.history||[]];
    (S.local&&S.local.playlists||[]).forEach(function(p){pools.push(p.tracks||[])});
    for(var i=0;i<pools.length;i++){var x=(pools[i]||[]).find(function(t){return t.videoId===id});if(x)return cacheTrack(x)}
    return null;
  }
  function toast(msg,ms){
    var el=document.createElement('div');el.className='toast';el.textContent=msg;
    $('#toastHost').appendChild(el);setTimeout(function(){el.remove()},ms||3200);
  }
  function loading(){return '<div class="loading-state"><div><div class="spinner"></div></div></div>'}
  function empty(title,copy,iconName){
    return '<div class="empty-state"><div class="empty-icon">'+icon(iconName||'playlist')+'</div><b>'+esc(title)+'</b><span>'+esc(copy||'')+'</span></div>';
  }
  function setTheme(){
    var theme=S.local&&S.local.settings&&S.local.settings.theme||'dark';
    document.body.classList.toggle('light',theme==='light');
    var accent=S.local&&S.local.settings&&S.local.settings.accent;
    if(accent){
      document.documentElement.style.setProperty('--primary',accent);
      document.documentElement.style.setProperty('--primary-container','color-mix(in srgb,'+accent+' 36%,var(--surface-high))');
      document.documentElement.style.setProperty('--on-primary-container',theme==='light'?'#1d1038':'#f3e9ff');
    }
  }
  function header(title,subtitle,opts){
    opts=opts||{};
    var back=opts.back!==false&&S.route!=='feed'&&S.route!=='stats'&&S.route!=='playlists';
    var actions=opts.actions||'';
    return '<header class="expressive-header"><div class="expressive-header-inner">'+
      (back?'<button class="tonal-icon header-back" data-back type="button">'+icon('back')+'</button>':'')+
      '<div class="header-title-block"><h1 class="header-title '+(back?'pushed':'')+'">'+esc(title)+'</h1>'+
      (subtitle?'<div class="header-subtitle">'+esc(subtitle)+'</div>':'')+'</div>'+
      '<div class="header-actions">'+actions+'</div></div></header>';
  }
  function actionButton(iconName,label,attrs){
    return '<button class="tonal-icon" '+(attrs||'')+' type="button" aria-label="'+esc(label)+'">'+icon(iconName)+'</button>';
  }
  function profileButton(){
    return '<button class="profile-avatar" data-route="settings" type="button" aria-label="Settings">'+icon('person')+'</button>';
  }
  function updateRootChrome(){
    var root=['feed','stats','playlists'].indexOf(S.route)>=0;
    $('#floatingDock').classList.toggle('hidden',!root);
    $$('.dock-item').forEach(function(b){b.classList.toggle('active',b.dataset.route===S.route)});
    $('#generatorFab').classList.toggle('hidden',S.route!=='playlists');
    document.body.dataset.route=S.route;
    $('.lastwave-shell').classList.toggle('pushed',!root);
  }
  function navigate(route,params,push){
    if(push!==false){
      S.history=S.history.slice(0,S.historyIndex+1);
      S.history.push({route:route,params:params||{}});
      S.historyIndex=S.history.length-1;
    }
    S.route=route;S.params=params||{};updateRootChrome();renderRoute();
  }
  function goBack(){
    if(S.historyIndex>0){
      S.historyIndex--;var h=S.history[S.historyIndex];S.route=h.route;S.params=h.params||{};updateRootChrome();renderRoute();
    }else navigate('feed',{},false);
  }
  async function refreshLocal(){S.local=await api.state();setTheme();updateLikeUi()}
  function quickTile(title,subtitle,kind,route,iconName){
    return '<button class="quick-tile '+kind+'" data-route="'+esc(route)+'" type="button"><div class="quick-tile-art">'+icon(iconName)+'</div><strong>'+esc(title)+'</strong><span>'+esc(subtitle)+'</span></button>';
  }
  function trackRow(t,index){
    if(!t)return'';cacheTrack(t);
    var liked=S.local&&S.local.liked&&S.local.liked.some(function(x){return x.videoId===t.videoId});
    return '<div class="track-row" data-play="'+esc(t.videoId||'')+'">'+
      art(t.artworkUrl,t.title,'track-art')+
      '<div class="track-copy"><strong>'+esc(t.title||t.name||'Untitled')+'</strong><span>'+esc(t.artist||'Unknown artist')+(t.album?' · '+esc(t.album):'')+'</span></div>'+
      '<div class="track-trailing"><button class="icon-button '+(liked?'liked':'')+'" data-like="'+esc(t.videoId||'')+'" type="button" aria-label="Like">'+icon('heart')+'</button><button class="icon-button" data-more="'+esc(t.videoId||'')+'" type="button" aria-label="More">'+icon('more')+'</button></div></div>';
  }
  function trackGroup(tracks,limit){
    var list=(tracks||[]).slice(0,limit||tracks.length);
    list.forEach(cacheTrack);
    return list.length?'<div class="track-group">'+list.map(trackRow).join('')+'</div>':empty('Nothing here yet','Play or search for music to fill this section.','history');
  }
  function artCard(t,kind){
    if(t&&t.videoId)cacheTrack(t);
    var attrs='';
    if(t&&t.videoId)attrs=' data-play="'+esc(t.videoId)+'"';
    else if(t&&t.browseId)attrs=' data-entity-kind="'+esc(t.kind||kind||'playlist')+'" data-entity-id="'+esc(t.browseId)+'"';
    return '<button class="art-card '+(kind==='artist'?'artist':'')+'"'+attrs+' type="button">'+art(t&&t.artworkUrl,t&&t.title,'')+'<strong>'+esc(t&&t.title||'Untitled')+'</strong><span>'+esc(t&&t.artist||t&&t.subtitle||kind||'')+'</span></button>';
  }
  function sectionHeader(title,subtitle,action){
    return '<div class="section-header"><div class="section-copy"><h2 class="section-title">'+esc(title)+'</h2>'+(subtitle?'<p class="section-subtitle">'+esc(subtitle)+'</p>':'')+'</div>'+(action||'')+'</div>';
  }
  function currentGreeting(){
    var h=new Date().getHours();return h>=5&&h<=11?'Good morning':h>=12&&h<=16?'Good afternoon':h>=17&&h<=21?'Good evening':'Good night';
  }
  async function renderFeed(){
    page.innerHTML='<div class="screen feed-safe">'+header('Home','',{back:false,actions:actionButton('download','Downloads','data-route="downloads"')+actionButton('search','Search','data-route="search"')+profileButton()})+'<div class="feed-body">'+loading()+'</div></div>';
    var body=$('.feed-body');
    try{
      if(!S.home)S.home=await api.youtube.home();
      await refreshLocal();
      var stats=await api.library.stats().catch(function(){return{topArtists:[]}});
      var date='';try{date=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date())}catch(_){}
      var html='<div class="greeting-block"><h2>'+esc(currentGreeting())+'</h2><p>'+esc(date)+'</p></div>';
      html+='<section class="feed-surface">'+sectionHeader('Quick access','')+
        '<div class="horizontal-scroller">'+
        quickTile('Liked songs',(S.local.liked||[]).length+' tracks','like','liked','thumb')+
        quickTile('Mix & radio','Made for your taste','mix','discover','magic')+
        quickTile('Recently played',(S.local.history||[]).length+' plays','','recent','history')+
        quickTile('New releases','Fresh music','release','new-releases','release')+
        quickTile('Downloads',(S.local.downloads||[]).length+' saved','','downloads','download')+
        '</div></section>';
      if(stats.topArtists&&stats.topArtists.length){
        html+='<div class="taste-strip">'+stats.topArtists.slice(0,8).map(function(x){return'<button class="taste-chip" data-search-query="'+esc(x.artist)+'">'+esc(x.artist)+'</button>'}).join('')+'</div>';
      }
      var sections=(S.home||[]).filter(function(x){return x&&x.tracks&&x.tracks.length});
      if(sections[0]){
        html+='<section class="feed-surface">'+sectionHeader('Picked for you','From your listening · refreshed for you','<button class="text-action" data-play-section="0" type="button">'+icon('play')+' Play all</button>')+trackGroup(sections[0].tracks,8)+'</section>';
      }
      sections.slice(1).forEach(function(sec,idx){
        var tracks=sec.tracks||[];
        html+='<section class="section">'+sectionHeader(sec.title||'For you','')+'<div class="art-card-row">'+tracks.slice(0,14).map(function(t){return artCard(t,'track')}).join('')+'</div></section>';
      });
      if(!sections.length)html+=empty('Your recommendations are still warming up','Use Search or Discover to start listening.','explore');
      body.innerHTML=html;
      setConnectionReady();
    }catch(e){body.innerHTML=empty('We could not load your recommendations',e.message||'Try again later.','explore')}
  }
  function setConnectionReady(){var badge=$('#connectionBadge');if(badge)badge.textContent='Ready'}
  async function renderStats(){
    await refreshLocal();
    page.innerHTML='<div class="screen narrow">'+header('Statistics','',{back:false,actions:actionButton('download','Downloads','data-route="downloads"')+actionButton('search','Search','data-route="search"')+profileButton()})+'<div id="statsBody">'+loading()+'</div></div>';
    var stats=await api.library.stats();
    var albumSet=new Set((S.local.history||[]).map(function(x){return x.album}).filter(Boolean));
    var user=S.local.settings&&S.local.settings.lastfm&&S.local.settings.lastfm.username||'Guest';
    var html='<div class="stats-top-row"><button class="username-pill" data-route="friends" type="button">'+icon('person')+' '+esc(user)+'</button><span class="live-timer">'+esc((S.local.history||[]).length+' local plays')+'</span></div>';
    html+='<div class="stats-card"><div class="stats-hero"><div></div><div class="stats-hero-main"><strong>'+Number(stats.totalPlays||0).toLocaleString()+'</strong><span>Plays</span></div><button class="stats-forward" data-route="genres" type="button" aria-label="View genres">'+icon('forward')+'</button></div><div class="stat-pills"><div class="stat-pill"><strong>'+Number(stats.uniqueTracks||0).toLocaleString()+'</strong><span>Tracks</span></div><div class="stat-pill"><strong>'+Number((stats.topArtists||[]).length).toLocaleString()+'</strong><span>Artists</span></div><div class="stat-pill"><strong>'+albumSet.size.toLocaleString()+'</strong><span>Albums</span></div></div></div>';
    var rows=(S.local.history||[]).slice();
    if(S.sortMode==='most')rows.sort(function(a,b){return(b.playedAt||0)-(a.playedAt||0)});
    html+='<div class="list-header"><h2>List</h2><button class="sort-pill" id="statsSort" type="button">'+icon('sort')+' '+(S.sortMode==='most'?'Most Played':'Recent')+'</button></div>';
    html+=trackGroup(rows,80);
    $('#statsBody').innerHTML=html;
    $('#statsSort')&&$('#statsSort').addEventListener('click',function(){S.sortMode=S.sortMode==='recent'?'most':'recent';renderStats()});
  }
  function playlistCard(p,index,total){
    var first=p.tracks&&p.tracks[0];
    var cls=index===0?' top':index===total-1?' bottom':'';
    return '<div class="playlist-card'+cls+'" data-local-playlist="'+esc(p.id)+'">'+art(first&&first.artworkUrl,p.title,'playlist-cover')+'<div class="playlist-copy"><strong>'+esc(p.title)+'</strong><span>'+Number(p.tracks&&p.tracks.length||0)+' tracks · LastWave</span></div>'+(p.tracks&&p.tracks.length?'<button class="play-circle" data-play-playlist="'+esc(p.id)+'" type="button">'+icon('play')+'</button>':'<span></span>')+'<button class="icon-button" data-playlist-more="'+esc(p.id)+'" type="button">'+icon('more')+'</button></div>';
  }
  async function renderPlaylists(){
    await refreshLocal();
    var totalTracks=(S.local.playlists||[]).reduce(function(n,p){return n+(p.tracks||[]).length},0);
    var actions=actionButton('add','Create playlist','data-create-playlist')+'<button class="pill-action" id="playlistSort" type="button">'+icon('sort')+' Sort</button>';
    page.innerHTML='<div class="screen narrow">'+header('Playlist',(S.local.playlists||[]).length+' Playlists · '+totalTracks+' Tracks',{back:false,actions:actions})+'<div class="playlist-list">'+((S.local.playlists||[]).length?(S.local.playlists||[]).map(function(p,i){return playlistCard(p,i,S.local.playlists.length)}).join(''):empty('No playlists yet','Head to Generate to create your first mix.','playlist'))+'</div></div>';
    var c=$('[data-create-playlist]');if(c)c.addEventListener('click',createPlaylistDialog);
    var sort=$('#playlistSort');if(sort)sort.addEventListener('click',function(){S.local.playlists.reverse();renderPlaylists()});
  }
  function searchHeader(query){
    return header('Search',query?'Results for '+query:'Find songs, artists, albums and playlists',{actions:''});
  }
  async function renderSearch(){
    var q=S.params.query||'';
    page.innerHTML='<div class="screen narrow search-shell">'+searchHeader(q)+'<div class="search-box">'+icon('search')+'<input id="screenSearchInput" value="'+esc(q)+'" placeholder="Search LastWave" autocomplete="off"><button id="clearSearchBtn" type="button">'+icon('close')+'</button></div><div id="searchSuggestions"></div><div class="filter-row">'+['all','song','artist','album','playlist'].map(function(t){return'<button class="filter-pill '+(S.searchType===t?'active':'')+'" data-search-type="'+t+'" type="button">'+(t==='all'?'All':t.charAt(0).toUpperCase()+t.slice(1)+(t==='song'?'s':''))+'</button>'}).join('')+'</div><div id="searchResults">'+(q?loading():empty('Search your music','Type a song, artist, album or playlist.','search'))+'</div></div>';
    installSearchInput();
    if(!q)return;
    try{
      var result=await api.youtube.search(q,S.searchType);
      var html='';
      var ents=result.entities||[];
      if(ents.length){
        html+='<section class="section">'+sectionHeader('Top results','')+'<div class="art-card-row">'+ents.slice(0,12).map(function(x){return artCard(x,x.kind)}).join('')+'</div></section>';
      }
      if(result.tracks&&result.tracks.length){
        var top=result.tracks[0];cacheTrack(top);
        html+='<div class="top-result" data-play="'+esc(top.videoId)+'">'+art(top.artworkUrl,top.title,'')+'<div><b class="top-result-label">TOP SONG</b><strong>'+esc(top.title)+'</strong><span>'+esc(top.artist||'')+'</span></div><span class="result-play">'+icon('play')+'</span></div>';
        html+='<section class="section-block">'+sectionHeader('Songs','')+trackGroup(result.tracks,80)+'</section>';
      }
      $('#searchResults').innerHTML=html||empty('No results found','Try a different search.','search');
    }catch(e){$('#searchResults').innerHTML=empty('Search failed',e.message||'Try again.','search')}
  }
  function installSearchInput(){
    var input=$('#screenSearchInput');if(!input)return;var timer;
    input.focus();
    input.addEventListener('keydown',function(e){if(e.key==='Enter'){var q=input.value.trim();if(q){S.params.query=q;renderSearch()}}});
    input.addEventListener('input',function(){clearTimeout(timer);var q=input.value.trim();if(!q){$('#searchSuggestions').innerHTML='';return}timer=setTimeout(async function(){var ss=await api.youtube.suggestions(q).catch(function(){return[]});$('#searchSuggestions').innerHTML=ss.length?'<div class="track-group">'+ss.slice(0,6).map(function(x){return'<button class="track-row" data-suggest="'+esc(x)+'" type="button"><span class="setting-icon">'+icon('search')+'</span><span class="track-copy"><strong>'+esc(x)+'</strong></span><span></span></button>'}).join('')+'</div>':''},220)});
    var clear=$('#clearSearchBtn');if(clear)clear.addEventListener('click',function(){input.value='';S.params.query='';$('#searchResults').innerHTML=empty('Search your music','Type a song, artist, album or playlist.','search');$('#searchSuggestions').innerHTML=''});
    $$('[data-search-type]').forEach(function(b){b.addEventListener('click',function(){S.searchType=b.dataset.searchType;renderSearch()})});
  }
  async function renderDiscover(){
    page.innerHTML='<div class="screen narrow">'+header('Discover','Fresh tracks, powered by YouTube Music',{actions:actionButton('playlist','Save as playlist','data-save-discover')+actionButton('shuffle','Shuffle','data-shuffle-discover')})+'<div id="discoverBody">'+loading()+'</div></div>';
    try{
      if(!S.explore)S.explore=await api.youtube.explore();
      var tracks=S.explore.tracks||[];tracks.forEach(cacheTrack);
      var html='';
      if(S.explore.entities&&S.explore.entities.length)html+='<section class="section">'+sectionHeader('Explore','')+'<div class="art-card-row">'+S.explore.entities.slice(0,14).map(function(x){return artCard(x,x.kind)}).join('')+'</div></section>';
      html+='<div style="padding-top:12px">'+trackGroup(tracks,100)+'</div>';
      $('#discoverBody').innerHTML=html;
      var sh=$('[data-shuffle-discover]');if(sh)sh.addEventListener('click',function(){if(tracks.length)playTrack(tracks[Math.floor(Math.random()*tracks.length)],tracks)});
      var save=$('[data-save-discover]');if(save)save.addEventListener('click',async function(){if(!tracks.length)return;var p=await api.library.createPlaylist('Discover');await api.library.addToPlaylist(p.id,tracks);toast('Discover playlist saved')});
    }catch(e){$('#discoverBody').innerHTML=empty('No recommendations yet',e.message||'Try again later.','explore')}
  }
  var GENRES=['Pop','Hip-Hop','Rock','R&B','Electronic','Indie','Classical','Jazz','Bollywood','Punjabi','Lo-fi','Metal','Folk','Country','K-Pop','Latin','Afrobeats','Devotional'];
  async function renderGenres(){
    var stats=await api.library.stats().catch(function(){return{topArtists:[]}});
    page.innerHTML='<div class="screen narrow">'+header('Your Genres','Based on your listening history',{actions:'<button class="pill-action" id="genrePeriod" type="button">Overall</button>'})+'<div class="genre-list">'+GENRES.slice(0,12).map(function(g,i){var p=Math.max(14,100-i*7);return'<div class="genre-row" data-genre="'+esc(g)+'"><div class="genre-label"><span>'+esc(g)+'</span><span>'+p+'%</span></div><div class="genre-track"><i style="width:'+p+'%"></i></div></div>'}).join('')+'</div></div>';
    $$('.genre-row').forEach(function(r){r.addEventListener('click',function(){navigate('search',{query:r.dataset.genre+' music'})})});
  }
  async function renderRecent(){
    await refreshLocal();
    page.innerHTML='<div class="screen narrow">'+header('Recently played',(S.local.history||[]).length+' plays')+'<div style="padding-top:12px">'+trackGroup(S.local.history||[],120)+'</div></div>';
  }
  async function renderLiked(){
    await refreshLocal();
    page.innerHTML='<div class="screen narrow">'+header('Liked songs',(S.local.liked||[]).length+' tracks',{actions:'<button class="pill-action" id="likedShuffle" type="button">'+icon('shuffle')+' Shuffle</button>'})+'<div style="padding-top:12px">'+trackGroup(S.local.liked||[],300)+'</div></div>';
    var b=$('#likedShuffle');if(b)b.addEventListener('click',function(){var list=S.local.liked||[];if(list.length)playTrack(list[Math.floor(Math.random()*list.length)],list)});
  }
  async function renderNewReleases(){
    page.innerHTML='<div class="screen narrow">'+header('New releases','Fresh music from YouTube Music')+'<div id="newReleaseBody">'+loading()+'</div></div>';
    var r=await api.youtube.search('new music releases','song').catch(function(){return{tracks:[]}});
    $('#newReleaseBody').innerHTML='<div style="padding-top:12px">'+trackGroup(r.tracks||[],100)+'</div>';
  }
  async function renderGenerator(){
    page.innerHTML='<div class="screen narrow">'+header('Create playlist','Smart mix generator')+'<div class="generator-card"><div class="generator-grid"><label class="form-stack"><span class="form-label">Mood</span><select id="genMood" class="form-control"><option>Energetic</option><option>Chill</option><option>Focus</option><option>Happy</option><option>Melancholic</option><option>Workout</option><option>Party</option><option>Sleep</option></select></label><label class="form-stack"><span class="form-label">Genre</span><select id="genGenre" class="form-control"><option value="">Any genre</option>'+GENRES.map(function(g){return'<option>'+esc(g)+'</option>'}).join('')+'</select></label><label class="form-stack full"><span class="form-label">Seed artist, track or idea</span><input id="genSeed" class="form-control" placeholder="Arijit Singh, cinematic bass, 2000s nostalgia"></label></div><div style="display:flex;gap:8px"><button class="filled-action" id="generateMix" type="button">'+icon('magic')+' Generate</button><button class="pill-action" id="localMix" type="button">Use my history</button></div></div><div id="generatedResults"></div></div>';
    $('#generateMix').addEventListener('click',async function(){var q=[$('#genMood').value,$('#genGenre').value,$('#genSeed').value.trim(),'music'].filter(Boolean).join(' ');$('#generatedResults').innerHTML=loading();var r=await api.youtube.search(q,'song').catch(function(){return{tracks:[]}});showGenerated(r.tracks||[],q)});
    $('#localMix').addEventListener('click',async function(){var tracks=await api.library.smartMix({limit:35});showGenerated(tracks,'Your LastWave mix')});
  }
  function showGenerated(tracks,title){
    tracks.forEach(cacheTrack);
    $('#generatedResults').innerHTML='<section class="section" style="padding-top:18px">'+sectionHeader(title,'','<button class="filled-action" id="playGenerated" type="button">'+icon('play')+' Play</button>')+trackGroup(tracks,60)+'</section>';
    var b=$('#playGenerated');if(b)b.addEventListener('click',function(){if(tracks.length)playTrack(tracks[0],tracks)});
  }
  async function renderFriends(){
    await refreshLocal();
    var lf=S.local.settings.lastfm||{};
    page.innerHTML='<div class="screen narrow">'+header('Friends','Last.fm listening activity',{actions:actionButton('settings','Integration settings','data-route="settings"')})+'<div id="friendsBody">'+(lf.username&&lf.apiKey?loading():empty('Connect Last.fm first','Add your Last.fm API key and username in Settings.','friends'))+'</div></div>';
    if(!lf.username||!lf.apiKey)return;
    try{
      var friends=await api.lastfm.friends(lf.username);
      $('#friendsBody').innerHTML='<div class="friend-grid">'+friends.map(function(x){return'<div class="friend-card">'+art(x.artworkUrl,x.username,'')+'<div><strong>'+esc(x.realname||x.username)+'</strong><span>@'+esc(x.username)+(x.recentTrack?' · '+esc(x.recentTrack.artist)+' — '+esc(x.recentTrack.title):'')+'</span></div><button class="pill-action" data-friend="'+esc(x.username)+'" type="button">Open</button></div>'}).join('')+'</div>';
      $$('[data-friend]').forEach(function(b){b.addEventListener('click',function(){showFriend(b.dataset.friend)})});
    }catch(e){$('#friendsBody').innerHTML=empty('Could not load friends',e.message,'friends')}
  }
  async function showFriend(username){
    openSheet(username,'Last.fm profile',loading());
    try{
      var data=await Promise.all([api.lastfm.user(username),api.lastfm.recent(username,20),api.lastfm.top(username,'7day',10)]);
      var user=data[0],recent=data[1],top=data[2];
      $('#rightPanelBody').innerHTML='<div class="stats-card">'+art(user.image,user.username,'playlist-cover')+'<h2>'+esc(user.realname||user.username)+'</h2><p>'+Number(user.playcount||0).toLocaleString()+' scrobbles</p></div><div class="list-header"><h2>Recent</h2></div>'+recent.map(function(x){return'<div class="track-row"><span class="setting-icon">'+icon('history')+'</span><div class="track-copy"><strong>'+esc(x.title)+'</strong><span>'+esc(x.artist)+'</span></div><span></span></div>'}).join('')+'<div class="list-header"><h2>Top this week</h2></div>'+top.map(function(x){return'<div class="track-row"><span class="setting-icon">'+icon('music')+'</span><div class="track-copy"><strong>'+esc(x.title)+'</strong><span>'+esc(x.artist)+' · '+x.plays+' plays</span></div><span></span></div>'}).join('');
    }catch(e){$('#rightPanelBody').innerHTML=empty('Could not load profile',e.message,'person')}
  }
  async function renderDownloads(){
    await refreshLocal();
    var rows=S.local.downloads||[];
    page.innerHTML='<div class="screen narrow">'+header('Downloads','Music saved on this PC',{actions:'<button class="pill-action" id="openDownloadFolder" type="button">'+icon('folder')+' Folder</button>'})+'<div class="download-grid">'+(rows.length?rows.map(function(x){return'<div class="download-card">'+art(x.artworkUrl,x.title,'')+'<div class="playlist-copy"><strong>'+esc(x.title)+'</strong><span>'+esc(x.artist||'')+' · '+esc(x.format||'audio')+'</span></div><button class="icon-button" data-show-file="'+esc(x.file||'')+'" type="button">'+icon('folder')+'</button></div>'}).join(''):empty('No downloads yet','Download a track from its overflow menu.','download'))+'</div></div>';
    var o=$('#openDownloadFolder');if(o)o.addEventListener('click',function(){api.openDownloads()});
  }
  function settingsCategoryRow(id,iconName,title,copy){
    return '<div class="setting-row clickable" data-setting-category="'+esc(id)+'"><span class="setting-icon">'+icon(iconName)+'</span><div class="setting-copy"><strong>'+esc(title)+'</strong><span>'+esc(copy)+'</span></div><span class="icon-button">'+icon('chevron')+'</span></div>';
  }
  async function renderSettings(){
    await refreshLocal();
    page.innerHTML='<div class="screen narrow">'+header('Settings','',{actions:actionButton('search','Search settings','data-settings-search')})+'<div class="settings-home"><div class="settings-group-title">LastWave</div><div class="settings-group">'+
      settingsCategoryRow('appearance','palette','Appearance','Theme, accent and app font')+
      settingsCategoryRow('audio','audio','Audio & Playback','DJ Energy, crossfade and quality')+
      settingsCategoryRow('integrations','link','Integrations','YouTube Music and Last.fm')+
      settingsCategoryRow('library','folder','Downloads & Library','Downloads, imports and storage')+
      settingsCategoryRow('backup','backup','Backup & Data','Export or restore your LastWave data')+
      '</div><div class="settings-group-title">About</div><div class="settings-group">'+settingsCategoryRow('about','settings','About LastWave','Windows '+esc(S.bootstrap&&S.bootstrap.appVersion||'4.5.0'))+'</div></div></div>';
  }
  function switchHtml(key,on){return'<button class="switch '+(on?'on':'')+'" data-setting-toggle="'+esc(key)+'" type="button"><i></i></button>'}
  async function renderSettingsDetail(){
    await refreshLocal();
    var id=S.params.id||'audio',s=S.local.settings||{},lf=s.lastfm||{};
    var title={appearance:'Appearance',audio:'Audio & Playback',integrations:'Integrations',library:'Downloads & Library',backup:'Backup & Data',about:'About LastWave'}[id]||'Settings';
    var body='';
    if(id==='appearance'){
      body='<div class="settings-detail"><div class="settings-group-title">Theme</div><div class="settings-group"><div class="setting-row"><span class="setting-icon">'+icon('palette')+'</span><div class="setting-copy"><strong>Theme</strong><span>System, light or dark</span></div><select id="themeSetting" class="form-control"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div><div class="setting-row"><span class="setting-icon">'+icon('palette')+'</span><div class="setting-copy"><strong>Accent color</strong><span>Primary Material color</span></div><input id="accentSetting" type="color" value="'+esc(s.accent||'#d3bcff')+'"></div></div></div>';
    }else if(id==='audio'){
      body='<div class="settings-detail"><div class="settings-group-title">Output & Loudness</div><div class="settings-group"><div class="setting-row"><span class="setting-icon">'+icon('audio')+'</span><div class="setting-copy"><strong>DJ Energy</strong><span>Laya-personalized · −2 to +5 dB · predictive pre-drop + impact</span></div>'+switchHtml('djEnergy',s.djEnergy)+'</div><div class="setting-row"><span class="setting-icon">'+icon('audio')+'</span><div class="setting-copy"><strong>Loudness normalization</strong><span>Keep perceived level more consistent</span></div>'+switchHtml('loudnessNormalization',s.loudnessNormalization)+'</div><div class="setting-row"><span class="setting-icon">'+icon('audio')+'</span><div class="setting-copy"><strong>Crossfade</strong><span>Fade smoothly between tracks</span></div><select id="crossfadeSetting" class="form-control"><option value="0">Off</option><option value="2">2 sec</option><option value="4">4 sec</option><option value="6">6 sec</option></select></div><div class="setting-row"><span class="setting-icon">'+icon('audio')+'</span><div class="setting-copy"><strong>Audio quality</strong><span>Preferred YouTube Music stream</span></div><select id="qualitySetting" class="form-control"><option value="best">Best</option><option value="balanced">Balanced</option><option value="data-saver">Data saver</option></select></div></div></div>';
    }else if(id==='integrations'){
      body='<div class="settings-detail"><div class="settings-group-title">YouTube Music</div><div class="settings-group"><div class="setting-row"><span class="setting-icon">'+icon('link')+'</span><div class="setting-copy"><strong>Account connection</strong><span>'+(s.youtubeCookie?'Authenticated session saved':'Anonymous catalog mode')+'</span></div><button class="pill-action" id="youtubeLogin">Sign in</button></div><div class="setting-row"><span class="setting-icon">'+icon('close')+'</span><div class="setting-copy"><strong>Disconnect YouTube</strong><span>Clear the saved account session</span></div><button class="pill-action" id="youtubeLogout">Sign out</button></div></div><div class="settings-group-title">Last.fm</div><div class="generator-card" style="margin:0"><label class="form-stack"><span class="form-label">Username</span><input id="lfUsername" class="form-control" value="'+esc(lf.username||'')+'"></label><label class="form-stack"><span class="form-label">API key</span><input id="lfApiKey" class="form-control" value="'+esc(lf.apiKey||'')+'"></label><label class="form-stack"><span class="form-label">API secret</span><input id="lfApiSecret" class="form-control" type="password" value="'+esc(lf.apiSecret||'')+'"></label><label class="form-stack"><span class="form-label">Session key</span><input id="lfSessionKey" class="form-control" type="password" value="'+esc(lf.sessionKey||'')+'"></label><div><button class="filled-action" id="saveLastFm">Save Last.fm</button> <button class="pill-action" id="authLastFm">Web sign-in</button></div></div></div>';
    }else if(id==='library'){
      body='<div class="settings-detail"><div class="settings-group-title">Downloads & Library</div><div class="settings-group"><div class="setting-row clickable" id="chooseDownloadFolder"><span class="setting-icon">'+icon('folder')+'</span><div class="setting-copy"><strong>Download folder</strong><span>'+esc(s.downloadFolder||'Windows Music/LastWave')+'</span></div><span class="icon-button">'+icon('chevron')+'</span></div><div class="setting-row clickable" id="importPlaylist"><span class="setting-icon">'+icon('playlist')+'</span><div class="setting-copy"><strong>Import playlist</strong><span>YouTube, Spotify, Apple Music, CSV, JSON or M3U</span></div><span class="icon-button">'+icon('chevron')+'</span></div></div></div>';
    }else if(id==='backup'){
      body='<div class="settings-detail"><div class="settings-group-title">Backup</div><div class="settings-group"><div class="setting-row clickable" id="exportBackup"><span class="setting-icon">'+icon('backup')+'</span><div class="setting-copy"><strong>Export LastWave backup</strong><span>Playlists, likes, history and settings</span></div><span class="icon-button">'+icon('chevron')+'</span></div><div class="setting-row clickable" id="importBackup"><span class="setting-icon">'+icon('backup')+'</span><div class="setting-copy"><strong>Restore backup</strong><span>Import a LastWave backup file</span></div><span class="icon-button">'+icon('chevron')+'</span></div></div></div>';
    }else{
      body='<div class="settings-detail"><div class="stats-card"><h2>LastWave</h2><p>Windows '+esc(S.bootstrap&&S.bootstrap.appVersion||'4.5.0')+'</p><p style="color:var(--on-variant)">Android-parity desktop renderer · Material 3 Expressive · Laya Personal DJ</p></div></div>';
    }
    page.innerHTML='<div class="screen narrow">'+header(title,'')+body+'</div>';
    bindSettingsDetail(id);
  }
  function bindSettingsDetail(id){
    if(id==='appearance'){
      $('#themeSetting').value=S.local.settings.theme||'dark';
      $('#themeSetting').addEventListener('change',async function(e){S.local.settings=await api.settings.update({theme:e.target.value});setTheme()});
      $('#accentSetting').addEventListener('change',async function(e){S.local.settings=await api.settings.update({accent:e.target.value});setTheme()});
    }
    if(id==='audio'){
      $('#crossfadeSetting').value=String(S.local.settings.crossfadeSeconds||0);$('#qualitySetting').value=S.local.settings.audioQuality||'best';
      $('#crossfadeSetting').addEventListener('change',function(e){api.settings.update({crossfadeSeconds:Number(e.target.value)})});
      $('#qualitySetting').addEventListener('change',function(e){api.settings.update({audioQuality:e.target.value})});
      $$('[data-setting-toggle]').forEach(function(b){b.addEventListener('click',async function(){var k=b.dataset.settingToggle,v=!b.classList.contains('on');S.local.settings=await api.settings.update(Object.fromEntries([[k,v]]));b.classList.toggle('on',v);if(k==='djEnergy'){updateDjUi();configureDjDelay()}})});
    }
    if(id==='integrations'){
      $('#youtubeLogin').addEventListener('click',async function(){toast('Sign in window opened. Close it after your account is visible.',5000);var r=await api.youtube.login();await refreshLocal();toast(r&&r.connected?'YouTube Music connected':'No authenticated session detected');renderSettingsDetail()});
      $('#youtubeLogout').addEventListener('click',async function(){await api.youtube.logout();await refreshLocal();toast('YouTube Music disconnected');renderSettingsDetail()});
      $('#saveLastFm').addEventListener('click',saveLastFm);
      $('#authLastFm').addEventListener('click',async function(){await saveLastFm();var u=await api.lastfm.authUrl();if(u)api.openExternal(u)});
    }
    if(id==='library'){
      $('#chooseDownloadFolder').addEventListener('click',async function(){await api.settings.chooseDownloadFolder();await refreshLocal();renderSettingsDetail()});
      $('#importPlaylist').addEventListener('click',importDialog);
    }
    if(id==='backup'){
      $('#exportBackup').addEventListener('click',async function(){var p=await api.backup.export();if(p)toast('Backup exported')});
      $('#importBackup').addEventListener('click',async function(){var d=await api.backup.import();if(d){S.local=d;setTheme();toast('Backup restored')}});
    }
  }
  async function saveLastFm(){
    var patch={username:$('#lfUsername').value.trim(),apiKey:$('#lfApiKey').value.trim(),apiSecret:$('#lfApiSecret').value.trim(),sessionKey:$('#lfSessionKey').value.trim()};
    S.local.settings.lastfm=await api.lastfm.save(patch);toast('Last.fm settings saved');
  }
  async function renderPlaylistDetail(){
    await refreshLocal();var p=(S.local.playlists||[]).find(function(x){return String(x.id)===String(S.params.id)});
    if(!p){navigate('playlists');return}
    var first=p.tracks&&p.tracks[0];
    page.innerHTML='<div class="screen narrow">'+header(p.title,(p.tracks||[]).length+' tracks',{actions:'<button class="tonal-icon" id="playlistDetailMore" type="button">'+icon('more')+'</button>'})+'<div class="stats-card" style="margin-top:16px;display:flex;gap:18px;align-items:center">'+art(first&&first.artworkUrl,p.title,'playlist-cover')+'<div style="min-width:0;flex:1"><h2 style="margin:0">'+esc(p.title)+'</h2><p style="color:var(--on-variant)">'+(p.tracks||[]).length+' tracks</p></div><button class="stats-forward" id="playPlaylistDetail" type="button">'+icon('play')+'</button></div><div style="padding-top:12px">'+trackGroup(p.tracks||[],400)+'</div></div>';
    $('#playPlaylistDetail').addEventListener('click',function(){if(p.tracks&&p.tracks.length)playTrack(p.tracks[0],p.tracks)});
    $('#playlistDetailMore').addEventListener('click',function(e){playlistMenu(p,e.clientX,e.clientY)});
  }
  async function renderEntity(){
    page.innerHTML='<div class="screen narrow">'+header(S.params.title||'Details','')+'<div id="entityBody">'+loading()+'</div></div>';
    try{
      var d=await api.youtube.entity(S.params.kind,S.params.id);
      var tracks=d.tracks||[];tracks.forEach(cacheTrack);var cover=tracks[0]&&tracks[0].artworkUrl||d.entities&&d.entities[0]&&d.entities[0].artworkUrl;
      $('#entityBody').innerHTML='<div class="stats-card" style="margin-top:16px;display:flex;gap:18px;align-items:center">'+art(cover,d.title||S.params.title,'playlist-cover')+'<div style="min-width:0;flex:1"><h2 style="margin:0">'+esc(d.title||S.params.title||'Details')+'</h2><p style="color:var(--on-variant)">'+tracks.length+' playable tracks</p></div><button class="stats-forward" id="entityPlay" type="button">'+icon('play')+'</button></div><div style="padding-top:12px">'+trackGroup(tracks,300)+'</div>';
      $('#entityPlay').addEventListener('click',function(){if(tracks.length)playTrack(tracks[0],tracks)});
    }catch(e){$('#entityBody').innerHTML=empty('Could not load this item',e.message,'album')}
  }
  async function renderRoute(){
    updateRootChrome();
    if(S.route==='feed')return renderFeed();
    if(S.route==='stats')return renderStats();
    if(S.route==='playlists')return renderPlaylists();
    if(S.route==='search')return renderSearch();
    if(S.route==='discover')return renderDiscover();
    if(S.route==='genres')return renderGenres();
    if(S.route==='recent')return renderRecent();
    if(S.route==='liked')return renderLiked();
    if(S.route==='new-releases')return renderNewReleases();
    if(S.route==='generator')return renderGenerator();
    if(S.route==='friends')return renderFriends();
    if(S.route==='downloads')return renderDownloads();
    if(S.route==='settings')return renderSettings();
    if(S.route==='settings-detail')return renderSettingsDetail();
    if(S.route==='playlist-detail')return renderPlaylistDetail();
    if(S.route==='entity')return renderEntity();
    return renderFeed();
  }
  function openSheet(title,subtitle,html){
    $('#rightPanelTitle').textContent=title||'';$('#rightPanelSubtitle').textContent=subtitle||'';$('#rightPanelBody').innerHTML=html||'';$('#rightPanel').classList.remove('hidden');
  }
  function closeSheet(){$('#rightPanel').classList.add('hidden')}
  function modal(title,body,actions){
    $('#modalHost').innerHTML='<div class="modal-wrap"><div class="modal-card"><h2>'+esc(title)+'</h2>'+body+'<div class="modal-actions">'+actions+'</div></div></div>';
    var close=$('[data-close-modal]');if(close)close.addEventListener('click',function(){$('#modalHost').innerHTML=''});
  }
  function createPlaylistDialog(){
    modal('Create custom playlist','<label class="form-stack"><span class="form-label">Playlist name</span><input id="newPlaylistName" class="form-control" autofocus></label>','<button class="pill-action" data-close-modal type="button">Cancel</button><button class="filled-action" id="confirmCreatePlaylist" type="button">Create</button>');
    $('#confirmCreatePlaylist').addEventListener('click',async function(){var p=await api.library.createPlaylist($('#newPlaylistName').value);$('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id})});
  }
  function importDialog(){
    modal('Import playlist','<label class="form-stack"><span class="form-label">Public playlist URL</span><input id="importUrl" class="form-control" placeholder="YouTube Music, Spotify or Apple Music"></label><p style="color:var(--on-variant);font-size:13px">You can also choose CSV, JSON, M3U or text and LastWave will match each song.</p>','<button class="pill-action" data-close-modal type="button">Cancel</button><button class="pill-action" id="importFile" type="button">Choose file</button><button class="filled-action" id="importUrlBtn" type="button">Import URL</button>');
    $('#importFile').addEventListener('click',async function(){toast('Matching imported tracks…',6000);var p=await api.imports.file();if(p){$('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id})}});
    $('#importUrlBtn').addEventListener('click',async function(){var u=$('#importUrl').value.trim();if(!u)return;toast('Reading and matching playlist…',7000);try{var p=await api.imports.externalUrl(u);$('#modalHost').innerHTML='';await refreshLocal();navigate('playlist-detail',{id:p.id})}catch(e){toast(e.message,6000)}});
  }
  function playlistMenu(p,x,y){
    var m=$('#contextMenu');m.style.left=Math.min(x,window.innerWidth-240)+'px';m.style.top=Math.min(y,window.innerHeight-250)+'px';m.innerHTML='<button data-pm="rename">Rename</button><button data-pm="delete">Delete playlist</button>';m.classList.remove('hidden');
    $$('[data-pm]',m).forEach(function(b){b.addEventListener('click',async function(){m.classList.add('hidden');if(b.dataset.pm==='delete'){if(confirm('Delete '+p.title+'?')){await api.library.deletePlaylist(p.id);navigate('playlists')}}else{var name=prompt('Playlist name',p.title);if(name){await api.library.renamePlaylist(p.id,name);renderPlaylistDetail()}}})});
  }
  function contextMenu(t,x,y){
    if(!t)return;var liked=S.local&&S.local.liked&&S.local.liked.some(function(a){return a.videoId===t.videoId});var m=$('#contextMenu');
    m.style.left=Math.min(x,window.innerWidth-240)+'px';m.style.top=Math.min(y,window.innerHeight-320)+'px';
    m.innerHTML='<button data-cm="play">Play now</button><button data-cm="next">Play next</button><button data-cm="like">'+(liked?'Remove from liked':'Add to liked')+'</button><button data-cm="playlist">Add to playlist…</button><button data-cm="download">Download</button><button data-cm="related">Related tracks</button>';
    m.classList.remove('hidden');$$('[data-cm]',m).forEach(function(b){b.addEventListener('click',async function(){m.classList.add('hidden');var a=b.dataset.cm;if(a==='play')playTrack(t);else if(a==='next'){var i=Math.max(0,S.queueIndex+1);S.queue.splice(i,0,t);toast('Added next')}else if(a==='like')toggleLike(t);else if(a==='playlist')playlistPicker(t);else if(a==='download')downloadTrack(t);else if(a==='related')showRelated(t)})});
  }
  async function toggleLike(t){var liked=await api.library.toggleLike(t);await refreshLocal();toast(liked?'Added to liked songs':'Removed from liked songs');updateLikeUi()}
  function playlistPicker(t){
    var ps=S.local.playlists||[];modal('Add to playlist',ps.length?ps.map(function(p){return'<button class="setting-row clickable" data-pick="'+esc(p.id)+'" type="button"><span class="setting-icon">'+icon('playlist')+'</span><span class="setting-copy"><strong>'+esc(p.title)+'</strong><span>'+p.tracks.length+' tracks</span></span><span></span></button>'}).join(''):empty('No playlists yet','','playlist'),'<button class="pill-action" data-close-modal type="button">Cancel</button><button class="filled-action" id="pickerNew" type="button">New playlist</button>');
    $$('[data-pick]').forEach(function(b){b.addEventListener('click',async function(){await api.library.addToPlaylist(b.dataset.pick,t);$('#modalHost').innerHTML='';await refreshLocal();toast('Added to playlist')})});
    $('#pickerNew').addEventListener('click',function(){$('#modalHost').innerHTML='';createPlaylistDialog()});
  }
  async function downloadTrack(t){toast('Downloading '+t.title+'…',6000);try{var r=await api.downloads.track(t);await refreshLocal();toast('Saved '+r.name)}catch(e){toast('Download failed: '+e.message,5000)}}
  async function showRelated(t){openSheet('Related',t.title,loading());var rows=await api.youtube.related(t.videoId).catch(function(){return[]});$('#rightPanelBody').innerHTML=trackGroup(rows,40)}
  async function showLyrics(){
    if(!S.current)return;showFullPlayer('lyrics');$('#lyricsFullscreen').innerHTML=loading();
    try{S.lyrics=await api.lyrics.get(S.current);S.parsedLyrics=parseLrc(S.lyrics.synced);renderLyricsFull()}catch(e){$('#lyricsFullscreen').innerHTML=empty('Lyrics not found',e.message,'playlist')}
  }
  function parseLrc(text){
    if(!text)return[];var out=[];String(text).split(/\r?\n/).forEach(function(line){var re=/\[(\d+):(\d+(?:\.\d+)?)\]/g,m;var body=line.replace(/\[[^\]]+\]/g,'').trim();while((m=re.exec(line)))out.push({time:Number(m[1])*60+Number(m[2]),text:body})});return out.sort(function(a,b){return a.time-b.time});
  }
  function renderLyricsFull(){
    var host=$('#lyricsFullscreen');if(!host)return;
    if(S.parsedLyrics.length){host.innerHTML=S.parsedLyrics.map(function(x,i){return'<div class="lyric-line" data-lyric="'+i+'">'+esc(x.text||'♪')+'</div>'}).join('')+'<p style="color:rgba(255,255,255,.55);font-size:11px">Provider: '+esc(S.lyrics.provider||'')+'</p>';$$('[data-lyric]',host).forEach(function(el){el.addEventListener('click',function(){audio.currentTime=S.parsedLyrics[Number(el.dataset.lyric)].time+djLookahead()/1000})})}
    else if(S.lyrics&&S.lyrics.plain)host.innerHTML='<div class="plain-lyrics">'+esc(S.lyrics.plain)+'</div>';
    else host.innerHTML=empty(S.lyrics&&S.lyrics.instrumental?'Instrumental track':'Lyrics not found','','playlist');
  }
  function renderQueueFull(){
    var host=$('#queueFullscreen');host.innerHTML=S.queue.length?S.queue.map(function(t,i){cacheTrack(t);return'<div class="queue-row '+(i===S.queueIndex?'active':'')+'" data-queue-index="'+i+'">'+art(t.artworkUrl,t.title,'')+'<div><strong>'+esc(t.title)+'</strong><span>'+esc(t.artist||'')+'</span></div><span>'+(i===S.queueIndex?'▶':'')+'</span></div>'}).join(''):empty('Queue is empty','','playlist');
    $$('[data-queue-index]',host).forEach(function(el){el.addEventListener('click',function(){playIndex(Number(el.dataset.queueIndex))})});
  }
  function showFullPlayer(tab){
    if(!S.current)return;
    S.isFullPlayer=true;S.fullTab=tab||'now';$('#fullPlayer').classList.remove('hidden');
    $('#nowPlayingTab').classList.toggle('active',S.fullTab==='now');$('#lyricsTab').classList.toggle('active',S.fullTab==='lyrics');$('#queueTab').classList.toggle('active',S.fullTab==='queue');
    $('#playerHeaderLabel').textContent=S.fullTab==='lyrics'?'LYRICS':S.fullTab==='queue'?'PLAYING QUEUE':'NOW PLAYING';
    if(S.fullTab==='lyrics'){if(!S.lyrics)showLyrics();else renderLyricsFull()}if(S.fullTab==='queue')renderQueueFull();
  }
  function hideFullPlayer(){S.isFullPlayer=false;S.fullTab='now';$('#fullPlayer').classList.add('hidden')}
  async function playTrack(t,queue){
    if(!t||!t.videoId)return;cacheTrack(t);
    if(queue&&queue.length){queue.forEach(cacheTrack);S.queue=queue.slice();S.queueIndex=Math.max(0,S.queue.findIndex(function(x){return x.videoId===t.videoId}))}
    else if(!S.queue.length||!S.queue.some(function(x){return x.videoId===t.videoId})){S.queue=[t];S.queueIndex=0}else S.queueIndex=S.queue.findIndex(function(x){return x.videoId===t.videoId});
    S.current=t;S.lyrics=null;S.parsedLyrics=[];S.playedHistoryFor=null;S.scrobbledFor=null;updatePlayerUi();await ensureAudioGraph();
    audio.src=S.streamBase+encodeURIComponent(t.videoId);audio.load();try{await audio.play();api.lastfm.nowPlaying(t).catch(function(){})}catch(e){toast('Playback failed: '+e.message,5000)}
    updateMediaSession();
  }
  function playIndex(i){if(!S.queue.length)return;if(S.shuffle)i=Math.floor(Math.random()*S.queue.length);i=(i+S.queue.length)%S.queue.length;S.queueIndex=i;playTrack(S.queue[i])}
  function next(){if(S.repeat&&S.current){audio.currentTime=0;audio.play();return}playIndex(S.queueIndex+1)}
  function prev(){if(audio.currentTime>4){audio.currentTime=0;return}playIndex(S.queueIndex-1)}
  async function ensureAudioGraph(){
    if(S.audioCtx)return;var AC=window.AudioContext||window.webkitAudioContext;S.audioCtx=new AC();S.sourceNode=S.audioCtx.createMediaElementSource(audio);S.analyser=S.audioCtx.createAnalyser();S.analyser.fftSize=2048;S.analyser.smoothingTimeConstant=.18;S.delayNode=S.audioCtx.createDelay(1);S.djGain=S.audioCtx.createGain();S.compressor=S.audioCtx.createDynamicsCompressor();S.compressor.threshold.value=-1.5;S.compressor.knee.value=4;S.compressor.ratio.value=20;S.compressor.attack.value=.002;S.compressor.release.value=.16;S.sourceNode.connect(S.analyser);S.sourceNode.connect(S.delayNode);S.delayNode.connect(S.djGain);S.djGain.connect(S.compressor);S.compressor.connect(S.audioCtx.destination);configureDjDelay();startDjLoop()
  }
  function djLookahead(){return Number(S.profile&&S.profile.lookahead_ms||80)}
  function configureDjDelay(){if(S.delayNode){var on=Boolean(S.local&&S.local.settings&&S.local.settings.djEnergy);S.delayNode.delayTime.setTargetAtTime(on?djLookahead()/1000:0,S.audioCtx.currentTime,.03)}}
  function dbToGain(db){return Math.pow(10,db/20)}
  function startDjLoop(){
    if(S.djTimer)clearInterval(S.djTimer);var time=new Float32Array(S.analyser.fftSize),freq=new Float32Array(S.analyser.frequencyBinCount);
    S.djTimer=setInterval(function(){if(audio.paused||!S.current||!S.audioCtx)return;S.analyser.getFloatTimeDomainData(time);S.analyser.getFloatFrequencyData(freq);var power=0;for(var i=0;i<time.length;i++)power+=time[i]*time[i];power/=time.length;var rms=10*Math.log10(Math.max(power,1e-10));var sr=S.audioCtx.sampleRate,bhz=sr/S.analyser.fftSize,v=0,full=0,vc=0,fc=0;for(var j=1;j<freq.length;j++){var hz=j*bhz,lin=Math.pow(10,freq[j]/10);if(Number.isFinite(lin)){full+=lin;fc++;if(hz>=180&&hz<=4000){v+=lin;vc++}}}var ratio=(v/Math.max(vc,1))/(full/Math.max(fc,1)+1e-12);var vp=Math.max(0,Math.min(1,(ratio-.9)/1.6));var energy=Math.max(0,Math.min(1,(rms+42)/24));var base=(1-vp)*(.75+4.25*energy)-vp*2;if(rms<-52)base=0;base=Math.max(Number(S.profile.minimum_db==null?-2:S.profile.minimum_db),Math.min(Number(S.profile.maximum_db==null?5:S.profile.maximum_db),base));var now=performance.now(),enabled=Boolean(S.local&&S.local.settings&&S.local.settings.djEnergy);if(enabled){var surge=rms-S.avgDb,strong=surge>=Number(S.profile.strong_surge_db||4.5)&&rms>-24,loud=surge>=Number(S.profile.loud_surge_db||2.5)&&rms>-10;if((strong||loud)&&now>S.cooldownUntil&&now>S.impactUntil){S.impactAt=now+djLookahead();S.impactUntil=S.impactAt+Number(S.profile.impact_hold_ms||70);S.cooldownUntil=S.impactAt+Number(S.profile.cooldown_ms||420)}}S.avgDb=S.avgDb*.92+rms*.08;var target=enabled?base:0;if(enabled&&now<S.impactAt)target=Number(S.profile.pre_drop_db==null?-2:S.profile.pre_drop_db);else if(enabled&&now<S.impactUntil)target=Number(S.profile.impact_db==null?5:S.profile.impact_db);var tau=target<S.djDb?Number(S.profile.pre_duck_ms||22):now<S.impactUntil?Number(S.profile.impact_attack_ms||6):Number(S.profile.impact_release_ms||180);var alpha=1-Math.exp(-20/Math.max(tau,1));S.djDb+=(target-S.djDb)*alpha;S.djGain.gain.setTargetAtTime(dbToGain(S.djDb),S.audioCtx.currentTime,.012);updateDjUi()},20)
  }
  function updateDjUi(){var on=Boolean(S.local&&S.local.settings&&S.local.settings.djEnergy);$('#djQuickToggle').classList.toggle('active',on);$('#djQuickToggle span').textContent=on?'DJ Energy':'DJ Off';$('#djMeter').classList.toggle('off',!on);$('#djMeter b').textContent=(S.djDb>=0?'+':'')+S.djDb.toFixed(1)+' dB'}
  function updateLikeUi(){
    var liked=S.current&&S.local&&S.local.liked&&S.local.liked.some(function(x){return x.videoId===S.current.videoId});$('#likeBtn').classList.toggle('liked',Boolean(liked));
  }
  function updatePlayerUi(){
    var t=S.current;$('.lastwave-shell').classList.toggle('has-player',Boolean(t));$('#miniPlayer').classList.toggle('hidden',!t);
    if(!t)return;
    $('#playerArt').src=t.artworkUrl||placeholder(t.title);$('#playerTitle').textContent=t.title||'Untitled';$('#playerArtist').textContent=t.artist||'Unknown artist';
    $('#fullPlayerArt').src=t.artworkUrl||placeholder(t.title);$('#fullPlayerBackdropImage').src=t.artworkUrl||placeholder(t.title);$('#fullPlayerTitle').textContent=t.title||'Untitled';$('#fullPlayerArtist').textContent=t.artist||'Unknown artist';$('#playerSourceLabel').textContent='LastWave';
    updateLikeUi();updateDjUi();updateArtworkWash(t.artworkUrl);
  }
  function updateArtworkWash(url){
    var wash=$('#fullPlayerColorWash');if(!wash)return;var hue=Math.abs(hashCode(url||S.current&&S.current.title||'LastWave'))%360;wash.style.background='radial-gradient(circle at 25% 20%,hsla('+hue+',76%,62%,.58),transparent 52%),radial-gradient(circle at 88% 65%,hsla('+((hue+70)%360)+',68%,55%,.48),transparent 48%),radial-gradient(circle at 15% 82%,hsla('+((hue+320)%360)+',58%,36%,.42),transparent 46%)';
  }
  function hashCode(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return h}
  function updateMediaSession(){if(!('mediaSession'in navigator)||!S.current)return;try{navigator.mediaSession.metadata=new MediaMetadata({title:S.current.title||'',artist:S.current.artist||'',album:S.current.album||'',artwork:S.current.artworkUrl?[{src:S.current.artworkUrl,sizes:'512x512'}]:[]});navigator.mediaSession.setActionHandler('play',function(){audio.play()});navigator.mediaSession.setActionHandler('pause',function(){audio.pause()});navigator.mediaSession.setActionHandler('previoustrack',prev);navigator.mediaSession.setActionHandler('nexttrack',next);navigator.mediaSession.setActionHandler('seekto',function(d){if(d.seekTime!=null)audio.currentTime=d.seekTime})}catch(_){}}
  function syncLyrics(){
    if(!S.parsedLyrics.length||S.fullTab!=='lyrics')return;var t=Math.max(0,audio.currentTime-djLookahead()/1000),idx=-1;for(var i=0;i<S.parsedLyrics.length;i++){if(S.parsedLyrics[i].time<=t)idx=i;else break}$$('.lyric-line').forEach(function(el,n){el.classList.toggle('active',n===idx)});var active=$('.lyric-line.active');if(active)active.scrollIntoView({block:'center',behavior:'smooth'})
  }
  function installPlayer(){
    $('#miniMeta').addEventListener('click',function(){showFullPlayer('now')});$('#miniPlayer').addEventListener('dblclick',function(){showFullPlayer('now')});
    $('#miniPlayBtn').addEventListener('click',function(e){e.stopPropagation();togglePlayback()});$('#miniNextBtn').addEventListener('click',function(e){e.stopPropagation();next()});
    $('#playBtn').addEventListener('click',togglePlayback);$('#nextBtn').addEventListener('click',next);$('#prevBtn').addEventListener('click',prev);
    $('#shuffleBtn').addEventListener('click',function(){S.shuffle=!S.shuffle;$('#shuffleBtn').classList.toggle('active',S.shuffle)});
    $('#repeatBtn').addEventListener('click',function(){S.repeat=!S.repeat;$('#repeatBtn').classList.toggle('active',S.repeat)});
    $('#collapsePlayerBtn').addEventListener('click',function(){if(S.fullTab!=='now')showFullPlayer('now');else hideFullPlayer()});
    $('#lyricsBtn').addEventListener('click',showLyrics);$('#queueBtn').addEventListener('click',function(){showFullPlayer('queue')});
    $('#likeBtn').addEventListener('click',function(){if(S.current)toggleLike(S.current)});
    $('#playerMoreBtn').addEventListener('click',function(e){if(S.current)contextMenu(S.current,e.clientX,e.clientY)});
    $('#djQuickToggle').addEventListener('click',async function(){var v=!S.local.settings.djEnergy;S.local.settings=await api.settings.update({djEnergy:v});configureDjDelay();updateDjUi()});
    $('#volume').addEventListener('input',function(e){audio.volume=Number(e.target.value)/100});
    $('#seek').addEventListener('input',function(e){if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Number(e.target.value)/1000*audio.duration});
    $('#sheetScrim').addEventListener('click',closeSheet);$('#closeRightPanel').addEventListener('click',closeSheet);
    audio.volume=.85;
    audio.addEventListener('play',function(){$('#fullPlayer').classList.remove('paused');$('#fullPlayPath').setAttribute('d','M6 19h4V5H6v14zm8-14v14h4V5h-4z');$('#miniPlayPath').setAttribute('d','M6 19h4V5H6v14zm8-14v14h4V5h-4z');if(S.audioCtx&&S.audioCtx.state==='suspended')S.audioCtx.resume()});
    audio.addEventListener('pause',function(){$('#fullPlayer').classList.add('paused');$('#fullPlayPath').setAttribute('d',ICONS.play);$('#miniPlayPath').setAttribute('d',ICONS.play)});
    audio.addEventListener('timeupdate',function(){if(Number.isFinite(audio.duration)&&audio.duration>0){var f=Math.max(0,Math.min(1,audio.currentTime/audio.duration));$('#miniProgress').style.width=(f*100)+'%';$('#seek').value=String(Math.floor(f*1000));$('#seekActive').style.width='calc('+f*100+'% - 9px)';$('#seekThumb').style.left='calc('+f*100+'% - 2.5px)';$('#seekInactive').style.left='calc('+f*100+'% + 9px)';$('#currentTime').textContent=formatTime(audio.currentTime);$('#duration').textContent=formatTime(audio.duration)}syncLyrics();if(S.current&&audio.currentTime>5&&S.playedHistoryFor!==S.current.videoId){S.playedHistoryFor=S.current.videoId;api.history.add(S.current,audio.currentTime).catch(function(){})}var threshold=Math.min(240,Math.max(30,(audio.duration||180)*.5));if(S.current&&audio.currentTime>=threshold&&S.scrobbledFor!==S.current.videoId){S.scrobbledFor=S.current.videoId;api.lastfm.scrobble(S.current,Math.floor(Date.now()/1000-audio.currentTime)).catch(function(){})}});
    audio.addEventListener('ended',next);audio.addEventListener('error',function(){toast('The current stream could not be played. Try another track.',5000)});
  }
  function togglePlayback(){if(!S.current){navigate('search');return}if(audio.paused)audio.play();else audio.pause()}
  function formatTime(sec){if(!Number.isFinite(sec)||sec<0)sec=0;var m=Math.floor(sec/60),s=Math.floor(sec%60);return m+':'+String(s).padStart(2,'0')}
  function installDelegation(){
    document.addEventListener('click',function(e){
      var b=e.target.closest('[data-back]');if(b){goBack();return}
      var route=e.target.closest('[data-route]');if(route){navigate(route.dataset.route,{});return}
      var cat=e.target.closest('[data-setting-category]');if(cat){navigate('settings-detail',{id:cat.dataset.settingCategory});return}
      var sq=e.target.closest('[data-search-query]');if(sq){navigate('search',{query:sq.dataset.searchQuery});return}
      var sg=e.target.closest('[data-suggest]');if(sg){navigate('search',{query:sg.dataset.suggest});return}
      var ent=e.target.closest('[data-entity-id]');if(ent){navigate('entity',{kind:ent.dataset.entityKind,id:ent.dataset.entityId,title:ent.querySelector('strong')&&ent.querySelector('strong').textContent||''});return}
      var lp=e.target.closest('[data-local-playlist]');if(lp){navigate('playlist-detail',{id:lp.dataset.localPlaylist});return}
      var pp=e.target.closest('[data-play-playlist]');if(pp){e.stopPropagation();var p=(S.local.playlists||[]).find(function(x){return String(x.id)===String(pp.dataset.playPlaylist)});if(p&&p.tracks.length)playTrack(p.tracks[0],p.tracks);return}
      var like=e.target.closest('[data-like]');if(like){e.stopPropagation();var lt=findTrack(like.dataset.like);if(lt)toggleLike(lt);return}
      var more=e.target.closest('[data-more]');if(more){e.stopPropagation();contextMenu(findTrack(more.dataset.more),e.clientX,e.clientY);return}
      var sf=e.target.closest('[data-show-file]');if(sf){api.showFile(sf.dataset.showFile);return}
      var ps=e.target.closest('[data-play-section]');if(ps){var sec=S.home&&S.home[Number(ps.dataset.playSection)];if(sec&&sec.tracks&&sec.tracks.length)playTrack(sec.tracks[0],sec.tracks);return}
      var play=e.target.closest('[data-play]');if(play){var t=findTrack(play.dataset.play);if(t){var group=play.closest('.track-group');var q=group?$$('[data-play]',group).map(function(x){return findTrack(x.dataset.play)}).filter(Boolean):null;playTrack(t,q)}return}
      if(!e.target.closest('#contextMenu'))$('#contextMenu').classList.add('hidden');
    });
    $('#nav').addEventListener('click',function(e){var b=e.target.closest('[data-route]');if(b)navigate(b.dataset.route,{})});
    $('#generatorFab').addEventListener('click',function(){navigate('generator',{})});
  }
  api.onLastFmAuth(async function(result){if(result.ok){await refreshLocal();toast('Last.fm connected as '+result.value.username);if(S.route==='settings-detail')renderSettingsDetail()}else toast(result.message||'Last.fm sign-in failed')});
  async function init(){
    try{
      S.bootstrap=await api.bootstrap();S.local=S.bootstrap.state;S.profile=S.bootstrap.profile||{};S.streamBase=S.bootstrap.streamBase;setTheme();installDelegation();installPlayer();updatePlayerUi();updateRootChrome();renderRoute();
    }catch(e){page.innerHTML='<div class="screen narrow">'+header('LastWave','')+empty('LastWave could not start',e.message,'settings')+'</div>'}
  }
  window.addEventListener('DOMContentLoaded',init);
})();