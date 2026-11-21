import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createMonsterModel } from './monster-model.js';
import { loadEnvironmentAssets, shouldOmitCeiling, shouldOmitFloor } from './environment-assets.js';

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
let floorGroups=[];
let flashlightMain=null, flashlightFill=null;
let flashlightBrightnessPercent=10;
let flashlightNearFill=null;
let maze = [], floorNoise = [], stations = [], stationMeshes = [];
let facilityMazes = [], facilityNoise = [], exploredFloors = [];
let currentFloorIndex = 1, floorTransition = null, factoryHaze = null, stairLock = null, stairTraversal = null;
const FLOOR_LABELS = ['2F','1F','B1','B2','B3'];
const FLOOR_SPACING = 4.5;
const STAIR_UP = {x:20,z:20};
const STAIR_DOWN = {x:10,z:10};
let player, monster, exitMesh, exitCell, spawnCell;
let running = false, gameOver = false, sprintExhausted = false;
let paused = false, audioMuted = false, displayBrightness = .5, brightnessPercent = 40;
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
let musicGain = null, musicNodes = [], musicTimer = null, musicStep = 0;
let monsterGroup, monsterVisible = false, monsterThroughWalls = false;
let monsterRig = null, monsterAnimTime = 0;
let lastMonsterStepAt = 0, nextMonsterBreathAt = 0, nextMonsterVocalAt = 0, nextMonsterWallAt = 0;
const cell = CONFIG.cellSize;
const half = (CONFIG.mazeSize - 1) / 2;
const worldSize = CONFIG.mazeSize * cell;
const tmpVec = new THREE.Vector3();

function getViewportSize(){
  const viewport=window.visualViewport;
  const width=Math.max(1,viewport?.width||document.documentElement.clientWidth||window.innerWidth);
  const height=Math.max(1,viewport?.height||document.documentElement.clientHeight||window.innerHeight);
  return {width,height,portrait:height>width};
}
function syncGameViewport(){
  const {width,height,portrait}=getViewportSize();
  const root=document.documentElement;
  root.style.setProperty('--screen-w',width+'px');
  root.style.setProperty('--screen-h',height+'px');
  if(camera&&renderer){
    const renderWidth=portrait?height:width;
    const renderHeight=portrait?width:height;
    camera.aspect=renderWidth/renderHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(renderWidth,renderHeight,false);
  }
}

function randInt(n){ return Math.floor(Math.random()*n); }
function key(c){return c.x+','+c.z;}
function nodeKey(c){return (c.floor??currentFloorIndex)+':'+c.x+','+c.z;}
function inside(x,z){return x>=0&&z>=0&&x<CONFIG.mazeSize&&z<CONFIG.mazeSize;}
function isOpen(x,z,floorIndex=currentFloorIndex){const map=facilityMazes[floorIndex]||maze;return inside(x,z)&&map?.[z]?.[x]===0;}
function floorY(floorIndex){return floorIndex*FLOOR_SPACING;}
function world(c){const f=c.floor??currentFloorIndex;return new THREE.Vector3((c.x-half)*cell,floorY(f),(c.z-half)*cell);}
function cellAt(pos){const floor=Math.max(0,Math.min(FLOOR_LABELS.length-1,Math.round(pos.y/FLOOR_SPACING)));return{x:Math.max(0,Math.min(CONFIG.mazeSize-1,Math.round(pos.x/cell+half))),z:Math.max(0,Math.min(CONFIG.mazeSize-1,Math.round(pos.z/cell+half))),floor};}
function isReservedCell(x,z,floorIndex){
  const sets=floorIndex<=1?[[6,6],[34,6],[6,34],[34,34]]:floorIndex===2?[[8,8],[32,9],[9,32],[32,32],[25,17]]:floorIndex===4?[[6,6],[34,6],[6,34],[34,34]]:[];
  return sets.some(([rx,rz])=>rx===x&&rz===z);
}
function randomOpen(exclude=[],floorIndex=currentFloorIndex){
  const blocked=new Set(exclude.map(key)),map=facilityMazes[floorIndex]||maze;
  for(let i=0;i<5000;i++){const c={x:1+randInt(CONFIG.mazeSize-2),z:1+randInt(CONFIG.mazeSize-2)};if(map?.[c.z]?.[c.x]===0&&!blocked.has(key(c))&&!isReservedCell(c.x,c.z,floorIndex))return {...c,floor:floorIndex};}
  for(let z=1;z<CONFIG.mazeSize-1;z++)for(let x=1;x<CONFIG.mazeSize-1;x++)if(map?.[z]?.[x]===0&&!blocked.has(key({x,z}))&&!isReservedCell(x,z,floorIndex))return{x,z,floor:floorIndex};
  return{x:1,z:1,floor:floorIndex};
}
function createFloorMaze(floorIndex){
  const n=CONFIG.mazeSize,map=Array.from({length:n},()=>Array(n).fill(1));
  const rect=(x1,z1,x2,z2)=>{for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)map[z][x]=0;};
  const corridor=(x1,z1,x2,z2)=>{let x=x1,z=z1;while(x!==x2){map[z][x]=0;x+=Math.sign(x2-x);}while(z!==z2){map[z][x]=0;z+=Math.sign(z2-z);}map[z][x]=0;};
  const room=(x1,z1,x2,z2,doorX,doorZ)=>{
    for(let z=z1+1;z<z2;z++)for(let x=x1+1;x<x2;x++)map[z][x]=0;
    map[doorZ][doorX]=0;
  };
  if(floorIndex<=1){
    // 병원·관리동: 중앙 복도와 네 개의 병실 동선, 각 방은 문을 통해 복도에 연결된다.
    rect(19,2,21,38);rect(2,19,38,21);
    rect(9,2,11,38);rect(29,2,31,38);rect(2,9,38,11);rect(2,29,38,31);
    const rooms=[
      [3,3,8,8,8,5],[12,3,17,8,12,5],[3,12,8,17,8,14],[12,12,17,17,12,14],
      [23,3,28,8,28,5],[32,3,37,8,32,5],[23,12,28,17,28,14],[32,12,37,17,32,14],
      [3,23,8,28,8,25],[12,23,17,28,12,25],[3,32,8,37,8,34],[12,32,17,37,12,34],
      [23,23,28,28,28,25],[32,23,37,28,32,25],[23,32,28,37,28,34],[32,32,37,37,32,34]
    ];
    for(const r of rooms)room(...r);
  }else if(floorIndex===2){
    // 폐공장: 넓은 생산동을 네 개의 거대한 작업장으로 나누고 중앙 설비 통로로 연결한다.
    rect(3,3,37,37);
    for(let x=4;x<=36;x++){if(x<19||x>21){map[13][x]=1;map[27][x]=1;}}
    for(let z=4;z<=36;z++){if(z<19||z>21){map[z][13]=1;map[z][27]=1;}}
    rect(19,2,21,38);rect(2,19,38,21);
    // 주변 정비실과 원료 보관실
    room(3,3,8,8,8,5);room(32,3,37,8,32,5);
    room(3,32,8,37,8,34);room(32,32,37,37,32,34);
    corridor(10,10,20,20);corridor(20,20,30,30);
  }else if(floorIndex===3){
    // 침수구역: 넓은 물 저장실과 가늘게 이어지는 배수 통로.
    rect(19,2,21,38);rect(2,19,38,21);
    rect(4,4,15,15);rect(25,4,36,15);rect(4,25,15,36);rect(25,25,36,36);
    corridor(10,10,20,20);corridor(30,10,20,20);corridor(10,30,20,20);corridor(30,30,20,20);
    // 일부 수로는 한 칸 폭으로 남겨 물속 이동을 강제한다.
    for(let x=4;x<=15;x++)map[16][x]=1;
    map[10][15]=0;map[20][20]=0;map[30][25]=0;
    corridor(15,10,19,10);corridor(25,30,21,30);
  }else{
    // 지하 설비층: 좁은 유지보수 복도, 전기실과 케이블실이 교차한다.
    rect(19,2,21,38);rect(2,19,38,21);
    rect(9,2,10,19);rect(9,21,10,38);rect(30,2,31,19);rect(30,21,31,38);
    rect(2,9,19,10);rect(21,30,38,31);
    room(3,3,8,8,8,5);room(12,3,17,8,12,5);
    room(32,3,37,8,32,5);room(23,3,28,8,28,5);
    room(3,32,8,37,8,34);room(12,32,17,37,12,34);
    room(32,32,37,37,32,34);room(23,32,28,37,28,34);
    for(const z of [5,14,25,34]){map[z][11]=0;map[z][29]=0;}
    corridor(10,10,20,20);corridor(30,30,20,20);
  }
  // 층간 연결부는 모든 층에서 같은 위치에 정렬한다.
  for(const p of [STAIR_UP,STAIR_DOWN])for(let z=p.z-1;z<=p.z+1;z++)for(let x=p.x-1;x<=p.x+1;x++)map[z][x]=0;
  return map;
}
function generateMaze(){
  facilityMazes=FLOOR_LABELS.map((_,i)=>createFloorMaze(i));
  facilityNoise=facilityMazes.map(map=>Array.from({length:CONFIG.mazeSize},(_,z)=>Array.from({length:CONFIG.mazeSize},(_,x)=>map[z][x]===0&&Math.random()<.035?['creak','metal','rubble','water'][randInt(4)]:null)));
  exploredFloors=FLOOR_LABELS.map(()=>Array.from({length:CONFIG.mazeSize},()=>Array(CONFIG.mazeSize).fill(false)));
  currentFloorIndex=1;maze=facilityMazes[currentFloorIndex];floorNoise=facilityNoise[currentFloorIndex];floorTransition=null;
  spawnCell=randomOpen([STAIR_UP,STAIR_DOWN],currentFloorIndex);
  const distances=bfsDistances({...STAIR_UP,floor:0},0);let far={...STAIR_UP,floor:0},max=-1;
  for(const [k,d] of distances){const [x,z]=k.split(',').map(Number);if(d>max&&!isReservedCell(x,z,0)){max=d;far={x,z,floor:0};}}
  exitCell=far;updateFloorBadge();
}
function bfsDistances(start,floorIndex=start.floor??currentFloorIndex){
  const q=[start],dist=new Map([[key(start),0]]);
  for(let i=0;i<q.length;i++){const c=q[i],d=dist.get(key(c));for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:c.x+dx,z:c.z+dz};if(isOpen(p.x,p.z,floorIndex)&&!dist.has(key(p))){dist.set(key(p),d+1);q.push(p);}}}
  return dist;
}
function findPath(start,goal){
  if(!goal)return [];
  const s={...start,floor:start.floor??currentFloorIndex},g={...goal,floor:goal.floor??currentFloorIndex},q=[s],prev=new Map([[nodeKey(s),null]]);
  for(let i=0;i<q.length;i++){
    const c=q[i],ck=nodeKey(c);if(ck===nodeKey(g))break;
    const next=[];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])next.push({x:c.x+dx,z:c.z+dz,floor:c.floor});
    if(c.x===STAIR_UP.x&&c.z===STAIR_UP.z&&c.floor>0)next.push({x:c.x,z:c.z,floor:c.floor-1});
    if(c.x===STAIR_DOWN.x&&c.z===STAIR_DOWN.z&&c.floor<FLOOR_LABELS.length-1)next.push({x:c.x,z:c.z,floor:c.floor+1});
    for(const p of next){const pk=nodeKey(p);if(isOpen(p.x,p.z,p.floor)&&!prev.has(pk)){prev.set(pk,c);q.push(p);}}
  }
  if(!prev.has(nodeKey(g)))return [];
  const out=[];let cur=g;while(cur&&nodeKey(cur)!==nodeKey(s)){out.push(cur);cur=prev.get(nodeKey(cur));}return out.reverse();
}
function updateFloorBadge(){const badge=$('mapFloor');if(badge)badge.textContent=FLOOR_LABELS[currentFloorIndex]||'1F';}
function beginFloorTransition(targetFloor,shaft){
  if(floorTransition||targetFloor<0||targetFloor>=FLOOR_LABELS.length)return;
  stairLock=shaft;
  floorTransition={from:currentFloorIndex,to:targetFloor,elapsed:0,duration:1.25,startY:floorY(currentFloorIndex)};
  joystick={x:0,y:0};runHeld=false;showMessage(targetFloor<currentFloorIndex?'위층으로 이동 중':'아래층으로 이동 중',1100);
}
function updateFloorTransitionFrame(dt){
  if(!floorTransition)return false;
  floorTransition.elapsed+=dt;const t=Math.min(1,floorTransition.elapsed/floorTransition.duration),e=t*t*(3-2*t);
  player.position.y=floorTransition.startY+(floorY(floorTransition.to)-floorTransition.startY)*e;
  if(t>=1){currentFloorIndex=floorTransition.to;player.position.y=floorY(currentFloorIndex);maze=facilityMazes[currentFloorIndex];floorNoise=facilityNoise[currentFloorIndex];lastSurfaceCellKey='';updateFloorBadge();updateFloorVisibility();const panel=$('minimapPanel');if(panel){panel.classList.add('floor-switching');setTimeout(()=>panel.classList.remove('floor-switching'),420);}showMessage(FLOOR_LABELS[currentFloorIndex]+' 도착',1300);floorTransition=null;}
  return true;
}
function checkStairTransition(){
  if(floorTransition)return;const c=cellAt(player.position),atUp=Math.hypot(c.x-STAIR_UP.x,c.z-STAIR_UP.z)<.48,atDown=Math.hypot(c.x-STAIR_DOWN.x,c.z-STAIR_DOWN.z)<.48;
  if(stairLock==='up'&&atUp)return;
  if(stairLock==='down'&&atDown)return;
  stairLock=null;
  if(atUp&&currentFloorIndex>0)beginFloorTransition(currentFloorIndex-1,'up');
  else if(atDown&&currentFloorIndex<FLOOR_LABELS.length-1)beginFloorTransition(currentFloorIndex+1,'down');
}

function initThree(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x05080b); scene.fog=new THREE.FogExp2(0x080d11,0.0028);
  syncGameViewport();
  const viewport=getViewportSize();
  const renderWidth=viewport.portrait?viewport.height:viewport.width;
  const renderHeight=viewport.portrait?viewport.width:viewport.height;
  camera=new THREE.PerspectiveCamera(76,renderWidth/renderHeight,.08,110);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',stencil:false,depth:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75)); renderer.setSize(renderWidth,renderHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=displayBrightness;
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  view.replaceChildren(renderer.domElement);
  clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0x9aaab4,0x252b30,.42));const light=new THREE.DirectionalLight(0x9eabb3,.10);light.position.set(-10,20,8);scene.add(light);scene.add(new THREE.AmbientLight(0x87939a,.26));flashlightMain=new THREE.SpotLight(0xffffff,1800*(flashlightBrightnessPercent/100),38,Math.PI/5,.38,1.0);flashlightMain.position.set(0,0,0);flashlightMain.target.position.set(0,0,-1);flashlightMain.castShadow=true;flashlightMain.shadow.mapSize.set(1024,1024);flashlightMain.shadow.camera.near=.1;flashlightMain.shadow.camera.far=30;camera.add(flashlightMain);camera.add(flashlightMain.target);flashlightFill=new THREE.SpotLight(0xe8f5ff,380*(flashlightBrightnessPercent/100),30,Math.PI/3,.72,1.0);flashlightFill.position.set(0,0,0);flashlightFill.target.position.set(0,0,-1);camera.add(flashlightFill);camera.add(flashlightFill.target);flashlightNearFill=new THREE.PointLight(0xdcecff,90*(flashlightBrightnessPercent/100),8,1.4);flashlightNearFill.position.set(0,-.08,-.15);camera.add(flashlightNearFill);scene.add(camera);
}
function addBox(x,y,z,sx,sy,sz,mat){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function makeConcreteTexture(base){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,256,256);for(let i=0;i<2300;i++){const v=Math.random()>.5?255:0,a=.025+Math.random()*.11,s=1+Math.random()*4;g.fillStyle='rgba('+v+','+v+','+v+','+a+')';g.fillRect(Math.random()*256,Math.random()*256,s,s);}for(let i=0;i<6;i++){const x=Math.random()*256,y=Math.random()*256;g.strokeStyle='rgba(5,9,11,.25)';g.lineWidth=1.5;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.random()*20-10,y+20+Math.random()*30);g.lineTo(x+Math.random()*35-15,y+40+Math.random()*35);g.stroke();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t;}
function buildWorld(){
  factoryHaze=null;
  const concreteWall=new THREE.MeshStandardMaterial({color:0xaab4b7,map:makeConcreteTexture('#687176'),roughness:.96,bumpMap:makeConcreteTexture('#41494d'),bumpScale:.16});
  const concreteFloor=new THREE.MeshStandardMaterial({color:0x9ca6aa,map:makeConcreteTexture('#424b50'),roughness:.94,bumpMap:makeConcreteTexture('#394145'),bumpScale:.09});
  const industrialWall=new THREE.MeshStandardMaterial({color:0x777f80,map:makeConcreteTexture('#454c4d'),roughness:.82,metalness:.12});
  const industrialFloor=new THREE.MeshStandardMaterial({color:0x8c9695,map:makeConcreteTexture('#343d3e'),roughness:.72,metalness:.28,bumpMap:makeConcreteTexture('#303738'),bumpScale:.12});
  const waterFloor=new THREE.MeshStandardMaterial({color:0x53666b,map:makeConcreteTexture('#303e42'),roughness:.24,metalness:.24});
  const ceilingMat=new THREE.MeshStandardMaterial({color:0x727d81,map:makeConcreteTexture('#42494c'),roughness:1});
  const dummy=new THREE.Object3D(),tileGeo=new THREE.BoxGeometry(cell,.36,cell),ceilingGeo=new THREE.BoxGeometry(cell,.24,cell),wallGeo=new THREE.BoxGeometry(cell,CONFIG.wallHeight,cell);
  for(const geometry of [tileGeo,ceilingGeo,wallGeo])geometry.setAttribute('uv2',geometry.attributes.uv.clone());
  floorGroups=[];
  for(let f=0;f<FLOOR_LABELS.length;f++){
    const floorGroup=new THREE.Group();floorGroup.name='facility-floor-'+f;floorGroups.push(floorGroup);
    const base=floorY(f),map=facilityMazes[f],factory=f===2,flooded=f===3,basement=f===4;
    // B1의 왼쪽 생산동을 30m급 개방형 창고 홀로 비운다. 외곽 벽은 유지하고 내부 임의 벽만 제거한다.
    if(factory)for(let z=15;z<=25;z++)for(let x=5;x<=10;x++)map[z][x]=0;
    for(let x=7;x<=9;x++)map[26][x]=0;
    const floorMat=factory?industrialFloor:flooded?waterFloor:concreteFloor,wallMat=factory||basement?industrialWall:concreteWall;
    const countTiles=CONFIG.mazeSize*CONFIG.mazeSize-6,floors=new THREE.InstancedMesh(tileGeo,floorMat,countTiles),ceilings=new THREE.InstancedMesh(ceilingGeo,ceilingMat,countTiles);
    floors.name='floor-surface';ceilings.name='ceiling-surface';
    let fi=0,ci=0;
    for(let z=0;z<CONFIG.mazeSize;z++)for(let x=0;x<CONFIG.mazeSize;x++){
      if([STAIR_UP,STAIR_DOWN].some(p=>x===p.x&&Math.abs(p.z-z)<=1))continue;
      const wx=(x-half)*cell,wz=(z-half)*cell;
      if(!shouldOmitFloor(f,x,z)){dummy.position.set(wx,base-.18,wz);dummy.updateMatrix();floors.setMatrixAt(fi++,dummy.matrix);}
      if(!shouldOmitCeiling(f,x,z)){dummy.position.set(wx,base+CONFIG.wallHeight+.12,wz);dummy.updateMatrix();ceilings.setMatrixAt(ci++,dummy.matrix);}
    }
    floors.count=fi;floors.instanceMatrix.needsUpdate=true;floors.receiveShadow=true;floorGroup.add(floors);ceilings.count=ci;ceilings.instanceMatrix.needsUpdate=true;floorGroup.add(ceilings);
    let count=0;for(let z=0;z<CONFIG.mazeSize;z++)for(let x=0;x<CONFIG.mazeSize;x++)if(map[z][x])count++;
    const walls=new THREE.InstancedMesh(wallGeo,wallMat,count);walls.name='wall-surface';let wi=0;
    for(let z=0;z<CONFIG.mazeSize;z++)for(let x=0;x<CONFIG.mazeSize;x++)if(map[z][x]){dummy.position.set((x-half)*cell,base+CONFIG.wallHeight/2,(z-half)*cell);dummy.updateMatrix();walls.setMatrixAt(wi++,dummy.matrix);}
    walls.castShadow=true;walls.receiveShadow=true;walls.instanceMatrix.needsUpdate=true;floorGroup.add(walls);
    const lightMat=new THREE.MeshStandardMaterial({color:0x56636a,emissive:factory?0x9d6e42:0xa8c4ce,emissiveIntensity:factory ? 1.1 : basement ? .8 : 1.7,roughness:.72});
    // 격자 좌표가 막힌 칸에 걸려 B3 중앙 복도에 조명이 하나도 생기지 않던 문제를 수정한다.
    // 일정 간격의 후보 위치를 가장 가까운 실제 통로 칸으로 옮겨 배치한다.
    const fixtureCells=[];
    for(let gz=3;gz<CONFIG.mazeSize-3;gz+=6)for(let gx=3;gx<CONFIG.mazeSize-3;gx+=6){
      let best=null,bestD=Infinity;
      for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){
        const x=gx+dx,z=gz+dz,d=dx*dx+dz*dz;
        if(d>25||!inside(x,z)||map[z][x]!==0||d>=bestD)continue;
        best={x,z};bestD=d;
      }
      if(!best||bestD>25||shouldOmitCeiling(f,best.x,best.z)||fixtureCells.some(p=>Math.hypot(p.x-best.x,p.z-best.z)<5.5))continue;
      fixtureCells.push(best);
    }
    for(const {x,z} of fixtureCells){
      const p=world({x,z,floor:f}),housing=new THREE.Mesh(new THREE.BoxGeometry(.9,.14,.34),lightMat);housing.position.set(p.x,base+2.82,p.z);floorGroup.add(housing);
      const tube=new THREE.Mesh(new THREE.BoxGeometry(.74,.045,.2),new THREE.MeshBasicMaterial({color:factory?0xffc58c:0xeaf7ff}));tube.position.set(p.x,base+2.735,p.z);floorGroup.add(tube);
      const light=new THREE.PointLight(factory?0xffbd83:basement?0xc5d9e8:0xd8edf4,factory?12:basement?10:12,15,1.5);light.position.set(p.x,base+2.58,p.z);floorGroup.add(light);
    }
    const pipeMat=new THREE.MeshStandardMaterial({color:factory?0x4a4c47:0x343d40,metalness:.68,roughness:.58});
    for(let z=4;z<CONFIG.mazeSize-4;z+=9)for(let x=4;x<CONFIG.mazeSize-5;x++)if(![0,1,2].some(k=>shouldOmitCeiling(f,x+k,z))&&map[z][x]===0&&map[z][x+1]===0&&map[z][x+2]===0&&Math.random()<.18){
      const p=world({x,z,floor:f}),pipe=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,cell*2.5,9),pipeMat);pipe.rotation.z=Math.PI/2;pipe.position.set(p.x,base+2.72,p.z);floorGroup.add(pipe);x+=2;
    }
    // 병원 의료 장비는 environment-assets.js의 실제 GLB 모델로 비동기 배치한다.
    if(factory){
      // 공장 설비는 단순 박스 대신 세부 부품이 모델링된 GLB 산업 장비로 교체한다.
      const hazeCount=460,positions=new Float32Array(hazeCount*3);
      for(let n=0;n<hazeCount;n++){positions[n*3]=(Math.random()-.5)*worldSize*.88;positions[n*3+1]=base+1+Math.random()*2.1;positions[n*3+2]=(Math.random()-.5)*worldSize*.88;}
      const hg=new THREE.BufferGeometry();hg.setAttribute('position',new THREE.BufferAttribute(positions,3));factoryHaze=new THREE.Points(hg,new THREE.PointsMaterial({color:0x9aa09b,size:.34,transparent:true,opacity:.105,depthWrite:false,sizeAttenuation:true}));factoryHaze.frustumCulled=false;floorGroup.add(factoryHaze);
    }
    if(flooded){
      const water=new THREE.Mesh(new THREE.PlaneGeometry(worldSize*.94,worldSize*.94),new THREE.MeshPhysicalMaterial({color:0x29464d,roughness:.19,metalness:.2,transparent:true,opacity:.34,clearcoat:.8,clearcoatRoughness:.16}));
      water.rotation.x=-Math.PI/2;water.position.y=base+.035;floorGroup.add(water);
    }
    if(basement){
      const cableMat=new THREE.MeshStandardMaterial({color:0x20282a,metalness:.6,roughness:.8});
      for(let z=6;z<CONFIG.mazeSize-5;z+=6){const p=world({x:20,z,floor:f}),tray=new THREE.Mesh(new THREE.BoxGeometry(.34,.2,cell*5),cableMat);tray.position.set(p.x,base+2.65,p.z);floorGroup.add(tray);}
      // 전기·통신 설비는 고품질 GLB 환경 모듈로 대체한다.
    }
    scene.add(floorGroup);
  }
  // 실제 통행 가능한 24단 계단. 양쪽 층에서 동일한 계단참과 계단을 볼 수 있게 복제한다.
  const stairTread=.28,stairRise=FLOOR_SPACING/24,stairLength=stairTread*24;
  const stairConcrete=makeConcreteTexture('#555b5b'),stairBump=makeConcreteTexture('#343a3b');
  const stairStepMat=new THREE.MeshStandardMaterial({color:0x92918a,map:stairConcrete,bumpMap:stairBump,bumpScale:.11,metalness:.12,roughness:.94});
  const stairRiserMat=new THREE.MeshStandardMaterial({color:0x555d5e,map:makeConcreteTexture('#414748'),bumpMap:stairBump,bumpScale:.08,metalness:.18,roughness:.9});
  const stairEdgeMat=new THREE.MeshStandardMaterial({color:0xb39a55,metalness:.58,roughness:.55});
  const railMat=new THREE.MeshStandardMaterial({color:0x727b7c,metalness:.88,roughness:.24});
  const stringerMat=new THREE.MeshStandardMaterial({color:0x343d40,metalness:.72,roughness:.48});
  const upAxis=new THREE.Vector3(0,1,0);
  function makeFlight(baseFloor,shaft){
    const flight=new THREE.Group(),p=world({...shaft,floor:baseFloor});
    const startZ=p.z+stairLength/2,endZ=p.z-stairLength/2;
    for(let n=0;n<24;n++){
      const topY=floorY(baseFloor)+(n+1)*stairRise;
      const z=startZ-(n+.5)*stairTread;
      const tread=new THREE.Mesh(new THREE.BoxGeometry(1.92,stairRise,stairTread),stairStepMat);
      tread.position.set(p.x,floorY(baseFloor)+(n+.5)*stairRise,z);
      tread.castShadow=true;tread.receiveShadow=true;flight.add(tread);
      const riser=new THREE.Mesh(new THREE.BoxGeometry(1.88,stairRise,.065),stairRiserMat);
      riser.position.set(p.x,floorY(baseFloor)+(n+.5)*stairRise,startZ-(n+1)*stairTread+.025);
      riser.castShadow=true;riser.receiveShadow=true;flight.add(riser);
      const nosing=new THREE.Mesh(new THREE.BoxGeometry(1.94,.035,.065),stairEdgeMat);
      nosing.position.set(p.x,topY-.018,startZ-(n+1)*stairTread+.012);flight.add(nosing);
    }
    for(const [z,y] of [[startZ+.48,floorY(baseFloor)-.11],[endZ-.48,floorY(baseFloor+1)-.11]]){
      const landing=new THREE.Mesh(new THREE.BoxGeometry(2.65,.24,1.45),stairStepMat);
      landing.position.set(p.x,y,z);landing.castShadow=true;landing.receiveShadow=true;flight.add(landing);
      const landingLip=new THREE.Mesh(new THREE.BoxGeometry(2.68,.045,1.48),stairRiserMat);
      landingLip.position.set(p.x,y-.13,z);flight.add(landingLip);
    }
    const railVector=new THREE.Vector3(0,FLOOR_SPACING,-stairLength);
    for(const side of [-1,1]){
      const beam=new THREE.Mesh(new THREE.BoxGeometry(.16,FLOOR_SPACING+.12,stairLength+.18),stringerMat);
      beam.position.set(p.x+side*1.02,floorY(baseFloor)+FLOOR_SPACING/2,p.z);beam.rotation.x=Math.atan2(FLOOR_SPACING,stairLength);flight.add(beam);
      const rail=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,railVector.length(),14),railMat);
      rail.position.set(p.x+side*1.16,floorY(baseFloor)+FLOOR_SPACING/2+.96,p.z);
      rail.quaternion.setFromUnitVectors(upAxis,railVector.clone().normalize());flight.add(rail);
      for(let n=0;n<=24;n+=2){
        const y=floorY(baseFloor)+n*stairRise+.48,z=startZ-n*stairTread;
        const post=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,.96,10),railMat);
        post.position.set(p.x+side*1.16,y,z);flight.add(post);
        const clamp=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.07,10),stringerMat);
        clamp.position.set(p.x+side*1.16,y+.42,z);flight.add(clamp);
      }
    }
    // 계단실 가장자리의 바닥 테두리와 벽체를 만들어 빈 격자처럼 보이지 않게 한다.
    for(const side of [-1,1]){
      const curb=new THREE.Mesh(new THREE.BoxGeometry(.18,.42,stairLength+.8),stairRiserMat);
      curb.position.set(p.x+side*1.42,floorY(baseFloor)+.18,p.z);flight.add(curb);
    }
    // 계단 하부 콘크리트 슬래브: 발판 아래가 허공처럼 보이지 않도록 실제 구조 두께를 준다.
    const soffit=new THREE.Mesh(new THREE.BoxGeometry(2.28,.24,stairLength+.16),stairRiserMat);
    soffit.position.set(p.x,floorY(baseFloor)+FLOOR_SPACING/2-.22,p.z);
    soffit.rotation.x=Math.atan2(FLOOR_SPACING,stairLength);soffit.castShadow=true;soffit.receiveShadow=true;flight.add(soffit);
    // 난간 바깥쪽 케이블 전선관과 고정 브래킷
    const conduitMat=new THREE.MeshStandardMaterial({color:0x252d30,metalness:.78,roughness:.42});
    for(const side of [-1,1]){
      const conduit=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,stairLength+.5,10),conduitMat);
      conduit.rotation.x=Math.PI/2;conduit.position.set(p.x+side*1.72,floorY(baseFloor)+FLOOR_SPACING/2+.12,p.z);flight.add(conduit);
      for(let n=0;n<7;n++){
        const bracket=new THREE.Mesh(new THREE.BoxGeometry(.16,.08,.12),railMat);
        bracket.position.set(p.x+side*1.72,floorY(baseFloor)+.28+n*.62,p.z+stairLength/2-n*stairLength/6);flight.add(bracket);
      }
    }
    // 계단참 천장형 방습등과 따뜻한 벽면 반사광
    const fixture=new THREE.Mesh(new THREE.BoxGeometry(.72,.12,.24),new THREE.MeshStandardMaterial({color:0x465052,metalness:.42,roughness:.62}));
    fixture.position.set(p.x,floorY(baseFloor)+FLOOR_SPACING+2.78,endZ-.35);flight.add(fixture);
    const diffuser=new THREE.Mesh(new THREE.BoxGeometry(.61,.035,.18),new THREE.MeshBasicMaterial({color:0xd8e4d9}));
    diffuser.position.set(p.x,floorY(baseFloor)+FLOOR_SPACING+2.70,endZ-.35);flight.add(diffuser);
    const stairLight=new THREE.PointLight(0xc8d8d0,8,9,1.7);
    stairLight.position.set(p.x,floorY(baseFloor)+FLOOR_SPACING+2.45,endZ-.35);flight.add(stairLight);
    return flight;
  }
  for(let f=0;f<FLOOR_LABELS.length-1;f++)for(const shaft of [STAIR_UP,STAIR_DOWN]){
    const flight=makeFlight(f,shaft);
    floorGroups[f].add(flight);floorGroups[f+1].add(flight.clone(true));
  }
}
function updateFloorVisibility(){
  for(let i=0;i<floorGroups.length;i++)floorGroups[i].visible=i===currentFloorIndex;
  if(exitMesh)exitMesh.visible=(exitCell?.floor??0)===currentFloorIndex;
  for(const station of stations)if(station.mesh)station.mesh.visible=(station.cell.floor??currentFloorIndex)===currentFloorIndex;
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
  for(let f=0;f<FLOOR_LABELS.length;f++)for(let i=0;i<(f===1?2:1);i++)spawnStation([],f);
}
function spawnStation(extra=[],floorIndex=currentFloorIndex){
  const exclusions=[spawnCell,exitCell,STAIR_UP,STAIR_DOWN,...stations.map(s=>s.cell),cellAt(player.position),cellAt(monster.position),...extra];
  const c=randomOpen(exclusions,floorIndex);stations.push({cell:c,mesh:null});
  const p=world(c),g=new THREE.Group();
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.52,.6,.22,12),makeMarker(0x687783,0x17232c));base.position.y=.11;g.add(base);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.75,10),makeMarker(0x9bc9d0,0x2b8290));core.position.y=.58;g.add(core);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.045,6,18),makeMarker(0xb6d9dc,0x387a82));ring.rotation.x=Math.PI/2;ring.position.y=.35;g.add(ring);
  g.position.set(p.x,p.y,p.z);scene.add(g);stations[stations.length-1].mesh=g;stationMeshes.push(g);
}
function removeStation(s){if(!s||!stations.includes(s))return;const old={...s.cell};if(s.mesh)scene.remove(s.mesh);stations=stations.filter(v=>v!==s);stationMeshes=stationMeshes.filter(v=>v!==s.mesh);spawnStation([old],old.floor??currentFloorIndex);}
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
  camera.position.copy(player.position);camera.position.y=player.position.y+1.62;
  camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
}
function setupPlayerAndMonster(){
  const p=world(spawnCell);player={position:p.clone(),radius:.34};
  const reach=bfsDistances(spawnCell,currentFloorIndex),opts=[];for(const [k,d] of reach)if(d>=9&&d<=20){const [x,z]=k.split(',').map(Number);if(!isReservedCell(x,z,currentFloorIndex))opts.push({x,z,floor:currentFloorIndex});}const mc=opts.length?opts[randInt(opts.length)]:randomOpen([spawnCell,exitCell],currentFloorIndex);const mp=world(mc);monster={position:mp.clone(),cell:mc};
  buildMonster();buildExit();buildStations();setCamera();
}
function ensureAudio(){
  if(audioCtx){if(audioCtx.state==='suspended')audioCtx.resume();return;}
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  masterGain=audioCtx.createGain();masterGain.gain.value=.55;masterGain.connect(audioCtx.destination);
  chargingGain=audioCtx.createGain();chargingGain.gain.value=0;chargingGain.connect(masterGain);
  chargingOsc=audioCtx.createOscillator();chargingOsc.type='sine';chargingOsc.frequency.value=118;chargingOsc.connect(chargingGain);chargingOsc.start();
  setupHorrorMusic();
}
function setupHorrorMusic(){
  musicGain=audioCtx.createGain();musicGain.gain.value=0;musicGain.connect(masterGain);
  const makeDrone=(frequency,type,level,detune=0)=>{
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
    osc.type=type;osc.frequency.value=frequency;osc.detune.value=detune;
    filter.type='lowpass';filter.frequency.value=type==='sine'?260:190;filter.Q.value=.55;
    gain.gain.value=level;osc.connect(filter);filter.connect(gain);gain.connect(musicGain);osc.start();
    musicNodes.push(osc);
  };
  makeDrone(43.65,'sine',.105);
  makeDrone(65.41,'triangle',.035,-7);
  makeDrone(87.31,'sine',.024,5);
  makeDrone(130.81,'sine',.012,-11);
  const length=Math.floor(audioCtx.sampleRate*6),buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate),data=buffer.getChannelData(0);
  let last=0;
  for(let i=0;i<length;i++){last=last*.985+(Math.random()*2-1)*.015;data[i]=last*2.2;}
  const wind=audioCtx.createBufferSource(),windFilter=audioCtx.createBiquadFilter(),windGain=audioCtx.createGain();
  wind.buffer=buffer;wind.loop=true;windFilter.type='lowpass';windFilter.frequency.value=460;windFilter.Q.value=.7;
  windGain.gain.value=.42;wind.connect(windFilter);windFilter.connect(windGain);windGain.connect(musicGain);wind.start();musicNodes.push(wind);
  const lfo=audioCtx.createOscillator(),lfoGain=audioCtx.createGain();
  // 바람 질감의 음량을 아주 느리게 흔들어 지하 공간의 압박감을 만든다.
  lfo.type='sine';lfo.frequency.value=.035;lfoGain.gain.value=.12;
  lfo.connect(lfoGain);lfoGain.connect(windGain.gain);lfo.start();musicNodes.push(lfo);
}
function playHorrorNote(frequency){
  if(!audioCtx||!musicGain)return;
  const now=audioCtx.currentTime,osc=audioCtx.createOscillator(),overtone=audioCtx.createOscillator();
  const filter=audioCtx.createBiquadFilter(),envelope=audioCtx.createGain();
  osc.type='sine';osc.frequency.setValueAtTime(frequency,now);
  overtone.type='triangle';overtone.frequency.setValueAtTime(frequency*1.498,now);
  filter.type='lowpass';filter.frequency.value=520;filter.Q.value=.65;
  envelope.gain.setValueAtTime(.0001,now);envelope.gain.linearRampToValueAtTime(.045,now+.18);
  envelope.gain.exponentialRampToValueAtTime(.0001,now+5.8);
  osc.connect(filter);overtone.connect(filter);filter.connect(envelope);envelope.connect(musicGain);
  osc.start(now);overtone.start(now);osc.stop(now+6);overtone.stop(now+6);
}
function startHorrorMusic(){
  if(!audioCtx||!musicGain)return;
  if(musicTimer)clearInterval(musicTimer);
  musicGain.gain.cancelScheduledValues(audioCtx.currentTime);
  musicGain.gain.setTargetAtTime(.72,audioCtx.currentTime,.9);
  const notes=[110,82.41,98,73.42,65.41,87.31,73.42,98];
  musicStep=0;playHorrorNote(notes[musicStep++]);
  musicTimer=setInterval(()=>{if(document.hidden||!running||paused||gameOver)return;playHorrorNote(notes[musicStep++%notes.length]);},7600);
}
function stopHorrorMusic(){
  if(musicTimer){clearInterval(musicTimer);musicTimer=null;}
  if(musicGain&&audioCtx)musicGain.gain.setTargetAtTime(0,audioCtx.currentTime,.65);
}
function tone(freq,duration,type='sine',volume=.12,slide=0){
  if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(25,freq+slide),audioCtx.currentTime+duration);
  g.gain.setValueAtTime(volume,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(masterGain);o.start();o.stop(audioCtx.currentTime+duration+.03);
}
function noiseBurst(duration=.16,volume=.08,filter=700){
  if(!audioCtx)return;const size=Math.floor(audioCtx.sampleRate*duration),buf=audioCtx.createBuffer(1,size,audioCtx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*(1-i/size);
  const src=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();src.buffer=buf;f.type='lowpass';f.frequency.value=filter;g.gain.value=volume;src.connect(f);f.connect(g);g.connect(masterGain);src.start();
}
function monsterAudioOutput(baseVolume){
  if(!audioCtx||!masterGain||audioMuted||paused||!running||!monster||!player)return null;
  const distance=monster.position.distanceTo(player.position);
  const from=cellAt(player.position),to=cellAt(monster.position);
  const walls=wallCountBetween(from,to);
  const effective=distance/cell+walls*.55;
  // 멀리 있어도 소리가 완전히 끊기지 않도록 완만한 거리 감쇠를 적용한다.
  const distanceGain=Math.max(.16,1/(1+effective*.075));
  const wallGain=Math.max(.48,Math.pow(.91,Math.min(walls,9)));
  const gain=audioCtx.createGain();
  gain.gain.value=Math.min(.52,baseVolume*distanceGain*wallGain);
  const panner=audioCtx.createStereoPanner();
  const dx=monster.position.x-player.position.x,dz=monster.position.z-player.position.z;
  const pan=(dx*Math.cos(yaw)-dz*Math.sin(yaw))/Math.max(.001,distance);
  panner.pan.value=Math.max(-1,Math.min(1,pan));
  gain.connect(panner);panner.connect(masterGain);
  return gain;
}
function monsterNoise(out,duration,volume,cutoff,attack=.012,highpass=90){
  if(!out||!audioCtx)return;
  const length=Math.max(1,Math.floor(audioCtx.sampleRate*duration));
  const buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++){
    const t=i/length;
    const fade=Math.min(1,t/Math.max(.001,attack))*Math.pow(1-t,.72);
    data[i]=(Math.random()*2-1)*fade;
  }
  const source=audioCtx.createBufferSource(),low=audioCtx.createBiquadFilter(),high=audioCtx.createBiquadFilter(),env=audioCtx.createGain();
  source.buffer=buffer;
  high.type='highpass';high.frequency.value=highpass;high.Q.value=.55;
  low.type='lowpass';low.frequency.value=cutoff;low.Q.value=.75;
  env.gain.setValueAtTime(volume,audioCtx.currentTime);
  env.gain.setTargetAtTime(.0001,audioCtx.currentTime+duration*.55,.09);
  source.connect(high);high.connect(low);low.connect(env);env.connect(out);
  source.start();source.stop(audioCtx.currentTime+duration+.04);
}
function monsterTone(out,frequency,duration,volume,type='sine',slide=0,filterFrequency=1600,delay=0){
  if(!out||!audioCtx)return;
  const now=audioCtx.currentTime+delay,osc=audioCtx.createOscillator(),filter=audioCtx.createBiquadFilter(),env=audioCtx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(frequency,now);
  if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(35,frequency+slide),now+duration);
  filter.type='lowpass';filter.frequency.value=filterFrequency;filter.Q.value=1.35;
  env.gain.setValueAtTime(.0001,now);env.gain.linearRampToValueAtTime(volume,now+.025);
  env.gain.exponentialRampToValueAtTime(.0001,now+duration);
  osc.connect(filter);filter.connect(env);env.connect(out);
  osc.start(now);osc.stop(now+duration+.05);
}
function playMonsterAudio(kind,intensity=1){
  const base={breath:.36,vocal:.43,scream:.49,wall:.46,step:.39}[kind]||.34;
  const out=monsterAudioOutput(base*Math.max(.7,Math.min(1.4,intensity)));
  if(!out)return;
  if(kind==='breath'){
    // 저음 호흡 위에 중역의 거친 공기 흐름을 겹쳐 작은 스피커에서도 식별되게 한다.
    monsterNoise(out,.95,.78,1750,.1,170);
    monsterTone(out,118,.88,.34,'triangle',-34,850,.02);
    monsterTone(out,238,.58,.16,'sawtooth',-68,1150,.12);
  }else if(kind==='vocal'){
    // 의도적으로 내는 듯한 불규칙한 목소리: 갈라지는 중역과 낮은 공명을 겹친다.
    monsterNoise(out,1.42,.88,2600,.018,140);
    monsterTone(out,148,1.3,.46,'sawtooth',-76,1900);
    monsterTone(out,292,1.05,.25,'triangle',-132,2100,.07);
    monsterTone(out,438,.82,.13,'sawtooth',-190,2400,.14);
    monsterTone(out,82,1.5,.24,'sine',-24,430,.12);
  }else if(kind==='scream'){
    monsterNoise(out,1.72,.95,3300,.012,180);
    monsterTone(out,220,1.48,.48,'sawtooth',-145,2500);
    monsterTone(out,365,1.12,.3,'triangle',-205,2800,.06);
    monsterTone(out,510,.88,.16,'sawtooth',-270,3000,.13);
    monsterTone(out,105,1.8,.28,'sine',-36,520,.1);
  }else if(kind==='wall'){
    // 벽 타격: 짧은 고역 충격 + 둔탁한 중저역 잔향
    monsterNoise(out,.28,.95,2800,.003,130);
    monsterTone(out,112,.48,.55,'sine',-52,520);
    monsterTone(out,246,.58,.3,'triangle',-96,1150,.025);
    monsterTone(out,392,.34,.12,'sawtooth',-130,1800,.04);
  }else if(kind==='step'){
    // 발소리마다 선명한 어택과 두 겹의 둔탁한 울림을 넣는다.
    monsterNoise(out,.18,.8,2100,.003,150);
    monsterTone(out,104,.2,.5,'sine',-38,520);
    monsterTone(out,208,.14,.24,'triangle',-70,950,.018);
    monsterTone(out,312,.1,.1,'sawtooth',-100,1300,.025);
  }
}
function monsterHasNearbyWall(){
  const c=cellAt(monster.position);
  return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>!isOpen(c.x+dx,c.z+dz,c.floor));
}
function updateMonsterAudio(now,distance,moving,speed){
  if(!audioCtx||document.hidden||!running||paused||gameOver)return;
  const arousal=monsterArousal
  const intensity=.78+arousal/145;
  const chargingPlayer=monsterState==='chase';
  // 추격 상태는 흥분도가 낮아도 실제 달리는 발소리를 낸다.
  if(moving&&(chargingPlayer||speed>2.7)&&now-lastMonsterStepAt>(chargingPlayer?.34:speed>3.5?.38:.52)){
    playMonsterAudio('step',intensity+(chargingPlayer?.16:0));lastMonsterStepAt=now;
  }
  if(now>=nextMonsterBreathAt){
    if(distance<cell*22)playMonsterAudio('breath',intensity);
    nextMonsterBreathAt=now+(arousal>=70?2.8+Math.random()*1.8:arousal>=35?4+Math.random()*2.4:5.5+Math.random()*3.2);
  }
  if(now>=nextMonsterVocalAt){
    if(distance<cell*22){
      const kind=arousal>=68&&Math.random()<.48?'scream':'vocal';
      playMonsterAudio(kind,intensity);
    }
    const interval=arousal>=75?5.5+Math.random()*3.5:arousal>=50?7.5+Math.random()*4:arousal>=25?10+Math.random()*5:13+Math.random()*7;
    nextMonsterVocalAt=now+interval;
  }
  // 추격 중이 아니면 벽을 두드리는 행동을 불규칙하게 섞는다.
  if(now>=nextMonsterWallAt){
    if(!chargingPlayer&&monsterHasNearbyWall()&&distance<cell*20)playMonsterAudio('wall',intensity);
    nextMonsterWallAt=now+9+Math.random()*10;
  }
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
  lastHeard={cell:{x:c.x,z:c.z,floor:c.floor??currentFloorIndex},type,volume};lastHeardAt=now;
  soundAlertUntil=Math.max(soundAlertUntil,now+8);
  monsterTarget={...c};monsterState='investigate';pathRefresh=0;
}
function wallCountBetween(a,b){
  if((a.floor??currentFloorIndex)!==(b.floor??currentFloorIndex))return 9;
  let blocked=0;const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))*2;
  for(let i=1;i<steps;i++){const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),z=Math.round(a.z+(b.z-a.z)*t);if(!isOpen(x,z,a.floor??currentFloorIndex))blocked++;}
  return blocked;
}
function soundCanBeHeard(a,b,volume,type){
  const d=Math.hypot(a.x-b.x,a.z-b.z),walls=wallCountBetween(a,b),floorPenalty=Math.abs((a.floor??currentFloorIndex)-(b.floor??currentFloorIndex))*7;
  const effective=d+walls*1.5+floorPenalty;

  // 숨소리와 바닥 삐걱임은 바로 근처에서만 들린다.
  // 감지기와 충전음은 기존처럼 벽을 감안해도 먼 거리까지 전달된다.
  if(type==='breath'||type==='creak')return effective<=2.0;
  if(type==='water')return effective<=volume*16+2;
  // 달리기 발자국은 가까운 거리에서만 들리고, 걷기 발자국 이벤트는 발생시키지 않는다.
  if(type==='run')return effective<=4.0;
  if(type==='detector'||type==='charge')return effective<=(volume*14+1);
  return effective<=(volume*14+1);
}
function hasLineOfSight(a,b){
  if((a.floor??currentFloorIndex)!==(b.floor??currentFloorIndex))return false;
  const steps=Math.max(Math.abs(b.x-a.x),Math.abs(b.z-a.z))*3;
  for(let i=1;i<steps;i++){const t=i/steps,x=Math.round(a.x+(b.x-a.x)*t),z=Math.round(a.z+(b.z-a.z)*t);if(!isOpen(x,z,a.floor??currentFloorIndex))return false;}return true;
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
  const floorBase=floorY(currentFloorIndex);
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
    for(const y of [floorBase+.018,floorBase+CONFIG.wallHeight-.018]){
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
        const y0=floorBase+.025,y1=floorBase+CONFIG.wallHeight-.025;
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
  if(currentFloorIndex===4){showMessage('전파가 차단된 지하 설비구역이다. 감지기를 사용할 수 없다.');return;}
  if(activeStation||now<detectorCooldownUntil)return;
  if(battery<=0){showMessage('감지기 배터리가 부족하다.');return;}
  battery--;detectorUntil=now+CONFIG.detectorSeconds;detectorCooldownUntil=now+5;
  triggerDetectorScan();
  setMonsterVisible(true,false);playNoise('detector',player.position,1.15);
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
  $('scanBtn').disabled=battery<=0||!!activeStation||currentFloorIndex===4||!!floorTransition||performance.now()/1000<detectorCooldownUntil;
}
function inStairwellFootprint(x,z,floorIndex=currentFloorIndex){
  for(const shaft of [STAIR_UP,STAIR_DOWN]){
    const p=world({...shaft,floor:floorIndex});
    if(Math.abs(x-p.x)<1.58&&Math.abs(z-p.z)<3.34)return true;
  }
  return false;
}
function collides(x,z){
  if(!stairTraversal&&inStairwellFootprint(x,z))return true;
  const r=player.radius,checks=[[x-r,z-r],[x+r,z-r],[x-r,z+r],[x+r,z+r]];
  return checks.some(([px,pz])=>{const c=cellAt({x:px,z:pz,y:floorY(currentFloorIndex)});return !isOpen(c.x,c.z,currentFloorIndex);});
}
function isFloodedFloor(floorIndex){return floorIndex===3;}
function stairStartFor(shaftName,shaft){
  const p=world({...shaft,floor:currentFloorIndex}),length=24*.28,ascending=shaftName==='down';
  return {shaftName,shaft,fromFloor:currentFloorIndex,toFloor:currentFloorIndex+(ascending?1:-1),
    startZ:p.z+(ascending?length/2:-length/2),endZ:p.z-(ascending?length/2:-length/2),
    direction:ascending?-1:1,length};
}
function beginStairTraversalIfEntering(dir,targetX=player.position.x,targetZ=player.position.z){
  if(stairTraversal)return false;
  for(const [name,shaft] of [['up',STAIR_UP],['down',STAIR_DOWN]]){
    if((name==='up'&&currentFloorIndex===0)||(name==='down'&&currentFloorIndex===FLOOR_LABELS.length-1))continue;
    const data=stairStartFor(name,shaft),centerX=world({...shaft,floor:currentFloorIndex}).x;
    if(dir.z*data.direction>.38&&Math.abs(targetX-centerX)<.82&&Math.abs(targetZ-data.startZ)<.92){
      stairTraversal={...data,stepCount:24};stairLock=name;
      showMessage(name==='down'?'계단을 내려갑니다':'계단을 올라갑니다',850);return true;
    }
  }
  return false;
}
function updateStairTraversal(){
  if(!stairTraversal)return;
  const t=stairTraversal,progress=THREE.MathUtils.clamp((player.position.z-t.startZ)/(t.endZ-t.startZ),0,1);
  const step=Math.min(t.stepCount,Math.floor(progress*t.stepCount+1e-5));
  player.position.y=floorY(t.fromFloor)+(floorY(t.toFloor)-floorY(t.fromFloor))*(step/t.stepCount);
  if(progress>=1){
    player.position.z=t.endZ;player.position.y=floorY(t.toFloor);
    currentFloorIndex=t.toFloor;maze=facilityMazes[currentFloorIndex];floorNoise=facilityNoise[currentFloorIndex];
    lastSurfaceCellKey='';stairTraversal=null;updateFloorBadge();updateFloorVisibility();
    const panel=$('minimapPanel');if(panel){panel.classList.add('floor-switching');setTimeout(()=>panel.classList.remove('floor-switching'),420);}
    showMessage(FLOOR_LABELS[currentFloorIndex]+' 도착',1000);
  }else if(progress<=0&&((t.direction<0&&player.position.z>t.startZ+.15)||(t.direction>0&&player.position.z<t.startZ-.15))){
    player.position.y=floorY(t.fromFloor);stairTraversal=null;stairLock=null;
  }
}
function movePlayer(dt){
  const mag=Math.hypot(joystick.x,joystick.y);if(mag<.08)return false;
  const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const dir=forward.clone().multiplyScalar(-joystick.y).add(right.multiplyScalar(joystick.x)).normalize();
  const wantsRun=runHeld&&!sprintExhausted&&stamina>0.002;
  const flooded=isFloodedFloor(currentFloorIndex),normalSpeed=flooded?(wantsRun?3.75:1.72):(wantsRun?5.0:2.35);
  let moved=false;
  if(stairTraversal){
    const stairSpeed=wantsRun?2.8:1.85;
    if(Math.abs(dir.z)>.32){
      const nextZ=player.position.z+dir.z*stairSpeed*dt;
      const centerX=world({...stairTraversal.shaft,floor:currentFloorIndex}).x;
      player.position.x=THREE.MathUtils.clamp(player.position.x+dir.x*stairSpeed*dt,centerX-.48,centerX+.48);
      player.position.z=THREE.MathUtils.clamp(nextZ,Math.min(stairTraversal.startZ,stairTraversal.endZ),Math.max(stairTraversal.startZ,stairTraversal.endZ));
      updateStairTraversal();moved=true;
    }
    return moved;
  }
  const dx=dir.x*normalSpeed*dt,dz=dir.z*normalSpeed*dt;
  const targetX=player.position.x+dx,targetZ=player.position.z+dz;
  // 계단 진입은 일반 바닥 충돌보다 먼저 판정한다. 계단실을 가로질러 빠져나가는 길은 막는다.
  if(beginStairTraversalIfEntering(dir,targetX,targetZ)){
    const t=stairTraversal,stairSpeed=wantsRun?2.8:1.85;
    const centerX=world({...t.shaft,floor:currentFloorIndex}).x;
    player.position.x=THREE.MathUtils.clamp(targetX,centerX-.48,centerX+.48);
    player.position.z=THREE.MathUtils.clamp(targetZ,Math.min(t.startZ,t.endZ),Math.max(t.startZ,t.endZ));
    updateStairTraversal();return true;
  }
  if(!collides(targetX,player.position.z)){player.position.x=targetX;moved=true;}
  if(!collides(player.position.x,targetZ)){player.position.z=targetZ;moved=true;}
  return moved;
}
function distanceToMonster(){return monster.position.distanceTo(player.position);}
function updatePlayer(dt,now){
  if(floorTransition){updateFloorTransitionFrame(dt);updateHud();return;}
  const isMoving=Math.hypot(joystick.x,joystick.y)>.08;
  const wantsRun=isMoving&&runHeld&&!sprintExhausted&&stamina>0.001;
  if(wantsRun){const before=stamina;stamina=Math.max(0,stamina-dt/CONFIG.staminaRunSeconds);if(stamina<=0){sprintExhausted=true;if(before>.001)showMessage('스태미나가 부족합니다.');}}
  else stamina=Math.min(1,stamina+dt/CONFIG.staminaRecoverySeconds);
  if(!runHeld&&stamina>0.001)sprintExhausted=false;
  const moved=movePlayer(dt);
  // 숨소리는 달리기 중·완충 상태에는 없고, 걷는 중 실제 회복 중일 때만 발생
  if(!wantsRun&&stamina<.999&&now-lastBreath>=1.35){breathingSound();lastBreath=now;}
  if(moved&&now-lastStep>(isFloodedFloor(currentFloorIndex)?(wantsRun ? .46 : .9):(wantsRun ? .34 : .72))){
    lastStep=now;const c=cellAt(player.position),surface=floorNoise[c.z]?.[c.x],surfaceKey=key(c);
    if(isFloodedFloor(currentFloorIndex)){playNoise('water',player.position,wantsRun?1.35:.82);lastSurfaceCellKey=surfaceKey;}
    else if(surface&&surfaceKey!==lastSurfaceCellKey){
      lastSurfaceCellKey=surfaceKey;
      if(surface==='creak'){if(now-lastCreakAt>=8+Math.random()*4){playNoise('creak',player.position,wantsRun?1.25:.72);lastCreakAt=now;}}
      else playNoise(surface,player.position,wantsRun?1.25:.72);
    }else if(!surface){lastSurfaceCellKey=surfaceKey;if(wantsRun)playNoise('run',player.position,1.15);}
  }
  if(!isMoving)runHeld=false;
  if(stairTraversal)updateStairTraversal();
  const here=cellAt(player.position);
  // 충전 구역: 1초마다 배터리 1칸, 5초 완충. 도중 이탈하면 해당 장치 소멸.
  const station=stations.find(s=>s.cell.x===here.x&&s.cell.z===here.z&&(s.cell.floor??1)===currentFloorIndex);
  if(station&&battery<CONFIG.detectorCapacity){
    if(activeStation!==station){activeStation=station;stationProgress=0;}
    stationProgress+=dt;
    if(chargingGain)chargingGain.gain.setTargetAtTime(.075,audioCtx.currentTime,.08);
    if(now-lastChargeSound>.95){playNoise('charge',player.position,.85);lastChargeSound=now;}
    while(stationProgress>=1&&battery<CONFIG.detectorCapacity){stationProgress-=1;battery++;updateHud();showMessage('배터리 충전 중 · '+battery+'/5',900);}
    if(battery>=CONFIG.detectorCapacity){if(chargingGain&&audioCtx)chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.06);activeStation=null;stationProgress=0;removeStation(station);}
  }else if(activeStation){if(chargingGain&&audioCtx)chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.06);const used=activeStation;activeStation=null;stationProgress=0;removeStation(used);
  }else if(chargingGain&&audioCtx){chargingGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
  setMonsterVisible(true,false);
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
  const sees=mc.floor===pc.floor&&distance<cell*8&&hasLineOfSight(mc,pc);
  if(sees){
    sightAlertUntil=now+12;
    monsterState='chase';lastSeen={...pc};searchUntil=now+12;monsterTarget={...pc};
  }else if(monsterState==='chase'){
    if(lastSeen){monsterState='search';monsterTarget={...lastSeen};searchUntil=now+12;}
  }
  if(monsterState==='investigate'&&monsterTarget&&nodeKey(mc)===nodeKey(monsterTarget)){
    monsterState='search';searchUntil=Math.max(searchUntil,now+5);
  }
  if(monsterState==='search'&&now>searchUntil){
    if(lastHeard&&now-lastHeardAt<16){monsterState='investigate';monsterTarget={...lastHeard.cell};}
    else{monsterState='wander';monsterTarget=null;}
  }
  if(monsterState==='wander'&&(!monsterTarget||nodeKey(mc)===nodeKey(monsterTarget)))monsterTarget=randomOpen([exitCell,spawnCell],mc.floor);
  if(monsterState==='chase'&&lastSeen)monsterTarget={...lastSeen};
  if(now-pathRefresh>.55||path.length===0){path=findPath(mc,monsterTarget);pathRefresh=now;}
  let targetPoint=null;
  if(path.length){targetPoint=world(path[0]);}
  else if(monsterTarget)targetPoint=world(monsterTarget);
  // 같은 통로 칸에 들어온 뒤에는 칸 중앙이 아니라 플레이어의 실제 좌표를 추격한다.
  // 그렇지 않으면 플레이어가 칸 가장자리에 정지했을 때 포획 거리까지 접근하지 못할 수 있다.
  if(monsterState==='chase'&&mc.floor===pc.floor&&mc.x===pc.x&&mc.z===pc.z){
    targetPoint=new THREE.Vector3(player.position.x,monster.position.y,player.position.z);
  }
  const alertLevel=now<sightAlertUntil?4:now<locationAlertUntil?3:now<soundAlertUntil?2:1;
  // 흥분도 0~100%에 비례해 속도를 2.35~4.80으로 부드럽게 보간한다.
  const speed=2.35+(4.8-2.35)*(monsterArousal/100);
  let moving=false;
  if(targetPoint){
    const dx=targetPoint.x-monster.position.x,dy=targetPoint.y-monster.position.y,dz=targetPoint.z-monster.position.z,len=Math.hypot(dx,dy,dz);
    if(len<.25){if(path.length)path.shift();}
    else{const step=Math.min(len,speed*dt);monster.position.x+=dx/len*step;monster.position.y+=dy/len*step;monster.position.z+=dz/len*step;moving=true;}
  }
  monsterAnimTime+=dt;
  const gaitRate=alertLevel>=4?7.4:alertLevel>=3?5.4:3.25;
  const phase=monsterAnimTime*gaitRate;
  const leftPhase=phase,rightPhase=phase+Math.PI;
  const drive=moving?1:0;
  const leftStride=Math.sin(leftPhase),rightStride=Math.sin(rightPhase);
  const leftLift=Math.max(0,Math.cos(leftPhase)),rightLift=Math.max(0,Math.cos(rightPhase));
  if(monsterRig){
    const reach=alertLevel>=4?.52:alertLevel>=3?.39:.25;
    monsterRig.armLeft.rotation.x=-.08+leftStride*reach*drive;
    monsterRig.armRight.rotation.x=-.02+rightStride*reach*.82*drive;
    monsterRig.armLeft.rotation.z=-.12+leftLift*.12*drive;
    monsterRig.armRight.rotation.z=.10-rightLift*.10*drive;
    monsterRig.elbowLeft.rotation.x=-.42-leftLift*.46*drive;
    monsterRig.elbowRight.rotation.x=-.30-rightLift*.52*drive;
    monsterRig.wristLeft.rotation.x=.08+Math.sin(leftPhase-.7)*.13*drive;
    monsterRig.wristRight.rotation.x=-.06+Math.sin(rightPhase-.55)*.15*drive;
    monsterRig.legLeft.rotation.x=-leftStride*.42*drive;
    monsterRig.legRight.rotation.x=-rightStride*.48*drive;
    monsterRig.kneeLeft.rotation.x=leftLift*.78*drive;
    monsterRig.kneeRight.rotation.x=rightLift*.88*drive;
    monsterRig.footLeft.rotation.x=-leftLift*.16*drive;
    monsterRig.footRight.rotation.x=-rightLift*.18*drive;
    monsterRig.pelvis.rotation.y=Math.sin(phase)*.045*drive;
    monsterRig.spine.rotation.x=(moving?-.025:0)+Math.sin(phase*2-.25)*.022*drive;
    monsterRig.spine.rotation.y=-Math.sin(phase)*.028*drive;
    monsterRig.chest.rotation.x=(moving?-.035:0)+Math.sin(phase*2+.35)*.028*drive;
    monsterRig.chest.rotation.y=Math.sin(phase+.4)*.045*drive;
    monsterRig.neck.rotation.z=Math.sin(monsterAnimTime*1.15)*.025+(alertLevel>=4?-.035:0);
    monsterRig.upperBody.rotation.x=(moving?-.055:0)+Math.sin(phase*2)*.025*drive;
    monsterRig.upperBody.rotation.y=Math.sin(phase)*.075*drive;
    monsterRig.upperBody.rotation.z=Math.sin(phase)*.035*drive;
    monsterRig.upperBody.scale.y=1+(moving?Math.abs(Math.sin(phase*2))*.006:Math.sin(monsterAnimTime*1.8)*.009);
    monsterRig.head.rotation.x=(alertLevel>=4?-.16:-.035)+Math.sin(monsterAnimTime*1.1-.4)*.035;
    monsterRig.head.rotation.y=Math.sin(monsterAnimTime*.73)*.055+(alertLevel>=2?.035:0);
    monsterRig.head.rotation.z=Math.sin(monsterAnimTime*.82-.35)*.045+(alertLevel>=2?.025:0);
    monsterRig.jaw.rotation.x=.025+Math.max(0,Math.sin(monsterAnimTime*2.15))*.055+(alertLevel>=4?.045:0);
  }
  const bodyBob=moving?Math.abs(Math.sin(phase*2))*.045:Math.sin(monsterAnimTime*1.8)*.014;
  monsterGroup.position.set(monster.position.x,monster.position.y+bodyBob,monster.position.z);
  monsterGroup.rotation.y=Math.atan2(player.position.x-monster.position.x,player.position.z-monster.position.z);
  if(distance<.9)finish(false);
  updateMonsterAudio(now,distance,moving,speed);
}
function updateAmbient(now){
  if(now-lastAmbient>12){lastAmbient=now;if(Math.random()<.35)tone(42+Math.random()*18,1.4,'sine',.018,-8);}
}
function drawMinimap(now){
  const canvas=$('minimap');if(!canvas||!player||!maze.length)return;
  const ctx=canvas.getContext('2d'),size=canvas.width,step=size/CONFIG.mazeSize,pc=cellAt(player.position),f=currentFloorIndex,map=facilityMazes[f],seen=exploredFloors[f];
  for(let z=Math.max(0,pc.z-7);z<=Math.min(CONFIG.mazeSize-1,pc.z+7);z++)for(let x=Math.max(0,pc.x-7);x<=Math.min(CONFIG.mazeSize-1,pc.x+7);x++)if(Math.hypot(x-pc.x,z-pc.z)<=7.4)seen[z][x]=true;
  ctx.clearRect(0,0,size,size);ctx.fillStyle='#080e13';ctx.fillRect(0,0,size,size);
  for(let z=0;z<CONFIG.mazeSize;z++)for(let x=0;x<CONFIG.mazeSize;x++){
    if(!seen[z][x])continue;const px=x*step,py=z*step;
    ctx.fillStyle=map[z][x]?'#87949b':'#263941';ctx.fillRect(px,py,step+.15,step+.15);
    if(!map[z][x]){ctx.fillStyle='rgba(115,151,159,.12)';ctx.fillRect(px+.5,py+.5,step-1,step-1);}
  }
  for(const [p,label] of [[STAIR_UP,'↑'],[STAIR_DOWN,'↓']])if(seen[p.z][p.x]){ctx.fillStyle='#d0b879';ctx.font='bold 9px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,(p.x+.5)*step,(p.z+.5)*step);}
  if(exitCell.floor===f&&seen[exitCell.z][exitCell.x]){ctx.fillStyle='#e7d18a';ctx.fillRect(exitCell.x*step+step*.2,exitCell.z*step+step*.2,step*.6,step*.6);}
  for(const s of stations)if((s.cell.floor??1)===f&&seen[s.cell.z][s.cell.x]){ctx.fillStyle='#66d4d2';ctx.beginPath();ctx.arc((s.cell.x+.5)*step,(s.cell.z+.5)*step,Math.max(1.5,step*.28),0,Math.PI*2);ctx.fill();}
  const mc=cellAt(monster.position);
  if(now<detectorUntil&&f!==4&&mc.floor===f&&Math.abs(mc.x-pc.x)<=7&&Math.abs(mc.z-pc.z)<=7){ctx.fillStyle='#ff3434';ctx.shadowColor='#ff2424';ctx.shadowBlur=8;ctx.beginPath();ctx.arc((mc.x+.5)*step,(mc.z+.5)*step,Math.max(2.2,step*.42),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  const px=(pc.x+.5)*step,py=(pc.z+.5)*step;ctx.save();ctx.translate(px,py);ctx.rotate(-yaw);
  ctx.fillStyle='#f4f6f7';ctx.strokeStyle='#101820';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-step*.9);ctx.lineTo(step*.62,step*.62);ctx.lineTo(0,step*.3);ctx.lineTo(-step*.62,step*.62);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  ctx.strokeStyle='#9cabb4';ctx.lineWidth=1.4;ctx.strokeRect(.7,.7,size-1.4,size-1.4);
}
function animate(){
  requestAnimationFrame(animate);if(!renderer)return;
  const dt=Math.min(clock.getDelta(),.05),now=performance.now()/1000;
  if(running&&!gameOver){updatePlayer(dt,now);monsterUpdate(dt,now);updateAmbient(now);setCamera();}
  if(factoryHaze)factoryHaze.rotation.y+=dt*.008;
  if(scene?.fog)scene.fog.density=currentFloorIndex === 2 ? .004 : .0018;
  updateSoundMeters(dt);
  drawMinimap(now);
  updateDetectorScan(now);
  if(exitMesh)exitMesh.rotation.y+=dt*.08;
  for(const s of stations)if(s.mesh){s.mesh.rotation.y+=dt*.35;}
  renderer.render(scene,camera);
}
function finish(success){
  if(gameOver)return;stopHorrorMusic();gameOver=true;running=false;paused=false;runHeld=false;$('pauseModal').classList.add('hidden');
  $('endEyebrow').textContent=success?'ESCAPED':'FOUND';
  $('endTitle').textContent=success?'탈출 성공':'괴물에게 붙잡혔다';
  $('endText').textContent=success?'복합 시설을 빠져나왔다.':'다음에는 소리를 더 신중하게 관리해야 한다.';
  $('message').classList.remove('show');$('endScreen').classList.remove('hidden');$('game').classList.remove('playing');
}
function resetGame(){
  if(scene){
    while(scene.children.length)scene.remove(scene.children[0]);
    scene.add(new THREE.HemisphereLight(0x9aaab4,0x252b30,.42));
    const keyLight=new THREE.DirectionalLight(0x9eabb3,.10);keyLight.position.set(-10,20,8);scene.add(keyLight);
    scene.add(new THREE.AmbientLight(0x87939a,.26));
    scene.add(camera);
  }
  if(chargingGain&&audioCtx)chargingGain.gain.setValueAtTime(0,audioCtx.currentTime);
  paused=false;stamina=1;sprintExhausted=false;battery=CONFIG.detectorCapacity;detectorUntil=0;detectorCooldownUntil=0;joystick={x:0,y:0};runHeld=false;currentFloorIndex=1;floorTransition=null;stairLock=null;stairTraversal=null;
  const now=performance.now()/1000;
  monsterState='wander';monsterTarget=null;lastSeen=null;lastHeard=null;lastHeardAt=0;path=[];pathRefresh=0;stationProgress=0;activeStation=null;lastStep=0;lastBreath=0;lastChargeSound=0;lastAmbient=0;lastMonsterStepAt=now;nextMonsterBreathAt=now+2+Math.random()*3;nextMonsterVocalAt=now+7+Math.random()*6;nextMonsterWallAt=now+12+Math.random()*10;nextMonsterSound=0;
  nextLocationPing=now+20+Math.random()*20;soundAlertUntil=0;locationAlertUntil=0;sightAlertUntil=0;lastSurfaceCellKey='';lastCreakAt=-Infinity;
  monsterArousal=0;lastNoiseEventAt=-Infinity;arousalDecayStart=0;playerNoiseLevel=0;
  generateMaze();buildWorld();setupPlayerAndMonster();updateFloorVisibility();updateHud();gameOver=false;
}
function startGame(){
  if(updatePending){window.location.reload();return;}
  try{
    if(!renderer)initThree();
    if(!scene||!clock)throw new Error('게임 그래픽 초기화가 완료되지 않았습니다.');
    ensureAudio();startHorrorMusic();resetGame();paused=false;$('pauseModal').classList.add('hidden');clock.start();running=true;
    $('startScreen').classList.add('hidden');$('endScreen').classList.add('hidden');
    $('game').classList.add('playing');
    if(screen.orientation?.lock)screen.orientation.lock('landscape').catch(()=>{});
    showMessage('소리를 조심해라. 출구는 하나다.',2400);
  }catch(error){
    console.error('SILENCE 게임 시작 실패:',error);
    alert('게임을 시작하지 못했습니다. 그래픽 초기화 오류가 발생했습니다. 앱을 다시 열어 주세요.');
  }
}
function updateAudioOutput(){
  if(!masterGain||!audioCtx)return;
  masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
  masterGain.gain.setTargetAtTime(audioMuted||paused||document.hidden||!running||gameOver?0:.55,audioCtx.currentTime,.035);
}
function suspendGameAudio(){
  if(!audioCtx)return;
  if(masterGain){
    masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    masterGain.gain.setValueAtTime(0,audioCtx.currentTime);
  }
  if(audioCtx.state==='running')audioCtx.suspend().catch(()=>{});
}
function restoreGameAudio(){
  if(!audioCtx||document.hidden||!running||paused||gameOver||audioMuted)return;
  if(audioCtx.state==='suspended'){
    audioCtx.resume().then(()=>updateAudioOutput()).catch(()=>{});
  }else updateAudioOutput();
}
function handleAppVisibility(){
  if(document.hidden){
    runHeld=false;joystick={x:0,y:0};
    suspendGameAudio();
  }else restoreGameAudio();
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
  stopHorrorMusic();running=false;paused=false;gameOver=true;runHeld=false;joystick={x:0,y:0};
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
  renderer?.domElement.addEventListener('pointerdown',e=>{const portrait=getViewportSize().portrait;if(portrait?e.clientY<innerHeight*.38:e.clientX<innerWidth*.38)return;lookPointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;});
  window.addEventListener('pointermove',e=>{if(lookPointer!==e.pointerId)return;const rawX=e.clientX-lastX,rawY=e.clientY-lastY;lastX=e.clientX;lastY=e.clientY;const portrait=getViewportSize().portrait,dx=portrait?rawY:rawX,dy=portrait?-rawX:rawY;yaw-=dx*.0045;pitch=Math.max(-1.05,Math.min(1.05,pitch-dy*.0035));});
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
  $('brightnessSlider').value='40';
  $('brightnessValue').textContent='40%';
  if(renderer)renderer.toneMappingExposure=displayBrightness;
  $('brightnessSlider').addEventListener('input',e=>{
    brightnessPercent=Number(e.target.value);
    displayBrightness=1.25*(brightnessPercent/100);
    $('brightnessValue').textContent=brightnessPercent+'%';
    if(renderer)renderer.toneMappingExposure=displayBrightness;
  });
  const applyFlashlightBrightness=value=>{
    flashlightBrightnessPercent=Number(value);
    $('flashlightValue').textContent=flashlightBrightnessPercent+'%';
    if(flashlightMain)flashlightMain.intensity=1800*(flashlightBrightnessPercent/100);
    if(flashlightFill)flashlightFill.intensity=380*(flashlightBrightnessPercent/100);
    if(flashlightNearFill)flashlightNearFill.intensity=90*(flashlightBrightnessPercent/100);
  };
  $('flashlightSlider').value='10';
  applyFlashlightBrightness(10);
  $('flashlightSlider').addEventListener('input',e=>applyFlashlightBrightness(e.target.value));
  $('exitGameBtn').addEventListener('click',exitToMenu);
  $('scanBtn').addEventListener('click',useDetector);
  $('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);
  $('guideBtn').addEventListener('click',()=>{$('guideModal').classList.remove('hidden');});$('closeGuideBtn').addEventListener('click',()=>$('guideModal').classList.add('hidden'));$('menuBtn').addEventListener('click',()=>{if(updatePending){window.location.reload();return;}$('endScreen').classList.add('hidden');$('startScreen').classList.remove('hidden');});window.addEventListener('keydown',e=>{if(e.key==='Escape')$('guideModal').classList.add('hidden');});
  const handleViewportChange=()=>syncGameViewport();
  window.addEventListener('resize',handleViewportChange,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(handleViewportChange,120),{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',handleViewportChange,{passive:true});
    window.visualViewport.addEventListener('scroll',handleViewportChange,{passive:true});
  }
  document.addEventListener('visibilitychange',handleAppVisibility);
  window.addEventListener('pagehide',suspendGameAudio);
  window.addEventListener('pageshow',handleAppVisibility);
  document.addEventListener('freeze',suspendGameAudio);
  document.addEventListener('resume',handleAppVisibility);
}
let updatePending=false;
function applyPendingUpdate(){
  if(updatePending){window.location.reload();}
}
function boot(){
  // 메뉴 입력을 그래픽 초기화보다 먼저 연결한다. WebGL 초기화 실패가 메뉴 전체를 멈추게 해서는 안 된다.
  bindControls();
  try{
    initThree();generateMaze();buildWorld();
    loadEnvironmentAssets(THREE,renderer,floorGroups,world,floorY).catch(error=>console.warn('SILENCE 환경 에셋 로딩 실패:',error));
    setupPlayerAndMonster();updateHud();animate();
  }catch(error){
    console.error('SILENCE 게임 초기화 실패:',error);
    window.__silenceInitError=error;
  }
  if('serviceWorker' in navigator){
    let registration=null;
    const checkForAppUpdate=()=>{
      if(registration&&navigator.onLine)registration.update().catch(error=>console.warn('SILENCE 업데이트 확인 실패:',error));
    };
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      updatePending=true;
      if(!running)window.location.reload();
    });
    window.addEventListener('load',async()=>{
      try{
        registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
        await registration.update();
        const watchInstallingWorker=worker=>{
          if(!worker)return;
          worker.addEventListener('statechange',()=>{
            if(worker.state==='installed'&&navigator.serviceWorker.controller){
              updatePending=true;
              worker.postMessage({type:'SKIP_WAITING'});
            }
          });
        };
        registration.addEventListener('updatefound',()=>watchInstallingWorker(registration.installing));
        if(registration.installing)watchInstallingWorker(registration.installing);
        if(registration.waiting&&navigator.serviceWorker.controller){
          updatePending=true;
          registration.waiting.postMessage({type:'SKIP_WAITING'});
        }
        document.addEventListener('visibilitychange',()=>{
          if(!document.hidden)checkForAppUpdate();
        });
        window.addEventListener('focus',checkForAppUpdate);
        window.addEventListener('pageshow',checkForAppUpdate);
        window.setInterval(checkForAppUpdate,60000);
      }catch(error){console.warn('SILENCE 업데이트 확인 실패:',error);}
    },{once:true});
  }
}
boot();