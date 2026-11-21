// SILENCE — THE LONG-SMILE
// Reference-driven orange humanoid creature. Ground-to-hat height: approximately 2.5m.
export function createMonsterModel(THREE) {
  const root = new THREE.Group();
  root.name = 'SILENCE_LONG_SMILE';
  const skin = makeOrangeSkin(THREE);
  const skinLight = new THREE.MeshPhysicalMaterial({color:0xffa21a,roughness:.68,metalness:0,clearcoat:.12,clearcoatRoughness:.72});
  const skinShadow = new THREE.MeshStandardMaterial({color:0x9b3908,roughness:.88});
  const mouthMat = new THREE.MeshStandardMaterial({color:0x170904,roughness:1});
  const hatMat = new THREE.MeshPhysicalMaterial({color:0x090a0d,roughness:.32,metalness:.08,clearcoat:.25});
  const toothMat = new THREE.MeshPhysicalMaterial({color:0xffe8b6,roughness:.38,clearcoat:.2});
  const eyeMat = new THREE.MeshStandardMaterial({color:0x090503,roughness:.95});
  const glintMat = new THREE.MeshStandardMaterial({color:0x211006,roughness:.8});

  // Legs: long, narrow thighs and shins with continuous tapered surfaces.
  const pelvis = new THREE.Group(); pelvis.name='Pelvis'; pelvis.position.y=.91; root.add(pelvis);
  ellipsoid(THREE,pelvis,[0,0,0],[.29,.22,.22],skin,'Narrow_Pelvis');
  const legLeft = makeLeg(THREE,root,-1,skin,skinLight,'Left_Leg');
  const legRight = makeLeg(THREE,root,1,skin,skinLight,'Right_Leg');

  // Torso silhouette: broad sloping shoulders, narrow waist and a long neck.
  const upperBody = new THREE.Group(); upperBody.name='Upper_Body'; upperBody.position.y=.91; root.add(upperBody);
  const spine = new THREE.Group(); spine.name='Spine'; upperBody.add(spine);
  const chest = new THREE.Group(); chest.name='Chest'; chest.position.y=.52; spine.add(chest);
  ellipsoid(THREE,spine,[0,.36,0],[.31,.58,.235],skin,'Continuous_Abdomen');
  ellipsoid(THREE,chest,[0,.23,0],[.53,.39,.285],skin,'Broad_Chest');
  ellipsoid(THREE,chest,[0,.43,-.015],[.43,.22,.255],skinLight,'Clavicle_Mass');
  // Subtle anatomical transitions, not separate hard-edged primitive blocks.
  tube(THREE,spine,[[0,.05,.12],[.015,.26,.19],[0,.51,.18]], [.055,.075,.035],skinLight,'Sternal_Ridge');
  for(let side of [-1,1]){
    for(let i=0;i<4;i++){
      const y=.18+i*.105;
      tube(THREE,spine,[[side*.12,y,.16],[side*.25,y+.035,.12],[side*.31,y+.09,.035]],[.018,.023,.004],skinShadow,'Subtle_Rib_Shadow');
    }
  }

  // Neck and head articulation.
  const neck = new THREE.Group(); neck.name='Long_Neck'; neck.position.set(0,.72,-.005); chest.add(neck);
  tube(THREE,neck,[[0,0,0],[0,.13,-.015],[.015,.32,-.035],[.025,.49,-.045],[.015,.59,-.04]],[.19,.145,.115,.12,.17],skin,'Long_Tapered_Neck',32,64);
  ellipsoid(THREE,neck,[0,.55,-.035],[.19,.16,.17],skinLight,'Neck_To_Jaw_Transition');
  const head = new THREE.Group(); head.name='Head_Pivot'; head.position.set(.015,.66,.015); neck.add(head);
  ellipsoid(THREE,head,[0,.03,.015],[.355,.385,.295],skin,'Rounded_Orange_Head',.035);
  // Cheeks and chin blend into the skull.
  ellipsoid(THREE,head,[-.205,-.105,.115],[.16,.17,.19],skinLight,'Left_Cheek');
  ellipsoid(THREE,head,[.205,-.105,.115],[.16,.17,.19],skinLight,'Right_Cheek');
  ellipsoid(THREE,head,[0,-.235,.11],[.235,.115,.19],skin,'Broad_Chin');

  // Deep dark eye sockets and small inset pupils.
  for(const side of [-1,1]){
    ellipsoid(THREE,head,[side*.145,.145,.265],[.078,.052,.035],mouthMat,side<0?'Left_Eye_Socket':'Right_Eye_Socket');
    ellipsoid(THREE,head,[side*.145,.147,.294],[.034,.027,.012],glintMat,'Inset_Eye');
    tube(THREE,head,[[side*.235,.19,.235],[side*.16,.225,.27],[side*.075,.19,.27]],[.018,.026,.012],skinShadow,'Heavy_Eyebrow');
  }

  // Wide fixed grin, sculpted as a curved dark opening with raised lips and individually visible teeth.
  const grin = new THREE.Group(); grin.name='Wide_Grin'; grin.position.set(0,-.105,.275); head.add(grin);
  ellipsoid(THREE,grin,[0,0,0],[.285,.105,.038],mouthMat,'Dark_Mouth_Cavity');
  tube(THREE,grin,[[-.29,.015,.012],[-.22,.095,.03],[-.08,.12,.035],[.08,.12,.035],[.23,.085,.025],[.29,.012,.01]],[.026,.035,.032,.032,.03,.018],skinLight,'Upper_Smiling_Lip',16,64);
  tube(THREE,grin,[[-.27,-.015,.015],[-.17,-.09,.025],[0,-.105,.035],[.17,-.08,.025],[.27,-.01,.015]],[.018,.028,.03,.026,.014],skin,'Lower_Smiling_Lip',14,48);
  for(let i=0;i<11;i++){
    const x=-.235+i*.047, y=.035+Math.sin((i/10)*Math.PI)*.027;
    const w=i===0||i===10?.027:.039, h=i===0||i===10?.038:.055;
    const tooth=new THREE.Mesh(new THREE.BoxGeometry(w,h,.018),toothMat);
    tooth.position.set(x,y,.043); tooth.rotation.z=(i-5)*-.012; tooth.name='Individual_Upper_Tooth_'+i;
    tooth.castShadow=true;grin.add(tooth);
  }
  for(let i=0;i<9;i++){
    const x=-.205+i*.051;
    const tooth=new THREE.Mesh(new THREE.BoxGeometry(.032,.025,.015),toothMat);
    tooth.position.set(x,-.052,.044); tooth.name='Lower_Tooth_'+i;grin.add(tooth);
  }
  // Smile-corner creases and warm facial folds.
  for(const side of [-1,1]){
    tube(THREE,head,[[side*.27,-.08,.23],[side*.31,-.025,.255],[side*.29,.045,.24]],[.012,.018,.003],skinShadow,'Smile_Corner_Crease');
    tube(THREE,head,[[side*.23,-.17,.22],[side*.27,-.12,.24],[side*.28,-.07,.23]],[.008,.013,.002],skinLight,'Cheek_Fold');
  }

  // Black bowler/top hat: distinct brim and rounded crown.
  const brim=new THREE.Mesh(new THREE.CylinderGeometry(.285,.30,.055,64,2),hatMat);
  brim.position.set(0,.405,-.015);brim.castShadow=true;brim.receiveShadow=true;brim.name='Black_Hat_Brim';head.add(brim);
  const crown=new THREE.Mesh(new THREE.CylinderGeometry(.185,.205,.235,48,8),hatMat);
  crown.position.set(0,.545,-.015);crown.castShadow=true;crown.receiveShadow=true;crown.name='Black_Hat_Crown';head.add(crown);
  ellipsoid(THREE,head,[0,.665,-.015],[.19,.045,.19],hatMat,'Hat_Crown_Top');

  // Very long arms: fingertips approach the floor when standing upright.
  const armLeft=makeArm(THREE,chest,-1,skin,skinLight,'Left_Arm');
  const armRight=makeArm(THREE,chest,1,skin,skinLight,'Right_Arm');

  root.scale.setScalar(.72);
  return {
    group:root,upperBody,pelvis,spine,chest,neck,head,jaw:grin,
    armLeft:armLeft.shoulder,armRight:armRight.shoulder,
    elbowLeft:armLeft.elbow,elbowRight:armRight.elbow,
    wristLeft:armLeft.wrist,wristRight:armRight.wrist,
    legLeft:legLeft.hip,legRight:legRight.hip,
    kneeLeft:legLeft.knee,kneeRight:legRight.knee,
    footLeft:legLeft.foot,footRight:legRight.foot
  };
}

function makeOrangeSkin(THREE){
  const size=256, data=new Uint8Array(size*size*4), bump=new Uint8Array(size*size);
  let seed=92741;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x, broad=Math.sin(x*.035+Math.sin(y*.021)*2)*.5+Math.sin(y*.045-x*.018)*.35;
    const pores=(random()-.5)*16, mottled=broad*12+pores;
    const p=i*4;data[p]=Math.max(0,Math.min(255,244+mottled));data[p+1]=Math.max(0,Math.min(255,112+mottled*1.15));
    data[p+2]=Math.max(0,Math.min(255,8+mottled*.25));data[p+3]=255;
    bump[i]=Math.max(0,Math.min(255,128+broad*20+(random()-.5)*36));
  }
  const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2.2,2.8);map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  const bumpMap=new THREE.DataTexture(bump,size,size,THREE.RedFormat);bumpMap.wrapS=bumpMap.wrapT=THREE.RepeatWrapping;bumpMap.repeat.copy(map.repeat);bumpMap.needsUpdate=true;
  return new THREE.MeshPhysicalMaterial({color:0xffffff,map,bumpMap,bumpScale:.018,roughness:.72,metalness:0,clearcoat:.1,clearcoatRoughness:.7});
}

function ellipsoid(THREE,parent,pos,scale,material,name,warp=.018){
  const g=new THREE.SphereGeometry(1,64,48),a=g.attributes.position;
  for(let i=0;i<a.count;i++){
    const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
    const n=1+Math.sin(x*11+y*8+z*7)*warp+Math.sin(x*23-y*17+z*19)*warp*.35;
    a.setXYZ(i,x*scale[0]*n,y*scale[1]*n,z*scale[2]*n);
  }
  a.needsUpdate=true;g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.position.set(...pos);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}

function tube(THREE,parent,points,radii,material,name,radial=20,tubular=48){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const frames=curve.computeFrenetFrames(tubular,false),positions=[],indices=[];
  for(let i=0;i<=tubular;i++){
    const t=i/tubular,q=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(q)),f=q-k;
    const r=radii[k]*(1-f)+radii[k+1]*f,c=curve.getPointAt(t);
    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2,w=1+Math.sin(a*3+i*.37)*.025+Math.sin(a*7-i*.19)*.012;
      const v=c.clone().addScaledVector(frames.normals[i],Math.cos(a)*r*w).addScaledVector(frames.binormals[i],Math.sin(a)*r*w);
      positions.push(v.x,v.y,v.z);
    }
  }
  for(let i=0;i<tubular;i++)for(let j=0;j<radial;j++){
    const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+(j+1)%radial,d=(i+1)*radial+j;
    indices.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  const m=new THREE.Mesh(g,material);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}

function makeArm(THREE,parent,side,skin,highlight,name){
  const shoulder=new THREE.Group();shoulder.name=name+'_Shoulder';shoulder.position.set(side*.43,.29,0);parent.add(shoulder);
  const elbow=new THREE.Group();elbow.name=name+'_Elbow';elbow.position.set(side*.09,-.57,.025);shoulder.add(elbow);
  const wrist=new THREE.Group();wrist.name=name+'_Wrist';wrist.position.set(side*.07,-.60,.045);elbow.add(wrist);
  tube(THREE,shoulder,[[0,0,0],[side*.08,-.22,.015],[side*.12,-.46,.04],[side*.09,-.57,.025]],[.205,.17,.125,.105],skin,name+'_Upper_Arm',24,64);
  ellipsoid(THREE,elbow,[0,0,0],[.115,.13,.12],skin,name+'_Elbow_Joint');
  tube(THREE,elbow,[[0,0,0],[side*.035,-.2,.025],[side*.055,-.42,.04],[side*.07,-.60,.045]],[.105,.085,.065,.045],skin,name+'_Long_Forearm',22,64);
  ellipsoid(THREE,wrist,[0,-.035,.045],[.075,.12,.085],skin,name+'_Wrist_Blend');
  tube(THREE,wrist,[[0,-.08,.045],[side*.015,-.18,.075],[side*.025,-.28,.085]],[.065,.085,.055],skin,name+'_Palm',18,36);
  for(let i=0;i<4;i++){
    const x=(i-1.5)*.038, len=.19+(i%2)*.035;
    tube(THREE,wrist,[[x,-.19,.085],[x+(i-1.5)*.012,-.28,.11],[x+(i-1.5)*.018,-.28-len,.12]],[.025,.019,.003],skin,name+'_Long_Finger_'+i,12,28);
  }
  tube(THREE,wrist,[[-side*.055,-.16,.07],[-side*.105,-.25,.12],[-side*.13,-.34,.13]],[.035,.024,.002],skin,name+'_Thumb',12,28);
  return {shoulder,elbow,wrist};
}

function makeLeg(THREE,root,side,skin,highlight,name){
  const hip=new THREE.Group();hip.name=name+'_Hip';hip.position.set(side*.17,.91,0);root.add(hip);
  const knee=new THREE.Group();knee.name=name+'_Knee';knee.position.set(side*.025,-.46,-.015);hip.add(knee);
  const foot=new THREE.Group();foot.name=name+'_Ankle';foot.position.set(side*.025,-.42,.02);knee.add(foot);
  tube(THREE,hip,[[0,0,0],[side*.025,-.17,-.035],[side*.04,-.34,-.045],[side*.025,-.46,-.015]],[.155,.135,.095,.075],skin,name+'_Long_Thigh',22,56);
  ellipsoid(THREE,knee,[0,0,0],[.08,.09,.085],skin,name+'_Knee_Joint');
  tube(THREE,knee,[[0,0,0],[side*.015,-.15,.005],[side*.025,-.3,.035],[side*.025,-.42,.02]],[.075,.065,.048,.035],skin,name+'_Narrow_Shin',20,52);
  ellipsoid(THREE,foot,[0,-.015,.12],[.09,.065,.19],skin,name+'_Long_Foot');
  for(let i=0;i<4;i++){
    const x=(i-1.5)*.035;
    tube(THREE,foot,[[x,-.025,.20],[x,-.035,.28],[x,-.04,.34]],[.024,.014,.001],skin,name+'_Toe',10,20);
  }
  return {hip,knee,foot};
}
