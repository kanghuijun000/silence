import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const CONFIG = {
  mazeSize: 51,          // 약 50x50 규모의 홀수 격자
  cellSize: 3,
  wallHeight: 3.3,
  stationCount: 5,
  staminaRunSeconds: 10,
  staminaRecoverySeconds: 8,
  detectorSeconds: 5,
  detectorCapacity: 5
};

const $ = id => document.getElementById(id);
const view = $('view');
let scene, camera, renderer, clock;
let maze = [], floorNoise = [], stations = [], stationMeshes = [];
let player, monster, exitMesh, exitCell, spawnCell;
let running = false, gameOver = false, sprintExhausted = false;
let stamina = 1, battery = CONFIG.detectorCapacity, detectorUntil = 0;
let yaw = 0, pitch = 0, joystick = {x:0,y:0}, runHeld = false;
let lastStep = 0, lastAmbient = 0, nextMonsterSound = 0;
let monsterState = 'wander', monsterTarget = null, lastSeen = null, searchUntil = 0;
let lastHeard = null, lastHeardAt = 0, path = [], pathRefresh = 0;
let stationProgress = 0, activeStation = null, messageTimer = 0;
let audioCtx = null, masterGain = null, chargingOsc = null, chargingGain = null;
let monsterGroup, monsterVisible = false;
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
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x080d13); scene.fog=new THREE.FogExp2(0x080d13,0.027);
  camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.08,110);
  renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace; view.replaceChildren(renderer.domElement);
  clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x91a7bd,0x15191c,1.05));
  const light=new THREE.DirectionalLight(0xc2d1dc,.35);light.position.set(-10,20,8);scene.add(light);
  const ambient=new THREE.AmbientLight(0x34414e,.28);scene.add(ambient);
}
function addBox(x,y,z,sx,sy,sz,mat){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function buildWorld(){
  const wallMat=new THREE.MeshStandardMaterial({color:0x424b50,roughness:1});
  const floorMat=new THREE.MeshStandardMaterial({color:0x20282d,roughness:1});
  const ceilingMat=new THREE.MeshStandardMaterial({color:0x171d22,roughness:1});
  const floor=addBox(0,-.18,0,worldSize,.36,worldSize,floorMat);
  addBox(0,CONFIG.wallHeight+.12,0,worldSize,.24,worldSize,ceilingMat);
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
  scene.add(walls);walls.instanceMatrix.needsUpdate=true;
  // 벽면에 낮은 조명 느낌의 드문 표시등
  for(let z=2;z<CONFIG.mazeSize-2;z+=6)for(let x=2;x<CONFIG.mazeSize-2;x+=6)if(isOpen(x,z)){
    const p=world({x,z});const lamp=new THREE.PointLight(0x8ba6b8,.24,7,2);lamp.position.set(p.x,2.65,p.z);scene.add(lamp);
  }
  floorNoise=Array.from({length:CONFIG.mazeSize},()=>Array(CONFIG.mazeSize).fill(null));
  for(let z=1;z<CONFIG.mazeSize-1;z++)for(let x=1;x<CONFIG.mazeSize-1;x++)if(isOpen(x,z)&&Math.random()<.065){
    floorNoise[z][x]=['creak','metal','rubble','water'][randInt(4)];
    const p=world({x,z});const mark=addBox(p.x,.008,p.z,.42,.018,.42,new THREE.MeshStandardMaterial({color:0x697078,roughness:1,transparent:true,opacity:.18}));
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
function spawnStation(){
  const exclusions=[spawnCell,exitCell,...stations.map(s=>s.cell),cellAt(player.position),cellAt(monster.position)];
  const c=randomOpen(exclusions);stations.push({cell:c,mesh:null});
  const p=world(c),g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.52,.6,.22,12),makeMarker(0x687783,0x17232c));base.position.y=.11;g.add(base);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.75,10),makeMarker(0x9bc9d0,0x2b8290));core.position.y=.58;g.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.045,6,18),makeMarker(0xb6d9dc,0x387a82));ring.rotation.x=Math.PI/2;ring.position.y=.35;g.add(ring);
  g.position.set(p.x,0,p.z);scene.add(g);stations[stations.length-1].mesh=g;stationMeshes.push(g);
}
function removeStation(s){
  if(s.mesh)scene.remove(s.mesh);stations=stations.filter(v=>v!==s);stationMeshes=stations.filter(v=>v!==s.mesh);spawnStation();
}
function buildMonster(){
  monsterGroup=new THREE.Group();
  const dark=new THREE.MeshStandardMaterial({color:0x090b0e,roughness:.9});
  const skin=new THREE.MeshStandardMaterial({color:0x252c30,roughness:1});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.48,.95,4,7),dark);torso.position.y=1.35;monsterGroup.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.37,9,7),skin);head.position.y=2.15;monsterGroup.add(head);
  for(const x of [-.14,.14]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.045,6,5),new THREE.MeshBasicMaterial({color:0xb7c6b7}));eye.position.set(x,2.18,.32);monsterGroup.add(eye);}
  for(const x of [-.3,.3]){const limb=new THREE.Mesh(new THREE.CapsuleGeometry(.14,.85,3,5),dark);limb.position.set(x,.65,0);limb.rotation.z=x*.35;monsterGroup.add(limb);}
  monsterGroup.visible=false;scene.add(monsterGroup);monsterVisible=false;
}
function setMonsterVisible(on){monsterVisible=on;monsterGroup.visible=on;}
function setCamera(){
  camera.position.copy(player.position);camera.position.y=1.62;
  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
}
function setupPlayerAndMonster(){
  const p=world(spawnCell);player={position:new THREE.Vector3(p.x,0,p.z),radius:.34};
  const mc=randomOpen([spawnCell,exitCell]);const mp=world(mc);monster={position:new THREE.Vector3(mp.x,0,mp.z),cell:mc};
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
  // 이미 플레이어를 직접 추격 중이면 발소리가 추격 AI에 추가 이점을 주지 않는다.
  if(monsterState==='chase')return;
  lastHeard={cell:{x:c.x,z:c.z},type,volume};lastHeardAt=performance.now()/1000;
  const mc=cellAt(monster.position);const d=Math.hypot(mc.x-c.x,mc.z-c.z);
  if(soundCanBeHeard(c,mc,volume)){monsterTarget={...c};monsterState='investigate';pathRefresh=0;}
}
function wallCountBetween(a,b){
  let blocked=0;const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))*2;
  for(let i=1;i<steps;i++){const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),z=Math.round(a.z+(b.z-a.z)*t);if(!isOpen(x,z))blocked++;}
  return blocked;
}
function soundCanBeHeard(a,b,volume){
  const d=Math.hypot(a.x-b.x,a.z-b.z),walls=wallCountBetween(a,b);
  const effective=d+walls*1.5;return effective<=(volume*14+1);
}
function hasLineOfSight(a,b){
  const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))*3;
  for(let i=1;i<steps;i++){const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),z=Math.round(a.z+(b.z-a.z)*t);if(!isOpen(x,z))return false;}return true;
}
function showMessage(text,duration=1800){$('message').textContent=text;$('message').classList.add('show');messageTimer=duration;}
function useDetector(){
  if(!running||gameOver)return;
  if(battery<=0){showMessage('감지기 배터리가 부족하다.');return;}
  battery--;detectorUntil=performance.now()/1000+CONFIG.detectorSeconds;
  setMonsterVisible(true);playNoise('detector',player.position,1.15);showMessage('감지기 작동 · 5초 동안 괴물 탐지');
  updateHud();
}
function updateHud(){
  $('battery').textContent=battery+' / '+CONFIG.detectorCapacity;$('batteryFill').style.width=(battery/CONFIG.detectorCapacity*100)+'%';
  $('staminaText').textContent=Math.round(stamina*100)+'%';$('staminaFill').style.width=(stamina*100)+'%';
  $('scanBtn').disabled=battery<=0;
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
function updatePlayer(dt,now){
  const isMoving=Math.hypot(joystick.x,joystick.y)>.08;
  const wantsRun=isMoving&&runHeld&&!sprintExhausted&&stamina>0.001;
  if(wantsRun){stamina=Math.max(0,stamina-dt/CONFIG.staminaRunSeconds);if(stamina<=0)sprintExhausted=true;}
  else if(!runHeld)sprintExhausted=false;
  else if(isMoving)stamina=Math.min(1,stamina+dt/CONFIG.staminaRecoverySeconds);
  const moved=movePlayer(dt);
  // 숨소리는 달리기 중·완충 상태에는 없고, 걷는 중 실제 회복 중일 때만 발생
  if(!wantsRun&&isMoving&&stamina<.999&&now-lastBreath>=1.35){breathingSound();lastBreath=now;}
  if(moved&&now-lastStep>(wantsRun ? 0.34 : 0.72)){
    lastStep=now;const c=cellAt(player.position),surface=floorNoise[c.z]?.[c.x];
    if(surface)playNoise(surface,player.position,wantsRun?1.25:.72);
    else if(wantsRun)playNoise('run',player.position,1.15);
    else if(Math.random()<.14)playNoise('creak',player.position,.35);
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
    while(stationProgress>=1&&battery<CONFIG.detectorCapacity){stationProgress-=1;battery++;updateHud();showMessage('배터리 충전 '+battery+'/5',650);}
    if(battery>=CONFIG.detectorCapacity){removeStation(station);activeStation=null;stationProgress=0;showMessage('감지기 완전 충전');}
  }else if(activeStation){
    if(chargingGain)chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.06);
    removeStation(activeStation);activeStation=null;stationProgress=0;showMessage('충전 중단 · 충전기가 사라졌다');
  }else if(chargingGain){chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
  if(now<detectorUntil)setMonsterVisible(true);else setMonsterVisible(false);
  if(player.position.distanceTo(world(exitCell))<1.55)finish(true);
  updateHud();
}
let lastBreath=0,lastChargeSound=0;
function monsterUpdate(dt,now){
  const pc=cellAt(player.position),mc=cellAt(monster.position);
  const distance=monster.position.distanceTo(player.position);
  const sees=distance<cell*8&&hasLineOfSight(mc,pc);
  if(sees){monsterState='chase';lastSeen={...pc};searchUntil=now+7;monsterTarget={...pc};}
  else if(monsterState==='chase'){
    if(lastSeen){monsterState='search';monsterTarget={...lastSeen};searchUntil=now+6;}
  }
  if(monsterState==='investigate'&&monsterTarget&&mc.x===monsterTarget.x&&mc.z===monsterTarget.z){monsterState='search';searchUntil=now+5;}
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
  if(targetPoint){
    const dx=targetPoint.x-monster.position.x,dz=targetPoint.z-monster.position.z,len=Math.hypot(dx,dz);
    if(len<.25){if(path.length)path.shift();}
    else{const speed=monsterState==='chase'?3.05:monsterState==='investigate'?2.15:monsterState==='search'?1.7:1.05;monster.position.x+=dx/len*speed*dt;monster.position.z+=dz/len*speed*dt;}
  }
  monsterGroup.position.set(monster.position.x,0,monster.position.z);
  monsterGroup.rotation.y=Math.atan2(player.position.x-monster.position.x,player.position.z-monster.position.z);
  if(distance<.9)finish(false);
  if(now>nextMonsterSound){nextMonsterSound=now+30+Math.random()*30;if(distance<cell*14){playNoise('monster',monster.position,.65);}}
}
function updateAmbient(now){
  if(now-lastAmbient>12){lastAmbient=now;if(Math.random()<.35)tone(42+Math.random()*18,1.4,'sine',.018,-8);}
}
function animate(){
  requestAnimationFrame(animate);if(!renderer)return;
  const dt=Math.min(clock.getDelta(),.05),now=performance.now()/1000;
  if(running&&!gameOver){updatePlayer(dt,now);monsterUpdate(dt,now);updateAmbient(now);setCamera();}
  if(exitMesh)exitMesh.rotation.y+=dt*.08;
  for(const s of stations)if(s.mesh){s.mesh.rotation.y+=dt*.35;}
  renderer.render(scene,camera);
}
function finish(success){
  if(gameOver)return;gameOver=true;running=false;runHeld=false;
  $('endEyebrow').textContent=success?'ESCAPED':'FOUND';
  $('endTitle').textContent=success?'탈출 성공':'괴물에게 붙잡혔다';
  $('endText').textContent=success?'미로를 빠져나왔다.':'다음에는 소리를 더 신중하게 관리해야 한다.';
  $('endScreen').classList.remove('hidden');
}
function resetGame(){
  if(scene){
    while(scene.children.length)scene.remove(scene.children[0]);
    scene.add(new THREE.HemisphereLight(0x91a7bd,0x15191c,1.05));
    const keyLight=new THREE.DirectionalLight(0xc2d1dc,.35);keyLight.position.set(-10,20,8);scene.add(keyLight);
    scene.add(new THREE.AmbientLight(0x34414e,.28));
  }
  if(chargingGain&&audioCtx)chargingGain.gain.setValueAtTime(0,audioCtx.currentTime);
  stamina=1;sprintExhausted=false;battery=CONFIG.detectorCapacity;detectorUntil=0;joystick={x:0,y:0};runHeld=false;
  monsterState='wander';monsterTarget=null;lastSeen=null;lastHeard=null;lastHeardAt=0;path=[];pathRefresh=0;stationProgress=0;activeStation=null;lastStep=0;lastBreath=0;lastChargeSound=0;lastAmbient=0;nextMonsterSound=performance.now()/1000+30+Math.random()*30;
  generateMaze();buildWorld();setupPlayerAndMonster();updateHud();gameOver=false;
}
function startGame(){
  ensureAudio();if(!renderer)initThree();resetGame();clock.start();running=true;
  $('startScreen').classList.add('hidden');$('endScreen').classList.add('hidden');
  if(screen.orientation?.lock)screen.orientation.lock('landscape').catch(()=>{});
  showMessage('소리를 조심해라. 출구는 하나다.',2400);
}
function bindControls(){
  const joy=$('joystick'),stick=$('stick');let joyPointer=null;
  function joyMove(e){if(joyPointer!==e.pointerId)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=e.clientX-cx,dy=e.clientY-cy;const max=35,len=Math.hypot(dx,dy);if(len>max){dx=dx/len*max;dy=dy/len*max;}joystick.x=dx/max;joystick.y=dy/max;stick.style.transform='translate('+dx+'px,'+dy+'px)';}
  joy.addEventListener('pointerdown',e=>{e.preventDefault();joyPointer=e.pointerId;joy.setPointerCapture(e.pointerId);joyMove(e);});
  joy.addEventListener('pointermove',joyMove);
  const joyEnd=e=>{if(joyPointer===e.pointerId){joyPointer=null;joystick={x:0,y:0};stick.style.transform='';}};
  joy.addEventListener('pointerup',joyEnd);joy.addEventListener('pointercancel',joyEnd);
  let lookPointer=null,lastX=0,lastY=0;
  renderer?.domElement.addEventListener('pointerdown',e=>{if(e.clientX<innerWidth*.38)return;lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;});
  window.addEventListener('pointermove',e=>{if(lookPointer!==e.pointerId)return;const dx=e.clientX-lastX,dy=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;yaw-=dx*.0045;pitch=Math.max(-1.05,Math.min(1.05,pitch-dy*.0035));});
  window.addEventListener('pointerup',e=>{if(lookPointer===e.pointerId)lookPointer=null;});
  $('runBtn').addEventListener('pointerdown',e=>{e.preventDefault();runHeld=true;$('runBtn').classList.add('active');});
  const runEnd=()=>{runHeld=false;$('runBtn').classList.remove('active');};
  $('runBtn').addEventListener('pointerup',runEnd);$('runBtn').addEventListener('pointercancel',runEnd);$('runBtn').addEventListener('pointerleave',runEnd);
  $('scanBtn').addEventListener('click',useDetector);
  $('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);
  window.addEventListener('resize',()=>{if(!camera||!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){runHeld=false;joystick={x:0,y:0};}});
}
function boot(){
  initThree();bindControls();generateMaze();buildWorld();setupPlayerAndMonster();updateHud();animate();
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
boot();