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
  conveyorHead: 'conveyor-head-pulley/v1/lod1.glb',
  conveyorStraight: 'conveyor-roller-straight/v1/lod1.glb',
  conveyorTransfer: 'conveyor-belt-transfer/v1/lod1.glb',
  junctionCabinet: 'junction-cabinet/v1/lod0.glb'
};

const PLACEMENTS = [
  // 2F: 병실·처치 구역 — 의료 장비는 실제 비율과 독립된 부품을 가진 모델을 사용한다.
  {asset:'gurney',floor:0,x:6,z:6,rotation:0},
  {asset:'ivStand',floor:0,x:7.25,z:6.15,rotation:.25},
  {asset:'instrumentTrolley',floor:0,x:6.0,z:7.55,rotation:Math.PI*.5},
  {asset:'privacyScreen',floor:0,x:34,z:6.1,rotation:Math.PI*.5},
  {asset:'wheelchair',floor:0,x:34,z:34,rotation:-.25},

  // 1F: 일부 남겨진 의료 장비와 이동 보조기구.
  {asset:'gurney',floor:1,x:6,z:34,rotation:Math.PI*.5},
  {asset:'wheelchair',floor:1,x:34,z:6,rotation:Math.PI},
  {asset:'instrumentTrolley',floor:1,x:34,z:34,rotation:-Math.PI*.5},

  // B1: 컨베이어 구동부와 롤러 라인으로 생산 설비의 실루엣을 만든다.
  {asset:'conveyorHead',floor:2,x:8,z:8,rotation:0},
  {asset:'conveyorStraight',floor:2,x:8,z:11.25,rotation:0,scale:.75},
  {asset:'conveyorTransfer',floor:2,x:8.1,z:14.2,rotation:0},
  {asset:'conveyorStraight',floor:2,x:32,z:32,rotation:Math.PI*.5,scale:.75},
  {asset:'conveyorHead',floor:2,x:32,z:28.2,rotation:Math.PI*.5,scale:.8},

  // B3: 설비 통로의 벽면 배전·접속함.
  {asset:'junctionCabinet',floor:4,x:19,z:5,rotation:Math.PI*.5,wallMount:true}
];

function loadGLB(loader,url){
  return new Promise((resolve,reject)=>{
    loader.load(url,gltf=>resolve(gltf.scene),undefined,reject);
  });
}

function preparePrototype(THREE,model){
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  if(Number.isFinite(bounds.min.y))model.position.y-=bounds.min.y;
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
  const ktx2Loader=new KTX2Loader()
    .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/basis/')
    .detectSupport(renderer);
  const loader=new GLTFLoader();
  loader.setKTX2Loader(ktx2Loader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const prototypes=new Map();
  const assetIds=[...new Set(PLACEMENTS.map(item=>item.asset))];

  // Fetch each source model once. Instances share GPU geometry and texture memory.
  await Promise.all(assetIds.map(async id=>{
    try{
      const model=await loadGLB(loader,MODEL_BASE+ASSETS[id]);
      prototypes.set(id,preparePrototype(THREE,model));
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
    placed++;
  }

  console.info('[SILENCE] 환경 모델 배치 완료:',placed+'/'+PLACEMENTS.length);
  return {loaded:prototypes.size,placed};
}
