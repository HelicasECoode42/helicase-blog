// HELICASE CD Player Canvas — Arc + track switching
// Three.js handles the 3D chassis + disc rotation.
(function() {
  'use strict';
  var K='helicase-playlist';
  var DEF=[{id:'d1',title:'I Really Want to Stay at Your House',artist:'Rosa Walton',cover:'/images/covers/track-01.svg',link:'https://music.163.com/',favorited:true},{id:'d2',title:'Blinding Lights',artist:'The Weeknd',cover:'/images/covers/track-02.svg',link:'https://music.163.com/'},{id:'d3',title:'Lemon',artist:'米津玄師',cover:'/images/covers/track-03.svg',link:'https://music.163.com/',favorited:true},{id:'d4',title:'夜に駆ける',artist:'YOASOBI',cover:'/images/covers/track-04.svg',link:'https://music.163.com/'},{id:'d5',title:'Duvet',artist:'Bôa',cover:'/images/covers/track-05.svg',link:'https://music.163.com/',favorited:true}];
  function load(){try{var r=localStorage.getItem(K);return r?JSON.parse(r):DEF;}catch(e){return DEF;}}
  function save(l){try{localStorage.setItem(K,JSON.stringify(l));}catch(e){}}
  function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;}

  var tracks=load(),currentIdx=0,switching=false;

  function calcArc(n,W,H,sz,gap){var out=[],span=(n-1)*(sz+gap);for(var i=0;i<n;i++){var t=n>1?i/(n-1)-0.5:0,x=t*span;var a=span>0?(4*H)/(span*span):0,y=-a*x*x+H;out.push({x:x,y:y,rotate:-16*t,scale:1-0.12*Math.abs(t)*2});}return out;}

  var mod=document.getElementById('cdp-module');if(!mod)return;
  var nowEl=document.getElementById('cdp-now-title'),arcEl=document.getElementById('cdp-arc');
  var prevBtn=document.getElementById('cdp-prev'),nextBtn=document.getElementById('cdp-next');
  var shuffleBtn=document.getElementById('cdp-shuffle');

  function renderArc(idx){
    if(!arcEl)return;
    var pos=calcArc(tracks.length,200,30,36,4);
    var covers=arcEl.querySelectorAll('.cdp-cover');
    while(covers.length>tracks.length){covers[covers.length-1].remove();covers=arcEl.querySelectorAll('.cdp-cover');}
    while(covers.length<tracks.length){
      var d=document.createElement('div');d.className='cdp-cover';
      d.innerHTML='<img src="" alt="" /><span class="cdp-fav-dot" style="display:none"></span>';
      d.addEventListener('click',function(){selectTrack(parseInt(this.getAttribute('data-idx')));});
      arcEl.appendChild(d);covers=arcEl.querySelectorAll('.cdp-cover');
    }
    for(var i=0;i<tracks.length;i++){
      var c=covers[i];c.setAttribute('data-idx',String(i));
      var img=c.querySelector('img');img.src=tracks[i].cover;img.alt=tracks[i].title;
      var dot=c.querySelector('.cdp-fav-dot');dot.style.display=tracks[i].favorited?'block':'none';
      c.classList.toggle('cdp-cover--active',i===idx);c.style.opacity=i===idx?'1':'0.5';
      var p=pos[i];c.style.transform='translate('+Math.round(p.x)+'px,'+Math.round(p.y)+'px) rotate('+Math.round(p.rotate)+'deg) scale('+p.scale.toFixed(2)+')';
      c.style.zIndex=i===idx?'3':'1';
    }
    if(nowEl)nowEl.textContent=tracks[idx]?tracks[idx].title:'';
    if(window.__cdPlayer3D&&tracks[idx])window.__cdPlayer3D.setCover(tracks[idx].cover);
  }

  function selectTrack(idx){
    if(idx===currentIdx||switching||tracks.length===0)return;
    switching=true;
    setTimeout(function(){currentIdx=idx;renderArc(idx);switching=false;},380);
  }

  if(prevBtn)prevBtn.addEventListener('click',function(e){e.preventDefault();selectTrack((currentIdx-1+tracks.length)%tracks.length);});
  if(nextBtn)nextBtn.addEventListener('click',function(e){e.preventDefault();selectTrack((currentIdx+1)%tracks.length);});
  if(shuffleBtn)shuffleBtn.addEventListener('click',function(e){e.preventDefault();tracks=shuffle(tracks);save(tracks);currentIdx=0;renderArc(0);});

  renderArc(0);
})();
