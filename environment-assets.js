// SILENCE photoreal environment asset pipeline.
// Models are pinned CC0 GLB releases from tevy.dev; GLB files include their PBR materials/textures.
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js';

const MODEL_BASE = 'https://tevy.dev/models/';

const ASSETS = {
  gurney: 'abandoned-hospital-gurney/v1/lod0.glb',
  wheelchair: 'abandoned-folding-wheelchair/v1/lod0.glb',
  ivStand: 'abandoned-iv-stand/v1/lod0.glb',
  instrumentTrolley: 'abandoned-instrument-trolley/v1/lod0.glb',
  privacyScreen: 'torn-hospital-privacy-screen/v1/lod0.glb',
  hospitalWard: 'hospital-ward/v2/lod0.glb',
  operatingTheatre: 'operating-theatre/v2/lod0.glb',
  controlRoom: 'control-room/v1/lod0.glb',
  robotArm: 'robot-arm/v1/lod0.glb',
  serverRoom: 'server-room/v1/lod0.glb',
  factoryHall: 'factory-hall/v1/lod0.glb',
  cncMachine: 'cnc-machine-set/v1/lod0.glb',
  transferTower: 'conveyor-transfer-tower/v1/lod0.glb',
  conveyorHead: 'conveyor-head-pulley/v1/lod1.glb',
  conveyorStraight: 'conveyor-roller-straight/v1/lod1.glb',
  conveyorTransfer: 'conveyor-belt-transfer/v1/lod1.glb',
  forklift: 'forklift/v1/lod1.glb',
  palletRack: 'steel-pallet-rack/v1/lod1.glb',
  steamPipeRun: 'steam-pipe-run/v1/lod1.glb',
  toolChestBench: 'tool-chest-bench/v1/lod1.glb',
  sewerStraight: 'brick-sewer-tunnel-straight/v1/lod1.glb',
  sewerCorner: 'brick-sewer-tunnel-corner/v1/lod1.glb',
  sewerTJunction: 'brick-sewer-tunnel-t-junction/v1/lod1.glb'
};

const environmentCollisionRects = [];
export function getEnvironmentCollisionRects(){ return environmentCollisionRects; }

const PLACEMENTS = [
  {asset:'hospitalWard',floor:0,x:5.5,z:5.5,rotation:0},
  {asset:'operatingTheatre',floor:0,x:14.5,z:5.5,rotation:0},
  {solid:true,asset:'privacyScreen',floor:0,x:34,z:6.1,rotation:Math.PI*.5},
  {solid:true,asset:'wheelchair',floor:0,x:34,z:34,rotation:-.25},
  {solid:true,asset:'gurney',floor:0,x:5.4,z:14.4,rotation:Math.PI*.5,scale:.78},
  {solid:true,asset:'ivStand',floor:0,x:14.3,z:14.2,rotation:0,scale:.9},
  {solid:true,asset:'instrumentTrolley',floor:0,x:25.5,z:14.5,rotation:Math.PI*.5,scale:.82},
  {asset:'hospitalWard',floor:1,x:5.5,z:34.5,rotation:Math.PI},
  {solid:true,asset:'wheelchair',floor:1,x:34,z:6,rotation:Math.PI},
  {solid:true,asset:'instrumentTrolley',floor:1,x:34,z:34,rotation:-Math.PI*.5},
  {solid:true,asset:'gurney',floor:1,x:14.5,z:5.5,rotation:0,scale:.78},
  {solid:true,asset:'ivStand',floor:1,x:25.5,z:5.5,rotation:Math.PI*.5,scale:.9},
  {solid:true,asset:'privacyScreen',floor:1,x:5.5,z:14.5,rotation:0,scale:.85},
  {asset:'controlRoom',floor:2,x:8,z:8,rotation:0},
  {asset:'factoryHall',floor:2,x:8,z:20,rotation:0,scale:.68},
  {solid:true,asset:'robotArm',floor:2,x:32,z:8,rotation:Math.PI*.5},
  {solid:true,asset:'conveyorHead',floor:2,x:32,z:16,rotation:0},
  {solid:true,asset:'conveyorStraight',floor:2,x:32,z:17.333,rotation:0,scale:.75},
  {solid:true,asset:'conveyorTransfer',floor:2,x:32,z:18.666,rotation:0,scale:.8},
  {solid:true,asset:'cncMachine',floor:2,x:32,z:22,rotation:Math.PI*.5,scale:.85},
  {solid:true,asset:'transferTower',floor:2,x:32,z:32,rotation:0},
  // Additional industrial set dressing: storage, maintenance benches, steam lines and active transport equipment.
  {solid:true,asset:'palletRack',floor:2,x:5,z:5,rotation:0,scale:.78},
  {solid:true,asset:'palletRack',floor:2,x:35,z:5,rotation:Math.PI,scale:.78},
  {solid:true,asset:'palletRack',floor:2,x:5,z:35,rotation:0,scale:.78},
  {solid:true,asset:'palletRack',floor:2,x:35,z:35,rotation:Math.PI,scale:.78},
  {solid:true,asset:'forklift',floor:2,x:18,z:8,rotation:Math.PI*.5,scale:.9},
  {solid:true,asset:'forklift',floor:2,x:23,z:33,rotation:-Math.PI*.5,scale:.9},
  {solid:true,asset:'toolChestBench',floor:2,x:6,z:7,rotation:Math.PI,scale:.9},
  {solid:true,asset:'toolChestBench',floor:2,x:35,z:7,rotation:0,scale:.9},
  {solid:true,asset:'toolChestBench',floor:2,x:6,z:34,rotation:Math.PI,scale:.9},
  {solid:true,asset:'steamPipeRun',floor:2,x:14,z:6,rotation:0,scale:1},
  {asset:'steamPipeRun',floor:2,x:14,z:10,rotation:0,scale:1},
  {asset:'steamPipeRun',floor:2,x:27,z:6,rotation:Math.PI,scale:1},
  {asset:'steamPipeRun',floor:2,x:27,z:10,rotation:Math.PI,scale:1},
  {asset:'sewerStraight',floor:3,x:20,z:8,rotation:0},
  {asset:'sewerStraight',floor:3,x:20,z:9.333,rotation:0},
  {asset:'sewerTJunction',floor:3,x:20,z:10.666,rotation:0},
  {asset:'sewerCorner',floor:3,x:20,z:12,rotation:Math.PI*.5},
  {asset:'serverRoom',floor:4,x:34,z:34,rotation:Math.PI}
];

export function shouldOmitFloor(floor,x,z){
  const inRect=(cx,cz,rx,rz)=>Math.abs(x-cx)<=rx&&Math.abs(z-cz)<=rz;
  if(floor===0&&(inRect(5.5,5.5,1.7,1.7)||inRect(14.5,5.5,1.35,1.35)))return true;
  if(floor===1&&inRect(5.5,34.5,1.7,1.7))return true;
  if(floor===2&&inRect(8,20,3.1,5.2))return true;
  if(floor===3&&x>=19&&x<=21&&z>=7&&z<=14)return true;
  return false;
}

export function shouldOmitCeiling(floor,x,z){
  const inRect=(cx,cz,rx,rz)=>Math.abs(x-cx)<=rx&&Math.abs(z-cz)<=rz;
  if(floor===0&&(inRect(5.5,5.5,1.7,1.7)||inRect(14.5,5.5,1.35,1.35)))return true;
  if(floor===1&&inRect(5.5,34.5,1.7,1.7))return true;
  if(floor===2&&(inRect(8,8,1.8,1.8)||inRect(8,20,3.1,5.2)||inRect(32,32,1.9,1.9)))return true;
  if(floor===3&&x>=19&&x<=21&&z>=7&&z<=14)return true;
  return false;
}

const SURFACE_MATERIALS = {
  hospitalFloor: {slug:'ceramic-tiles',repeat:[2.5,2.5]},
  floodedFloor: {slug:'wet-mud',repeat:[2,2]},
  hospitalWall: {slug:'white-plaster',repeat:[1.5,1.65]},
  factoryFloor: {slug:'checker-plate',repeat:[3,3]},
  factoryWall: {slug:'rusty-metal',repeat:[3,3]},
  factoryCeiling: {slug:'corrugated-metal',repeat:[3,3]},
  concrete: {slug:'worn-concrete',repeat:[1.5,1.65]}
};

async function loadPBRMaterial(THREE,renderer,ktx2Loader,definition){
  const base='https://tevy.dev/materials/'+definition.slug+'/v1/';
  const [map,normalMap,ormMap]=await Promise.all([
    ktx2Loader.loadAsync(base+'color-1k.ktx2'),
    ktx2Loader.loadAsync(base+'normal-1k.ktx2'),
    ktx2Loader.loadAsync(base+'orm-1k.ktx2')
  ]);
  map.colorSpace=THREE.SRGBColorSpace;
  const anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  for(const texture of [map,normalMap,ormMap]){
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(definition.repeat[0],definition.repeat[1]);
    texture.anisotropy=anisotropy;
    texture.needsUpdate=true;
  }
  return new THREE.MeshStandardMaterial({
    color:0xffffff,
    map,
    normalMap,
    normalScale:new THREE.Vector2(.82,.82),
    aoMap:ormMap,
    aoMapIntensity:1.15,
    roughnessMap:ormMap,
    metalnessMap:ormMap,
    roughness:1,
    metalness:0
  });
}

const surfaceMaterialPromises=new WeakMap();
async function getSurfaceMaterials(THREE,renderer,ktx2Loader){
  let pending=surfaceMaterialPromises.get(renderer);
  if(!pending){
    pending=Promise.all(Object.entries(SURFACE_MATERIALS).map(async([key,definition])=>{
      try{
        const material=await loadPBRMaterial(THREE,renderer,ktx2Loader,definition);
        console.info('[SILENCE] PBR 표면 준비 완료:',definition.slug);
        return [key,material];
      }catch(error){
        console.warn('[SILENCE] PBR 표면을 불러오지 못했습니다:',definition.slug,error);
        return [key,null];
      }
    })).then(entries=>Object.fromEntries(entries));
    surfaceMaterialPromises.set(renderer,pending);
  }
  return pending;
}

async function applyPBRMaterials(THREE,renderer,ktx2Loader,floorGroups){
  const loaded=await getSurfaceMaterials(THREE,renderer,ktx2Loader);

  for(let floor=0;floor<floorGroups.length;floor++){
    const group=floorGroups[floor];
    const floorMesh=group.getObjectByName('floor-surface');
    const wallMesh=group.getObjectByName('wall-surface');
    const ceilingMesh=group.getObjectByName('ceiling-surface');
    const floorMaterial=floor<=1?loaded.hospitalFloor:floor===2?loaded.factoryFloor:floor===3?(loaded.floodedFloor||loaded.concrete):loaded.factoryFloor;
    const wallMaterial=floor<=1?loaded.hospitalWall:floor===2||floor===4?loaded.factoryWall:loaded.concrete;
    const ceilingMaterial=floor<=1?loaded.hospitalWall:floor===2?loaded.factoryCeiling:floor===3?loaded.concrete:loaded.factoryWall;
    if(floorMesh&&floorMaterial)floorMesh.material=floorMaterial;
    if(wallMesh&&wallMaterial)wallMesh.material=wallMaterial;
    if(ceilingMesh&&ceilingMaterial)ceilingMesh.material=ceilingMaterial;
  }
}

function loadGLB(loader,url){
  return new Promise((resolve,reject)=>{
    loader.load(url,gltf=>resolve(gltf.scene),undefined,reject);
  });
}

// Cache original model prototypes across game resets. Each rebuilt floor receives
// a fresh clone, while network downloads and GPU texture preparation are reused.
const modelPrototypePromises=new Map();
function getModelPrototype(id,loader,THREE){
  if(!modelPrototypePromises.has(id)){
    const pending=loadGLB(loader,MODEL_BASE+ASSETS[id])
      .then(model=>preparePrototype(THREE,model))
      .catch(error=>{modelPrototypePromises.delete(id);throw error;});
    modelPrototypePromises.set(id,pending);
  }
  return modelPrototypePromises.get(id);
}

function preparePrototype(THREE,model){
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  if(Number.isFinite(bounds.min.y))model.position.y-=bounds.min.y;
  if(Number.isFinite(bounds.min.x)&&Number.isFinite(bounds.max.x))model.position.x-=(bounds.min.x+bounds.max.x)*.5;
  if(Number.isFinite(bounds.min.z)&&Number.isFinite(bounds.max.z))model.position.z-=(bounds.min.z+bounds.max.z)*.5;
  model.traverse(object=>{
    if(!object.isMesh)return;
    object.castShadow=true;
    object.receiveShadow=true;
    object.frustumCulled=true;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials){
      if(!material)continue;
      if('envMapIntensity' in material)material.envMapIntensity=1;
      material.needsUpdate=true;
    }
  });
  model.updateMatrixWorld(true);
  return model;
}

export async function loadEnvironmentAssets(THREE,renderer,floorGroups,world,floorY){
  environmentCollisionRects.length=0;
  const ktx2Loader=new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/')
    .detectSupport(renderer);
  const loader=new GLTFLoader();
  loader.setKTX2Loader(ktx2Loader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const surfacePromise=applyPBRMaterials(THREE,renderer,ktx2Loader,floorGroups).catch(error=>console.warn('[SILENCE] PBR 표면 적용 실패:',error));
  const prototypes=new Map();
  const assetIds=[...new Set(PLACEMENTS.map(item=>item.asset))];

  // Fetch each source model once. Instances share GPU geometry and texture memory.
  await Promise.all(assetIds.map(async id=>{
    try{
      const model=await getModelPrototype(id,loader,THREE);
      prototypes.set(id,model);
      console.info('[SILENCE] 환경 모델 준비 완료:',id);
    }catch(error){
      console.warn('[SILENCE] 환경 모델을 불러오지 못했습니다:',id,error);
    }
  }));

  let placed=0;
  for(const placement of PLACEMENTS){
    const prototype=prototypes.get(placement.asset);
    const target=floorGroups[placement.floor];
    if(!prototype||!target)continue;

    const instance=prototype.clone(true);
    const group=new THREE.Group();
    group.name='environment-asset-'+placement.asset;
    group.add(instance);

    const p=world({x:placement.x,z:placement.z,floor:placement.floor});
    group.position.set(p.x,floorY(placement.floor),p.z);
    if(placement.wallMount){group.position.y+=1.25;group.position.x-=1.5;}
    group.rotation.y=placement.rotation||0;
    const scale=placement.scale||1;
    group.scale.setScalar(scale);
    group.traverse(object=>{
      if(object.isMesh){
        object.castShadow=true;
        object.receiveShadow=true;
      }
    });
    target.add(group);
    group.updateMatrixWorld(true);
    if(placement.solid){
      const bounds=new THREE.Box3().setFromObject(group),inset=.12;
      const minX=bounds.min.x+inset,maxX=bounds.max.x-inset,minZ=bounds.min.z+inset,maxZ=bounds.max.z-inset;
      if(Number.isFinite(minX)&&Number.isFinite(maxX)&&Number.isFinite(minZ)&&Number.isFinite(maxZ)&&maxX-minX>.22&&maxZ-minZ>.22&&maxX-minX<10&&maxZ-minZ<10){
        environmentCollisionRects.push({floor:placement.floor,minX,maxX,minZ,maxZ,asset:placement.asset});
      }
    }
    placed++;
  }

  await surfacePromise;
  console.info('[SILENCE] 환경 모델 배치 완료:',placed+'/'+PLACEMENTS.length);
  return {loaded:prototypes.size,placed};
}
