// HELICASE Music Page — Track switching + localStorage
// Three.js handles the 3D chassis + disc rotation.
(function(){
  'use strict';
  var K='helicase-playlist';
  var DEF=[{id:'d1',title:'I Really Want to Stay at Your House',artist:'Rosa Walton',cover:'/images/covers/track-01.svg',link:'https://music.163.com/',favorited:true},{id:'d2',title:'Blinding Lights',artist:'The Weeknd',cover:'/images/covers/track-02.svg',link:'https://music.163.com/'},{id:'d3',title:'Lemon',artist:'米津玄師',cover:'/images/covers/track-03.svg',link:'https://music.163.com/',favorited:true},{id:'d4',title:'夜に駆ける',artist:'YOASOBI',cover:'/images/covers/track-04.svg',link:'https://music.163.com/'},{id:'d5',title:'Duvet',artist:'Bôa',cover:'/images/covers/track-05.svg',link:'https://music.163.com/',favorited:true}];
  function load(){try{var r=localStorage.getItem(K);return r?JSON.parse(r):DEF;}catch(e){return DEF;}}
  function save(l){try{localStorage.setItem(K,JSON.stringify(l));}catch(e){}}
  function genId(){return't'+Date.now()+'_'+Math.random().toString(36).slice(2,6);}
  function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

  var tracks=load(),currentIdx=0,switching=false;

  function calcArc(n,W,H,sz,gap){var out=[],span=(n-1)*(sz+gap);for(var i=0;i<n;i++){var t=n>1?i/(n-1)-0.5:0,x=t*span;var a=span>0?(4*H)/(span*span):0,y=-a*x*x+H;out.push({x:x,y:y,rotate:-16*t,scale:1-0.12*Math.abs(t)*2});}return out;}

  var npTitle=document.getElementById('music-np-title'),machine=document.getElementById('music-machine');
  var prevBtn=document.getElementById('music-prev'),nextBtn=document.getElementById('music-next');
  var arcEl=document.getElementById('music-arc'),tlInner=document.getElementById('music-tracklist-inner');
  var shuffleBtn=document.getElementById('music-shuffle'),addBtn=document.getElementById('music-add-btn');
  var addForm=document.getElementById('music-add-form');
  var mfTitle=document.getElementById('mf-title'),mfArtist=document.getElementById('mf-artist');
  var mfCover=document.getElementById('mf-cover'),mfLink=document.getElementById('mf-link');
  var mfAudio=document.getElementById('mf-audio');
  var mfSave=document.getElementById('mf-save'),mfCancel=document.getElementById('mf-cancel');
  var audio=document.getElementById('music-audio'),playBtn=document.getElementById('music-play');
  var seek=document.getElementById('music-seek'),timeEl=document.getElementById('music-time');

  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function escAttr(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  function renderArc(idx){
    if(!arcEl)return;
    var pos=calcArc(tracks.length,460,70,56,6);
    var covers=arcEl.querySelectorAll('.music-cover');
    while(covers.length>tracks.length){covers[covers.length-1].remove();covers=arcEl.querySelectorAll('.music-cover');}
    while(covers.length<tracks.length){
      var d=document.createElement('div');d.className='music-cover';d.style.opacity='.55';
      d.innerHTML='<img src="" alt="" /><span class="music-fav-dot" style="display:none"></span>';
      d.addEventListener('click',function(){selectTrack(parseInt(this.getAttribute('data-idx')));});
      arcEl.appendChild(d);covers=arcEl.querySelectorAll('.music-cover');
    }
    for(var i=0;i<tracks.length;i++){
      var c=covers[i];c.setAttribute('data-idx',String(i));
      var img=c.querySelector('img');img.src=tracks[i].cover;img.alt=tracks[i].title;
      var dot=c.querySelector('.music-fav-dot');if(dot)dot.style.display=tracks[i].favorited?'block':'none';
      c.classList.toggle('music-cover--active',i===idx);c.style.opacity=i===idx?'1':'.55';
      var p=pos[i];c.style.transform='translate('+Math.round(p.x)+'px,'+Math.round(p.y)+'px) rotate('+Math.round(p.rotate)+'deg) scale('+p.scale.toFixed(2)+')';
      c.style.zIndex=i===idx?'3':'1';
    }
    if(npTitle)npTitle.textContent=tracks[idx]?tracks[idx].title:'';
    if(window.__musicPlayer3D&&tracks[idx])window.__musicPlayer3D.setCover(tracks[idx].cover);
  }

  function renderTracklist(idx){
    if(!tlInner)return;tlInner.innerHTML='';
    for(var i=0;i<tracks.length;i++){
      var t=tracks[i];
      var row=document.createElement('div');
      row.className='music-track'+(i===idx?' music-track--current':'');
      row.setAttribute('data-idx',String(i));
      row.innerHTML='<span class="music-track-num">'+String(i+1).padStart(2,'0')+'</span>'+
        '<span class="music-track-info"><span class="music-track-title">'+esc(t.title)+'</span><span class="music-track-artist">'+esc(t.artist)+'</span></span>'+
        (t.favorited?'<span class="music-track-heart">♥</span>':'')+
        '<a href="'+escAttr(t.link)+'" target="_blank" rel="noopener" class="music-track-ext">↗</a>'+
        '<button class="music-track-del" data-idx="'+i+'">×</button>';
      row.addEventListener('click',function(e){
        if(e.target.closest('.music-track-del')||e.target.closest('.music-track-ext'))return;
        selectTrack(parseInt(this.getAttribute('data-idx')));
      });
      row.querySelector('.music-track-del').addEventListener('click',function(e){
        e.stopPropagation();deleteTrack(parseInt(this.getAttribute('data-idx')));
      });
      tlInner.appendChild(row);
    }
  }

  function renderAll(idx){renderArc(idx);renderTracklist(idx);}

  function fmt(seconds){seconds=isFinite(seconds)?Math.floor(seconds):0;return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
  function hasAudio(track){return !!(track&&typeof track.audio==='string'&&track.audio.trim());}
  function syncPlayback(){
    var track=tracks[currentIdx],available=hasAudio(track);
    if(playBtn){playBtn.disabled=!available;playBtn.textContent=available?(audio&&!audio.paused?'pause':'play'):'source required';}
    if(seek){seek.disabled=!available;seek.value=audio&&audio.duration?String(Math.round(audio.currentTime/audio.duration*100)):'0';}
    if(timeEl)timeEl.textContent=fmt(audio&&audio.currentTime)+' / '+fmt(audio&&audio.duration);
  }
  function loadAudio(autoplay){
    if(!audio)return;
    var track=tracks[currentIdx];
    audio.pause();audio.removeAttribute('src');audio.load();
    if(hasAudio(track)){audio.src=track.audio;audio.load();if(autoplay)audio.play().catch(function(){});}
    syncPlayback();
  }

  function selectTrack(idx){
    if(idx===currentIdx||switching||tracks.length===0)return;
    switching=true;
    setTimeout(function(){
      var wasPlaying=audio&&!audio.paused;
      currentIdx=idx;renderAll(idx);loadAudio(wasPlaying);
      if(machine){machine.classList.add('raised');setTimeout(function(){machine.classList.remove('raised');},600);}
      switching=false;
    },400);
  }

  function deleteTrack(idx){
    if(tracks.length<=1)return;
    tracks.splice(idx,1);save(tracks);
    if(currentIdx>=tracks.length)currentIdx=tracks.length-1;
    renderAll(currentIdx);
  }

  function showAddForm(){addForm.style.display='flex';mfTitle.focus();}
  function hideAddForm(){addForm.style.display='none';mfTitle.value='';mfArtist.value='';mfCover.value='';mfAudio.value='';mfLink.value='';}
  function saveNewTrack(){
    var title=mfTitle.value.trim(),artist=mfArtist.value.trim();
    if(!title||!artist)return;
    tracks.push({id:genId(),title:title,artist:artist,cover:mfCover.value.trim()||'/images/covers/track-01.svg',audio:mfAudio.value.trim(),link:mfLink.value.trim()||'https://music.163.com/',favorited:false});
    save(tracks);hideAddForm();renderAll(currentIdx);
  }

  if(addBtn)addBtn.addEventListener('click',showAddForm);
  if(mfSave)mfSave.addEventListener('click',saveNewTrack);
  if(mfCancel)mfCancel.addEventListener('click',hideAddForm);
  if(shuffleBtn)shuffleBtn.addEventListener('click',function(){tracks=shuffle(tracks);save(tracks);currentIdx=0;renderAll(0);});
  if(prevBtn)prevBtn.addEventListener('click',function(){selectTrack((currentIdx-1+tracks.length)%tracks.length);});
  if(nextBtn)nextBtn.addEventListener('click',function(){selectTrack((currentIdx+1)%tracks.length);});
  if(playBtn)playBtn.addEventListener('click',function(){if(!audio||!hasAudio(tracks[currentIdx]))return;if(audio.paused)audio.play().catch(function(){});else audio.pause();});
  if(audio){audio.addEventListener('play',syncPlayback);audio.addEventListener('pause',syncPlayback);audio.addEventListener('timeupdate',syncPlayback);audio.addEventListener('loadedmetadata',syncPlayback);audio.addEventListener('ended',function(){if(nextBtn)nextBtn.click();});audio.addEventListener('error',function(){if(playBtn)playBtn.textContent='source failed';});}
  if(seek)seek.addEventListener('input',function(){if(audio&&audio.duration)audio.currentTime=Number(seek.value)/100*audio.duration;});
  document.addEventListener('keydown',function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;if(e.key==='ArrowLeft'&&prevBtn)prevBtn.click();if(e.key==='ArrowRight'&&nextBtn)nextBtn.click();if(e.key===' '&&playBtn){e.preventDefault();playBtn.click();}});

  renderAll(0);loadAudio(false);
})();
