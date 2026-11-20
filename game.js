import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createMonsterModel } from './monster-model.js';

const CONFIG = {
  mazeSize: 41,          // 탐색 부담을 줄인 약 40x40 규모의 홀수 격자
  cellSize: 3,
  wallHeight: 3.3,
  stationCount: 7,
  staminaRunSeconds: 3,
  staminaRecoverySeconds: 10,
  detectorSeconds: 5,
  detectorCapacity: 5
};

const $ = id => document.getElementById(id);
const view = $('view');
let scene, camera, renderer, clock;
let maze = [], floorNoise = [], stations = [], stationMeshes = [];
let player, monster, exitMesh, exitCell, spawnCell;
let running = false, gameOver = false, sprintExhausted = false;
let paused = false, audioMuted = false, displayBrightness = 1.25, brightnessPercent = 100;
let stamina = 1, battery = CONFIG.detectorCapacity, detectorUntil = 0, detectorCooldownUntil = 0;
let yaw = 0, pitch = 0, joystick = {x:0,y:0}, runHeld = false;
let lastStep = 0, lastAmbient = 0, nextMonsterSound = 0;
let monsterState = 'wander', monsterTarget = null, lastSeen = null, searchUntil = 0;
let lastHeard = null, lastHeardAt = 0, path = [], pathRefresh = 0;
let monsterArousal = 0, lastNoiseEventAt = -Infinity, arousalDecayStart = 0;
let playerNoiseLevel = 0;
let nextLocationPing = 0, soundAlertUntil = 0, locationAlertUntil = 0, sightAlertUntil = 0;
let lastSurfaceCellKey = '', lastCreakAt = -Infinity;
let stationProgress = 0, activeStation = null, messageTimer = 0;
let audioCtx = null, masterGain = null, chargingOsc = null, chargingGain = null;
let monsterGroup, monsterVisible = false, monsterThroughWalls = false;
let monsterRig = null, monsterAnimTime = 0;
const cell = CONFIG.cellSize;
const half = (CONFIG.mazeSize - 1) / 2;
const worldSize = CONFIG.mazeSize * cell;
const tmpVec = new THREE.Vector3();

function randInt(n){ return Math.floor(Math.random()*n); }
function key(c){ return c.x+','+c.z; }
function inside(x,z){ return x>=0&&z>=0&&x<CONFIG.mazeSize&&z<CONFIG.mazeSize; }
function isOpen(x,z){ return inside(x,z)&&maze[z]?.[x]===0; }
function world(c){ return new THREE.Vector3((c.x-half)*cell,0,(c.z-half)*cell); }
function cellAt(pos){ return {x:Math.max(0,Math.min(CONFIG.mazeSize-1,Math.round(pos.x/cell+half))),z:Math.max(0,Math.min(CONFIG.mazeSize-1,Math.round(pos.z/cell+half)))}; }
function randomOpen(exclude=[]){
  const blocked=new Set(exclude.map(key));
  for(let i=0;i<5000;i++){const c={x:1+randInt(CONFIG.mazeSize-2),z:1+randInt(CONFIG.mazeSize-2)};if(isOpen(c.x,c.z)&&!blocked.has(key(c)))return c;}
  for(let z=1;z<CONFIG.mazeSize-1;z++)for(let x=1;x<CONFIG.mazeSize-1;x++)if(isOpen(x,z)&&!blocked.has(key({x,z})))return{x,z};
  return {x:1,z:1};
}
function generateMaze(){
  const n=CONFIG.mazeSize; maze=Array.from({length:n},()=>Array(n).fill(1));
  const stack=[{x:1,z:1}]; maze[1][1]=0;
  const dirs=[[0,-2],[2,0],[0,2],[-2,0]];
  while(stack.length){
    const cur=stack[stack.length-1];
    const options=dirs.map(([dx,dz])=>({x:cur.x+dx,z:cur.z+dz,dx,dz})).filter(p=>p.x>0&&p.z>0&&p.x<n-1&&p.z<n-1&&maze[p.z][p.x]===1);
    if(!options.length){stack.pop();continue;}
    const next=options[randInt(options.length)];
    maze[cur.z+next.dz/2][cur.x+next.dx/2]=0; maze[next.z][next.x]=0; stack.push({x:next.x,z:next.z});
  }
  // 완전히 막힌 느낌을 줄이되 모든 통로 연결성은 유지하는 작은 루프 추가
  for(let z=1;z<n-1;z++)for(let x=1;x<n-1;x++){
    if(maze[z][x]===1 && Math.random()<0.075){
      const horizontal=isOpen(x-1,z)&&isOpen(x+1,z);
      const vertical=isOpen(x,z-1)&&isOpen(x,z+1);
      if(horizontal||vertical)maze[z][x]=0;
    }
  }
  spawnCell=randomOpen();
  // BFS 거리상 가장 먼 통로를 출구로 선택
  const distances=bfsDistances(spawnCell); let far=spawnCell, max=-1;
  for(const [k,d] of distances){if(d>max){max=d;const [x,z]=k.split(',').map(Number);far={x,z};}}
  exitCell=far;
}
function bfsDistances(start){
  const q=[start], dist=new Map([[key(start),0]]);
  for(let i=0;i<q.length;i++){const c=q[i],d=dist.get(key(c));for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:c.x+dx,z:c.z+dz};if(isOpen(p.x,p.z)&&!dist.has(key(p))){dist.set(key(p),d+1);q.push(p);}}}
  return dist;
}
function findPath(start,goal){
  if(!goal)return [];
  const q=[start], prev=new Map([[key(start),null]]);
  for(let i=0;i<q.length;i++){const c=q[i];if(c.x===goal.x&&c.z===goal.z)break;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:c.x+dx,z:c.z+dz};if(isOpen(p.x,p.z)&&!prev.has(key(p))){prev.set(key(p),c);q.push(p);}}}
  if(!prev.has(key(goal)))return [];
  const out=[];let cur=goal;while(cur&&key(cur)!==key(start)){out.push(cur);cur=prev.get(key(cur));}return out.reverse();
}

function initThree(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x05080b); scene.fog=new THREE.FogExp2(0x080d11,0.008);
  camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.08,110);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false,depth:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75)); const portrait=innerHeight>innerWidth; renderer.setSize(portrait?innerHeight:innerWidth,portrait?innerWidth:innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=displayBrightness;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  view.replaceChildren(renderer.domElement);
  clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x9aaab4,0x252b30,.30));const light=new THREE.DirectionalLight(0x9eabb3,.11);light.position.set(-10,20,8);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.near=.5;light.shadow.camera.far=55;light.shadow.bias=-.00018;scene.add(light);scene.add(new THREE.AmbientLight(0x87939a,.16));const flashlight=new THREE.SpotLight(0xf0f7fa,9.5,38,Math.PI/5,.42,1.05);flashlight.position.set(0,0,0);flashlight.target.position.set(0,0,-1);flashlight.castShadow=true;flashlight.shadow.mapSize.set(1024,1024);flashlight.shadow.camera.near=.1;flashlight.shadow.camera.far=24;camera.add(flashlight);camera.add(flashlight.target);scene.add(camera);
}
function addBox(x,y,z,sx,sy,sz,mat){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function makeConcreteTexture(base){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,256,256);for(let i=0;i<2300;i++){const v=Math.random()>.5?255:0,a=.025+Math.random()*.11,s=1+Math.random()*4;g.fillStyle='rgba('+v+','+v+','+v+','+a+')';g.fillRect(Math.random()*256,Math.random()*256,s,s);}for(let i=0;i<6;i++){const x=Math.random()*256,y=Math.random()*256;g.strokeStyle='rgba(5,9,11,.25)';g.lineWidth=1.5;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.random()*20-10,y+20+Math.random()*30);g.lineTo(x+Math.random()*35-15,y+40+Math.random()*35);g.stroke();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t;}
function buildWorld(){
 const wallMat=new THREE.MeshStandardMaterial({color:0xb3bdc1,map:makeConcreteTexture('#788186'),roughness:1,bumpMap:makeConcreteTexture('#555b5e'),bumpScale:.12});
 const floorMat=new THREE.MeshStandardMaterial({color:0x9ca6aa,map:makeConcreteTexture('#50595d'),roughness:.96,bumpMap:makeConcreteTexture('#4a5052'),bumpScale:.08,metalness:.03});
 const ceilingMat=new THREE.MeshStandardMaterial({color:0x8b969a,map:makeConcreteTexture('#50595d'),roughness:1});
  const floor=addBox(0,-.18,0,worldSize,.36,worldSize,floorMat);floor.receiveShadow=true;
  const ceiling=addBox(0,CONFIG.wallHeight+.12,0,worldSize,.24,worldSize,ceilingMat);ceiling.receiveShadow=true;
  const wallGeo=new THREE.BoxGeometry(cell,CONFIG.wallHeight,cell);
  const dummy=new THREE.Object3D();
  let count=0;for(let z=0;z<CONFIG.mazeSize;z++)for(let x=0;x<CONFIG.mazeSize;x++)if(maze[z][x]){
    dummy.position.set((x-half)*cell,CONFIG.wallHeight/2,(z-half)*cell);dummy.updateMatrix();
    // 개별 mesh는 충돌·조명 계산이 비싸므로 인스턴스 사용
    count++;
  }
  const walls=new THREE.InstancedMesh(wallGeo,wallMat,count);let i=0;
  for(let z=0;z<CONFIG.mazeSize;z++)for(let x=0;x<CONFIG.mazeSize;x++)if(maze[z][x]){
    dummy.position.set((x-half)*cell,CONFIG.wallHeight/2,(z-half)*cell);dummy.updateMatrix();walls.setMatrixAt(i++,dummy.matrix);
  }
  walls.castShadow=true;walls.receiveShadow=true;scene.add(walls);walls.instanceMatrix.needsUpdate=true;
  // 낡은 비상등과 노출 배관
  for(let z=3;z<CONFIG.mazeSize-3;z+=7)for(let x=3;x<CONFIG.mazeSize-3;x+=7)if(isOpen(x,z)){const p=world({x,z});const housing=new THREE.Mesh(new THREE.BoxGeometry(.78,.13,.28),new THREE.MeshStandardMaterial({color:0x56636a,emissive:0xa8c4ce,emissiveIntensity:1.15,roughness:.72}));housing.position.set(p.x,2.82,p.z);scene.add(housing);const tube=new THREE.Mesh(new THREE.BoxGeometry(.62,.035,.17),new THREE.MeshBasicMaterial({color:0xf4fcff}));tube.position.set(p.x,2.735,p.z);scene.add(tube);const l=new THREE.PointLight(0xd8edf4,1.35,15,1.8);l.position.set(p.x,2.58,p.z);scene.add(l);}
  const pm=new THREE.MeshStandardMaterial({color:0x343d40,metalness:.62,roughness:.72});for(let z=4;z<CONFIG.mazeSize-4;z+=9)for(let x=4;x<CONFIG.mazeSize-5;x++)if(isOpen(x,z)&&isOpen(x+1,z)&&isOpen(x+2,z)&&Math.random()<.12){const p=world({x,z}),pipe=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,cell*2.5,7),pm);pipe.rotation.z=Math.PI/2;pipe.position.set(p.x,2.72,p.z);scene.add(pipe);x+=2;}
  floorNoise=Array.from({length:CONFIG.mazeSize},()=>Array(CONFIG.mazeSize).fill(null));
  for(let z=1;z<CONFIG.mazeSize-1;z++)for(let x=1;x<CONFIG.mazeSize-1;x++)if(isOpen(x,z)&&Math.random()<.04){
    floorNoise[z][x]=['creak','metal','rubble','water'][randInt(4)];
    // 소음 타일은 외형으로 구분할 수 없도록 시각적 표식을 생성하지 않는다.
  }
}
function makeMarker(color,emissive=0){
  return new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:.6,roughness:.65});
}
function buildExit(){
  const p=world(exitCell);const g=new THREE.Group();
  const frameMat=makeMarker(0x69747d,0x17212a);
  const post1=new THREE.Mesh(new THREE.BoxGeometry(.22,2.8,.3),frameMat);post1.position.set(-.9,1.4,0);g.add(post1);
  const post2=post1.clone();post2.position.x=.9;g.add(post2);
  const top=new THREE.Mesh(new THREE.BoxGeometry(2, .22,.3),frameMat);top.position.y=2.8;g.add(top);
  const glow=new THREE.Mesh(new THREE.BoxGeometry(1.25,1.9,.12),makeMarker(0x7d9a88,0x284c39));glow.position.set(0,1.1,0);g.add(glow);
  g.position.set(p.x,0,p.z);g.rotation.y=Math.random()*Math.PI*2;scene.add(g);exitMesh=g;
}
function buildStations(){
  stations=[];stationMeshes=[];
  for(let i=0;i<CONFIG.stationCount;i++)spawnStation();
}
function spawnStation(extra=[]){
  const exclusions=[spawnCell,exitCell,...stations.map(s=>s.cell),cellAt(player.position),cellAt(monster.position),...extra];
  const c=randomOpen(exclusions);stations.push({cell:c,mesh:null});
  const p=world(c),g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.52,.6,.22,12),makeMarker(0x687783,0x17232c));base.position.y=.11;g.add(base);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.75,10),makeMarker(0x9bc9d0,0x2b8290));core.position.y=.58;g.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.045,6,18),makeMarker(0xb6d9dc,0x387a82));ring.rotation.x=Math.PI/2;ring.position.y=.35;g.add(ring);
  g.position.set(p.x,0,p.z);scene.add(g);stations[stations.length-1].mesh=g;stationMeshes.push(g);
}
function removeStation(s){if(!s||!stations.includes(s))return;const old={...s.cell};if(s.mesh)scene.remove(s.mesh);stations=stations.filter(v=>v!==s);stationMeshes=stationMeshes.filter(v=>v!==s.mesh);spawnStation([old]);}
function buildMonster(){
  if(monsterGroup)scene.remove(monsterGroup);
  monsterRig=createMonsterModel(THREE);
  monsterGroup=monsterRig.group;
  monsterGroup.visible=true;
  monsterGroup.traverse(o=>{
    if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}
  });
  scene.add(monsterGroup);
  monsterVisible=true;monsterThroughWalls=false;monsterAnimTime=0;
}
function setMonsterVisible(on,throughWalls=false){if(!monsterGroup)return;if(monsterVisible===on&&monsterThroughWalls===throughWalls)return;monsterVisible=on;monsterThroughWalls=throughWalls;monsterGroup.visible=on;monsterGroup.traverse(o=>{if(o.isMesh){o.renderOrder=on?8:0;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){m.depthTest=!throughWalls;m.depthWrite=!throughWalls;m.needsUpdate=true;}}});}
function setCamera(){
  camera.position.copy(player.position);camera.position.y=1.62;
  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
}
function setupPlayerAndMonster(){
  const p=world(spawnCell);player={position:new THREE.Vector3(p.x,0,p.z),radius:.34};
  const reach=bfsDistances(spawnCell),opts=[];for(const [k,d] of reach)if(d>=9&&d<=20){const [x,z]=k.split(',').map(Number);opts.push({x,z});}const mc=opts.length?opts[randInt(opts.length)]:randomOpen([spawnCell,exitCell]);const mp=world(mc);monster={position:new THREE.Vector3(mp.x,0,mp.z),cell:mc};
  buildMonster();buildExit();buildStations();setCamera();
}
function ensureAudio(){
  if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();return;}
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain();masterGain.gain.value=.55;masterGain.connect(audioCtx.destination);
  chargingGain=audioCtx.createGain();chargingGain.gain.value=0;chargingGain.connect(masterGain);
  chargingOsc=audioCtx.createOscillator();chargingOsc.type='sine';chargingOsc.frequency.value=118;chargingOsc.connect(chargingGain);chargingOsc.start();
}
function tone(freq,duration,type='sine',volume=.12,slide=0){
  if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(25,freq+slide),audioCtx.currentTime+duration);
  g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(masterGain);o.start();o.stop(audioCtx.currentTime+duration+.03);
}
function noiseBurst(duration=.16,volume=.08,filter=700){
  if(!audioCtx)return;const size=Math.floor(audioCtx.sampleRate*duration),buf=audioCtx.createBuffer(1,size,audioCtx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*(1-i/size);
  const src=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();src.buffer=buf;f.type='lowpass';f.frequency.value=filter;g.gain.value=volume;src.connect(f);f.connect(g);g.connect(masterGain);src.start();
}
function breathingSound(){
  // 걷는 동안 스태미나가 실제 회복되는 경우에만 낮은 헐떡임을 반복
  noiseBurst(.26,.035,420);tone(72,.32,'sine',.045,-15);
  emitSound(cellAt(player.position),'breath',.38);
}
function playNoise(kind,position,volume=1){
  const c=cellAt(position);if(kind!=='monster')emitSound(c,kind,volume);
  if(kind==='detector'){tone(980,.12,'sine',.16,-420);tone(560,.24,'sine',.1,-200);}
  else if(kind==='charge'){tone(160,.2,'sine',.07,25);noiseBurst(.12,.025,900);}
  else if(kind==='creak'){tone(115,.28,'triangle',.12,-55);}
  else if(kind==='metal'){tone(380,.18,'triangle',.12,-170);tone(210,.2,'triangle',.06,-50);}
  else if(kind==='rubble'){noiseBurst(.24,.08,1100);}
  else if(kind==='water'){noiseBurst(.22,.06,1800);}
  else if(kind==='run'){tone(65,.08,'triangle',.045,-15);}
  else if(kind==='monster'){tone(58,.75,'sawtooth',.055,-25);noiseBurst(.55,.06,300);}
}
function emitSound(c,type,volume){
  if(!c)return;
  const now=performance.now()/1000;
  const mc=cellAt(monster.position);
  const audible=soundCanBeHeard(c,mc,volume,type);

  // 플레이어가 발생시킨 소리의 순간 크기. 괴물의 청취 여부와는 독립적이다.
  const noisePeaks={detector:100,charge:58,creak:42,metal:48,rubble:38,water:32,run:27,breath:18};
  const peak=(noisePeaks[type]||35)*Math.max(.35,volume);
  playerNoiseLevel=Math.max(playerNoiseLevel,Math.min(100,peak));

  // 괴물이 실제로 들을 수 있는 소음만 흥분도에 반영한다.
  // 첫 소음은 기록만 하고, 3초 안에 두 번째 소음이 들려야 상승이 시작된다.
  if(audible){
    if(now-lastNoiseEventAt<=3){
      monsterArousal=Math.min(100,monsterArousal+1.8+Math.min(1.2,Math.max(0,volume)*.8));
    }
    lastNoiseEventAt=now;
    // 마지막 소음 이후 3초 유지 + 추가 5초 정적이 지나야 감소가 시작된다.
    arousalDecayStart=now+8;
  }

  // 직접 추격 중에는 소리 위치로 AI 목표를 덮어쓰지 않지만,
  // 위의 흥분도 계산은 계속 적용한다.
  if(monsterState==='chase'||!audible)return;
  lastHeard={cell:{x:c.x,z:c.z},type,volume};lastHeardAt=now;
  soundAlertUntil=Math.max(soundAlertUntil,now+8);
  monsterTarget={...c};monsterState='investigate';pathRefresh=0;
}
function wallCountBetween(a,b){
  let blocked=0;const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))*2;
  for(let i=1;i<steps;i++){const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),z=Math.round(a.z+(b.z-a.z)*t);if(!isOpen(x,z))blocked++;}
  return blocked;
}
function soundCanBeHeard(a,b,volume,type){
  const d=Math.hypot(a.x-b.x,a.z-b.z),walls=wallCountBetween(a,b);
  const effective=d+walls*1.5;

  // 숨소리와 바닥 삐걱임은 바로 근처에서만 들린다.
  // 감지기와 충전음은 기존처럼 벽을 감안해도 먼 거리까지 전달된다.
  if(type==='breath'||type==='creak')return effective<=2.0;
  // 달리기 발자국은 가까운 거리에서만 들리고, 걷기 발자국 이벤트는 발생시키지 않는다.
  if(type==='run')return effective<=4.0;
  if(type==='detector'||type==='charge')return effective<=(volume*14+1);
  return effective<=(volume*14+1);
}
function hasLineOfSight(a,b){
  const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))*3;
  for(let i=1;i<steps;i++){const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),z=Math.round(a.z+(b.z-a.z)*t);if(!isOpen(x,z))return false;}return true;
}
function showMessage(text,duration=1900){const e=$('message');e.textContent=text;e.classList.add('show');clearTimeout(messageTimer);messageTimer=setTimeout(()=>e.classList.remove('show'),duration);}
let detectorScanEffect = null;
function triggerDetectorScan(){
  if(detectorScanEffect){
    scene.remove(detectorScanEffect.group);
    detectorScanEffect.geometry.dispose();
    detectorScanEffect.material.dispose();
    detectorScanEffect=null;
  }
  const origin=player.position.clone();
  const radius=40;
  const radiusCells=Math.ceil(radius/cell);
  const positions=[];
  const addLine=(x1,y1,z1,x2,y2,z2)=>{
    positions.push(x1,y1,z1,x2,y2,z2);
  };

  // 바닥과 천장: 플레이어를 중심으로 한 원형 범위 안에 촘촘한 스캔 격자 생성
  const gridStep=.6;
  for(let offset=-radius;offset<=radius;offset+=gridStep){
    const extent=Math.sqrt(Math.max(0,radius*radius-offset*offset));
    for(const y of [.018,CONFIG.wallHeight-.018]){
      addLine(origin.x+offset,y,origin.z-extent,origin.x+offset,y,origin.z+extent);
      addLine(origin.x-extent,y,origin.z+offset,origin.x+extent,y,origin.z+offset);
    }
  }

  // 벽의 통로 쪽 면마다 격자를 배치해 파동이 모서리를 따라 이어지는 느낌 구현
  const center=cellAt(origin);
  for(let z=Math.max(0,center.z-radiusCells);z<=Math.min(CONFIG.mazeSize-1,center.z+radiusCells);z++){
    for(let x=Math.max(0,center.x-radiusCells);x<=Math.min(CONFIG.mazeSize-1,center.x+radiusCells);x++){
      if(!maze[z][x])continue;
      const wx=(x-half)*cell,wz=(z-half)*cell;
      if(Math.hypot(wx-origin.x,wz-origin.z)>radius+cell)continue;
      const faces=[[1,0],[-1,0],[0,1],[0,-1]];
      for(const [dx,dz] of faces){
        if(!isOpen(x+dx,z+dz))continue;
        const y0=.025,y1=CONFIG.wallHeight-.025;
        if(dx!==0){
          const px=wx+dx*cell/2+dx*.018;
          for(let u=-cell/2;u<=cell/2+.001;u+=gridStep){
            const zz=wz+u;
            addLine(px,y0,zz,px,y1,zz);
          }
          for(let y=y0;y<=y1+.001;y+=gridStep){
            addLine(px,y,wz-cell/2,px,y,wz+cell/2);
          }
        }else{
          const pz=wz+dz*cell/2+dz*.018;
          for(let u=-cell/2;u<=cell/2+.001;u+=gridStep){
            const xx=wx+u;
            addLine(xx,y0,pz,xx,y1,pz);
          }
          for(let y=y0;y<=y1+.001;y+=gridStep){
            addLine(wx-cell/2,y,pz,wx+cell/2,y,pz);
          }
        }
      }
    }
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.ShaderMaterial({
    uniforms:{
      uOrigin:{value:new THREE.Vector2(origin.x,origin.z)},
      uTime:{value:0},
      uColor:{value:new THREE.Color(0x65eaff)}
    },
    vertexShader:`varying vec3 vWorldPosition;
      void main(){
        vec4 worldPosition=modelMatrix*vec4(position,1.0);
        vWorldPosition=worldPosition.xyz;
        gl_Position=projectionMatrix*viewMatrix*worldPosition;
      }`,
    fragmentShader:`uniform vec2 uOrigin;
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vWorldPosition;
      void main(){
        float distanceFromSource=distance(vWorldPosition.xz,uOrigin);
        float waveFront=uTime*15.0;
        float ring=1.0-smoothstep(.12,1.45,abs(distanceFromSource-waveFront));
        float trail=exp(-max(waveFront-distanceFromSource,0.0)*.19)*step(distanceFromSource,waveFront);
        float fade=1.0-smoothstep(2.05,2.65,uTime);
        float flicker=.88+.12*sin(uTime*21.0+vWorldPosition.x*2.7+vWorldPosition.y*4.1+vWorldPosition.z*2.2);
        float alpha=clamp((ring*.95+trail*.34)*fade*flicker,0.0,.92);
        if(alpha<.012)discard;
        gl_FragColor=vec4(uColor,alpha);
      }`,
    transparent:true,
    blending:THREE.AdditiveBlending,
    depthTest:true,
    depthWrite:false,
    side:THREE.DoubleSide,
    toneMapped:false
  });
  const lines=new THREE.LineSegments(geometry,material);
  lines.renderOrder=3;
  lines.frustumCulled=false;
  scene.add(lines);
  detectorScanEffect={group:lines,geometry,material,startedAt:performance.now()/1000};
}
function updateDetectorScan(now){
  if(!detectorScanEffect)return;
  const elapsed=now-detectorScanEffect.startedAt;
  detectorScanEffect.material.uniforms.uTime.value=elapsed;
  if(elapsed>=2.7){
    scene.remove(detectorScanEffect.group);
    detectorScanEffect.geometry.dispose();
    detectorScanEffect.material.dispose();
    detectorScanEffect=null;
  }
}

function useDetector(){
  if(!running||gameOver)return;
  const now=performance.now()/1000;
  if(activeStation||now<detectorCooldownUntil)return;
  if(battery<=0){showMessage('감지기 배터리가 부족하다.');return;}
  battery--;detectorUntil=now+CONFIG.detectorSeconds;detectorCooldownUntil=now+5;
  triggerDetectorScan();
  setMonsterVisible(true,true);playNoise('detector',player.position,1.15);
  updateHud();
}
function updateSoundMeters(dt){
  // 짧은 큰 소리는 빠르게 치솟고 빠르게 가라앉는다.
  // 작은 소리가 반복되면 이전 잔량 위로 작은 파동이 겹쳐 낮은 범위에서 흔들린다.
  playerNoiseLevel*=Math.exp(-dt/.34);
  if(playerNoiseLevel<.35)playerNoiseLevel=0;
  const noiseFill=$('noiseFill'),noiseText=$('noiseText');
  const arousalFill=$('arousalFill'),arousalText=$('arousalText');
  if(noiseFill)noiseFill.style.width=playerNoiseLevel.toFixed(1)+'%';
  if(noiseText)noiseText.textContent=Math.round(playerNoiseLevel)+'%';
  if(arousalFill)arousalFill.style.width=monsterArousal.toFixed(1)+'%';
  if(arousalText)arousalText.textContent=Math.round(monsterArousal)+'%';
}
function updateHud(){
  $('battery').textContent=battery+' / '+CONFIG.detectorCapacity;$('batteryFill').style.width=(battery/CONFIG.detectorCapacity*100)+'%';
  $('staminaText').textContent=Math.round(stamina*100)+'%';$('staminaFill').style.width=(stamina*100)+'%';
  $('scanBtn').disabled=battery<=0||!!activeStation||performance.now()/1000<detectorCooldownUntil;
}
function collides(x,z){
  const r=player.radius;
  const checks=[[x-r,z-r],[x+r,z-r],[x-r,z+r],[x+r,z+r]];
  return checks.some(([px,pz])=>{const c=cellAt({x:px,z:pz});return !isOpen(c.x,c.z);});
}
function movePlayer(dt){
  const mag=Math.hypot(joystick.x,joystick.y);if(mag<.08)return false;
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const dir=forward.clone().multiplyScalar(-joystick.y).add(right.multiplyScalar(joystick.x)).normalize();
  const wantsRun=runHeld&&!sprintExhausted&&stamina>0.002;
  const speed=wantsRun?5.0:2.35;
  const dx=dir.x*speed*dt,dz=dir.z*speed*dt;
  let moved=false;
  if(!collides(player.position.x+dx,player.position.z)){player.position.x+=dx;moved=true;}
  if(!collides(player.position.x,player.position.z+dz)){player.position.z+=dz;moved=true;}
  return moved;
}
function distanceToMonster(){return monster.position.distanceTo(player.position);}
function updatePlayer(dt,now){
  const isMoving=Math.hypot(joystick.x,joystick.y)>.08;
  const wantsRun=isMoving&&runHeld&&!sprintExhausted&&stamina>0.001;
  if(wantsRun){const before=stamina;stamina=Math.max(0,stamina-dt/CONFIG.staminaRunSeconds);if(stamina<=0){sprintExhausted=true;if(before>.001)showMessage('스태미나가 부족합니다.');}}
  else stamina=Math.min(1,stamina+dt/CONFIG.staminaRecoverySeconds);
  if(!runHeld&&stamina>0.001)sprintExhausted=false;
  const moved=movePlayer(dt);
  // 숨소리는 달리기 중·완충 상태에는 없고, 걷는 중 실제 회복 중일 때만 발생
  if(!wantsRun&&stamina<.999&&now-lastBreath>=1.35){breathingSound();lastBreath=now;}
  if(moved&&now-lastStep>(wantsRun ? 0.34 : 0.72)){
    lastStep=now;const c=cellAt(player.position),surface=floorNoise[c.z]?.[c.x],surfaceKey=key(c);
    if(surface&&surfaceKey!==lastSurfaceCellKey){
      lastSurfaceCellKey=surfaceKey;
      if(surface==='creak'){
        if(now-lastCreakAt>=8+Math.random()*4){playNoise('creak',player.position,wantsRun?1.25:.72);lastCreakAt=now;}
      }else playNoise(surface,player.position,wantsRun?1.25:.72);
    }else if(!surface){lastSurfaceCellKey=surfaceKey;if(wantsRun)playNoise('run',player.position,1.15);}
  }
  if(!isMoving)runHeld=false;
  const here=cellAt(player.position);
  // 충전 구역: 1초마다 배터리 1칸, 5초 완충. 도중 이탈하면 해당 장치 소멸.
  const station=stations.find(s=>s.cell.x===here.x&&s.cell.z===here.z);
  if(station&&battery<CONFIG.detectorCapacity){
    if(activeStation!==station){activeStation=station;stationProgress=0;}
    stationProgress+=dt;
    if(chargingGain)chargingGain.gain.setTargetAtTime(.075,audioCtx.currentTime,.08);
    if(now-lastChargeSound>.95){playNoise('charge',player.position,.85);lastChargeSound=now;}
    while(stationProgress>=1&&battery<CONFIG.detectorCapacity){stationProgress-=1;battery++;updateHud();showMessage('배터리 충전 중 · '+battery+'/5',900);}
    if(battery>=CONFIG.detectorCapacity){if(chargingGain&&audioCtx)chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.06);activeStation=null;stationProgress=0;removeStation(station);}
  }else if(activeStation){if(chargingGain&&audioCtx)chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.06);const used=activeStation;activeStation=null;stationProgress=0;removeStation(used);
  }else if(chargingGain&&audioCtx){chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
  const detectorActive=now<detectorUntil;setMonsterVisible(true,detectorActive);
  if(player.position.distanceTo(world(exitCell))<1.55)finish(true);
  updateHud();
}
let lastBreath=0,lastChargeSound=0;
function monsterUpdate(dt,now){
  if(now>=arousalDecayStart&&monsterArousal>0){
    monsterArousal=Math.max(0,monsterArousal-dt*4.5);
  }
  const pc=cellAt(player.position),mc=cellAt(monster.position);
  const distance=monster.position.distanceTo(player.position);
  // 20~40초마다 플레이어의 그 순간 위치만 전달한다. 실시간 추적 정보는 아니다.
  if(now>=nextLocationPing){
    const reportedPosition={...pc};
    locationAlertUntil=now+15;
    if(monsterState!=='chase'){
      monsterTarget=reportedPosition;
      monsterState='investigate';
      pathRefresh=0;
    }
    nextLocationPing=now+20+Math.random()*20;
  }
  const sees=distance<cell*8&&hasLineOfSight(mc,pc);
  if(sees){
    sightAlertUntil=now+12;
    monsterState='chase';lastSeen={...pc};searchUntil=now+12;monsterTarget={...pc};
  }else if(monsterState==='chase'){
    if(lastSeen){monsterState='search';monsterTarget={...lastSeen};searchUntil=now+12;}
  }
  if(monsterState==='investigate'&&monsterTarget&&mc.x===monsterTarget.x&&mc.z===monsterTarget.z){
    monsterState='search';searchUntil=Math.max(searchUntil,now+5);
  }
  if(monsterState==='search'&&now>searchUntil){
    if(lastHeard&&now-lastHeardAt<16){monsterState='investigate';monsterTarget={...lastHeard.cell};}
    else{monsterState='wander';monsterTarget=null;}
  }
  if(monsterState==='wander'&&(!monsterTarget|| (mc.x===monsterTarget.x&&mc.z===monsterTarget.z)))monsterTarget=randomOpen([exitCell,spawnCell]);
  if(monsterState==='chase'&&lastSeen)monsterTarget={...lastSeen};
  if(now-pathRefresh>.55||path.length===0){path=findPath(mc,monsterTarget);pathRefresh=now;}
  let targetPoint=null;
  if(path.length){targetPoint=world(path[0]);}
  else if(monsterTarget)targetPoint=world(monsterTarget);
  // 같은 통로 칸에 들어온 뒤에는 칸 중앙이 아니라 플레이어의 실제 좌표를 추격한다.
  // 그렇지 않으면 플레이어가 칸 가장자리에 정지했을 때 포획 거리까지 접근하지 못할 수 있다.
  if(monsterState==='chase'&&mc.x===pc.x&&mc.z===pc.z){
    targetPoint=new THREE.Vector3(player.position.x,0,player.position.z);
  }
  const alertLevel=now<sightAlertUntil?4:now<locationAlertUntil?3:now<soundAlertUntil?2:1;
  // 흥분도 0~100%에 비례해 속도를 2.35~4.80으로 부드럽게 보간한다.
  const speed=2.35+(4.8-2.35)*(monsterArousal/100);
  let moving=false;
  if(targetPoint){
    const dx=targetPoint.x-monster.position.x,dz=targetPoint.z-monster.position.z,len=Math.hypot(dx,dz);
    if(len<.25){if(path.length)path.shift();}
    else{const step=Math.min(len,speed*dt);monster.position.x+=dx/len*step;monster.position.z+=dz/len*step;moving=true;}
  }
  monsterAnimTime+=dt;
  const gaitRate=alertLevel>=4?10.5:alertLevel>=3?7.2:3.8;
  const stride=moving?(alertLevel>=4?.62:alertLevel>=3?.38:.17):.035;
  const gait=Math.sin(monsterAnimTime*gaitRate)*stride;
  if(monsterRig){
    monsterRig.armLeft.rotation.x=gait;
    monsterRig.armRight.rotation.x=-gait;
    monsterRig.armLeft.rotation.z=-.08+Math.abs(gait)*.12;
    monsterRig.armRight.rotation.z=.08-Math.abs(gait)*.12;
    monsterRig.legLeft.rotation.x=-gait*.72;
    monsterRig.legRight.rotation.x=gait*.72;
    monsterRig.head.rotation.x=(alertLevel>=4?-.13:-.035)+Math.sin(monsterAnimTime*1.25)*.025;
    monsterRig.head.rotation.z=Math.sin(monsterAnimTime*.82)*.035+(alertLevel>=2?.025:0);
  }
  const bodyBob=moving?Math.abs(Math.sin(monsterAnimTime*gaitRate))*.035:Math.sin(monsterAnimTime*1.1)*.012;
  monsterGroup.position.set(monster.position.x,bodyBob,monster.position.z);
  monsterGroup.rotation.y=Math.atan2(player.position.x-monster.position.x,player.position.z-monster.position.z);
  if(distance<.9)finish(false);
  if(now>nextMonsterSound){nextMonsterSound=now+30+Math.random()*30;if(distance<cell*14){playNoise('monster',monster.position,.65);}}
}
function updateAmbient(now){
  if(now-lastAmbient>12){lastAmbient=now;if(Math.random()<.35)tone(42+Math.random()*18,1.4,'sine',.018,-8);}
}
function drawMinimap(now){
  const canvas=$('minimap');
  if(!canvas||!player||!maze.length)return;
  const ctx=canvas.getContext('2d'),size=canvas.width,c=size/2,r=7,step=size/(r*2+1);
  const gx=player.position.x/cell+half,gz=player.position.z/cell+half,pc=cellAt(player.position);
  const offsetX=gx-pc.x,offsetZ=gz-pc.z;
  ctx.clearRect(0,0,size,size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c,c,size/2-2,0,Math.PI*2);
  ctx.clip();
  ctx.fillStyle='#10171c';
  ctx.fillRect(0,0,size,size);
  ctx.save();
  ctx.translate(c,c);
  ctx.rotate(yaw);
  for(let dz=-r-1;dz<=r+1;dz++)for(let dx=-r-1;dx<=r+1;dx++){
    const x=pc.x+dx,z=pc.z+dz,px=(dx-offsetX)*step-step/2,py=(dz-offsetZ)*step-step/2;
    ctx.fillStyle=!inside(x,z)?'#080d11':maze[z][x]?'#87949b':'#293940';
    ctx.fillRect(px,py,step+.5,step+.5);
    if(exitCell.x===x&&exitCell.z===z){
      ctx.fillStyle='#e2d18a';
      ctx.fillRect(px+step*.27,py+step*.27,step*.46,step*.46);
    }
    if(stations.some(s=>s.cell.x===x&&s.cell.z===z)){
      ctx.fillStyle='#66d4d2';
      ctx.beginPath();
      ctx.arc((dx-offsetX)*step,(dz-offsetZ)*step,step*.22,0,Math.PI*2);
      ctx.fill();
    }
  }
  if(now<detectorUntil){
    const dx=(monster.position.x-player.position.x)/cell,dz=(monster.position.z-player.position.z)/cell;
    if(Math.abs(dx)<=r+.5&&Math.abs(dz)<=r+.5){
      ctx.fillStyle='#ff3434';
      ctx.shadowColor='#ff2424';
      ctx.shadowBlur=10;
      ctx.beginPath();
      ctx.arc(dx*step,dz*step,step*.36,0,Math.PI*2);
      ctx.fill();
      ctx.shadowBlur=0;
    }
  }
  ctx.restore();
  ctx.fillStyle='#f4f6f7';
  ctx.strokeStyle='#101820';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(c,c-step*.48);
  ctx.lineTo(c+step*.34,c+step*.38);
  ctx.lineTo(c,c+step*.2);
  ctx.lineTo(c-step*.34,c+step*.38);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle='#c0ccd2';
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.arc(c,c,size/2-1.5,0,Math.PI*2);
  ctx.stroke();
}
function animate(){
  requestAnimationFrame(animate);if(!renderer)return;
  const dt=Math.min(clock.getDelta(),.05),now=performance.now()/1000;
  if(running&&!gameOver){updatePlayer(dt,now);monsterUpdate(dt,now);updateAmbient(now);setCamera();}
  updateSoundMeters(dt);
  drawMinimap(now);
  updateDetectorScan(now);
  if(exitMesh)exitMesh.rotation.y+=dt*.08;
  for(const s of stations)if(s.mesh){s.mesh.rotation.y+=dt*.35;}
  renderer.render(scene,camera);
}
function finish(success){
  if(gameOver)return;gameOver=true;running=false;paused=false;runHeld=false;$('pauseModal').classList.add('hidden');
  $('endEyebrow').textContent=success?'ESCAPED':'FOUND';
  $('endTitle').textContent=success?'탈출 성공':'괴물에게 붙잡혔다';
  $('endText').textContent=success?'미로를 빠져나왔다.':'다음에는 소리를 더 신중하게 관리해야 한다.';
  $('message').classList.remove('show');$('endScreen').classList.remove('hidden');$('game').classList.remove('playing');
}
function resetGame(){
  if(scene){
    while(scene.children.length)scene.remove(scene.children[0]);
    scene.add(new THREE.HemisphereLight(0x9aaab4,0x252b30,.30));
    const keyLight=new THREE.DirectionalLight(0x9eabb3,.11);keyLight.position.set(-10,20,8);scene.add(keyLight);
    scene.add(new THREE.AmbientLight(0x87939a,.16));
    scene.add(camera);
  }
  if(chargingGain&&audioCtx)chargingGain.gain.setValueAtTime(0,audioCtx.currentTime);
  paused=false;stamina=1;sprintExhausted=false;battery=CONFIG.detectorCapacity;detectorUntil=0;detectorCooldownUntil=0;joystick={x:0,y:0};runHeld=false;
  const now=performance.now()/1000;
  monsterState='wander';monsterTarget=null;lastSeen=null;lastHeard=null;lastHeardAt=0;path=[];pathRefresh=0;stationProgress=0;activeStation=null;lastStep=0;lastBreath=0;lastChargeSound=0;lastAmbient=0;nextMonsterSound=now+30+Math.random()*30;
  nextLocationPing=now+20+Math.random()*20;soundAlertUntil=0;locationAlertUntil=0;sightAlertUntil=0;lastSurfaceCellKey='';lastCreakAt=-Infinity;
  monsterArousal=0;lastNoiseEventAt=-Infinity;arousalDecayStart=0;playerNoiseLevel=0;
  generateMaze();buildWorld();setupPlayerAndMonster();updateHud();gameOver=false;
}
function startGame(){
  if(updatePending){window.location.reload();return;}
  ensureAudio();if(!renderer)initThree();resetGame();paused=false;$('pauseModal').classList.add('hidden');clock.start();running=true;
  $('startScreen').classList.add('hidden');$('endScreen').classList.add('hidden');
  $('game').classList.add('playing');
  if(screen.orientation?.lock)screen.orientation.lock('landscape').catch(()=>{});
  showMessage('소리를 조심해라. 출구는 하나다.',2400);
}
function updateAudioOutput(){
  if(!masterGain||!audioCtx)return;
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setTargetAtTime(audioMuted||paused?0:.55,audioCtx.currentTime,.035);
}
function pauseGame(){
  if(!running||gameOver||paused)return;
  paused=true;running=false;runHeld=false;joystick={x:0,y:0};
  $('runBtn').classList.remove('active');
  $('pauseModal').classList.remove('hidden');
  updateAudioOutput();
}
function resumeGame(){
  if(!paused||gameOver)return;
  paused=false;running=true;$('pauseModal').classList.add('hidden');
  updateAudioOutput();
}
function exitToMenu(){
  running=false;paused=false;gameOver=true;runHeld=false;joystick={x:0,y:0};
  if(chargingGain&&audioCtx)chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.03);
  $('pauseModal').classList.add('hidden');$('endScreen').classList.add('hidden');
  $('game').classList.remove('playing');$('message').classList.remove('show');
  $('startScreen').classList.remove('hidden');updateAudioOutput();
}
function bindControls(){
  const joy=$('joystick'),stick=$('stick');let joyPointer=null;
  function joyMove(e){if(joyPointer!==e.pointerId)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=35,len=Math.hypot(dx,dy);if(len>max){dx=dx/len*max;dy=dy/len*max;}joystick.x=dx/max;joystick.y=dy/max;stick.style.transform='translate('+dx+'px,'+dy+'px)';}
  joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e);});
  joy.addEventListener('pointermove',joyMove);
  const joyEnd=e=>{if(joyPointer===e.pointerId){joyPointer=null;joystick={x:0,y:0};stick.style.transform='';}};
  joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
  let lookPointer=null,lastX=0,lastY=0;
  renderer?.domElement.addEventListener('pointerdown',e=>{const portrait=innerHeight>innerWidth;if(portrait?e.clientY<innerHeight*.38:e.clientX<innerWidth*.38)return;lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;});
  window.addEventListener('pointermove',e=>{if(lookPointer!==e.pointerId)return;const rawX=e.clientX-lastX,rawY=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const portrait=innerHeight>innerWidth,dx=portrait?rawY:rawX,dy=portrait?-rawX:rawY;yaw-=dx*.0045;pitch=Math.max(-1.05,Math.min(1.05,pitch-dy*.0035));});
  window.addEventListener('pointerup',e=>{if(lookPointer===e.pointerId)lookPointer=null;});
  $('runBtn').addEventListener('pointerdown',e=>{e.preventDefault();runHeld=true;$('runBtn').classList.add('active');});
  const runEnd=()=>{runHeld=false;$('runBtn').classList.remove('active');};
  $('runBtn').addEventListener('pointerup',runEnd);$('runBtn').addEventListener('pointercancel',runEnd);$('runBtn').addEventListener('pointerleave',runEnd);
  $('pauseBtn').addEventListener('click',pauseGame);
  $('resumeBtn').addEventListener('click',resumeGame);
  $('soundToggleBtn').addEventListener('click',()=>{
    audioMuted=!audioMuted;
    $('soundToggleBtn').textContent=audioMuted?'소리 켜기':'소리 끄기';
    updateAudioOutput();
  });
  $('brightnessSlider').addEventListener('input',e=>{
    brightnessPercent=Number(e.target.value);
    displayBrightness=1.25*(brightnessPercent/100);
    $('brightnessValue').textContent=brightnessPercent+'%';
    if(renderer)renderer.toneMappingExposure=displayBrightness;
  });
  $('exitGameBtn').addEventListener('click',exitToMenu);
  $('scanBtn').addEventListener('click',useDetector);
  $('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);
  $('guideBtn').addEventListener('click',()=>{$('guideModal').classList.remove('hidden');});$('closeGuideBtn').addEventListener('click',()=>$('guideModal').classList.add('hidden'));$('menuBtn').addEventListener('click',()=>{if(updatePending){window.location.reload();return;}$('endScreen').classList.add('hidden');$('startScreen').classList.remove('hidden');});window.addEventListener('keydown',e=>{if(e.key==='Escape')$('guideModal').classList.add('hidden');});
  window.addEventListener('resize',()=>{if(!camera||!renderer)return;const portrait=innerHeight>innerWidth,w=portrait?innerHeight:innerWidth,h=portrait?innerWidth:innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){runHeld=false;joystick={x:0,y:0};}});
}
let updatePending=false;
function applyPendingUpdate(){
  if(updatePending){window.location.reload();}
}
function boot(){
  initThree();bindControls();generateMaze();buildWorld();setupPlayerAndMonster();updateHud();animate();
  if('serviceWorker' in navigator){
    window.addEventListener('load',async()=>{
      try{
        const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
        await registration.update();
        registration.addEventListener('updatefound',()=>{
          const worker=registration.installing;
          if(!worker)return;
          worker.addEventListener('statechange',()=>{
            if(worker.state==='installed'&&navigator.serviceWorker.controller){
              updatePending=true;
              worker.postMessage({type:'SKIP_WAITING'});
            }
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange',()=>{
          updatePending=true;
          if(!running&&!gameOver&&$('startScreen')&&!$('startScreen').classList.contains('hidden'))window.location.reload();
        });
        document.addEventListener('visibilitychange',()=>{
          if(!document.hidden)registration.update().catch(()=>{});
        });
        window.addEventListener('focus',()=>registration.update().catch(()=>{}));
      }catch(error){console.warn('SILENCE 업데이트 확인 실패:',error);}
    });
  }
}
boot();