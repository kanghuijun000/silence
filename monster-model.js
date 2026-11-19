// SILENCE — THE FOLDED WITNESS
// Bespoke asymmetric creature sculpt. Organic continuous surfaces, non-human silhouette,
// deeply recessed facial forms, irregular anatomy and layered micro-surface detail.
export function createMonsterModel(THREE) {
  const root = new THREE.Group();
  root.name = 'SILENCE_FOLDED_WITNESS';
  const skin = makeSkinMaterial(THREE);
  const paleRidge = new THREE.MeshStandardMaterial({color:0x596568,roughness:.94});
  const darkFold = new THREE.MeshStandardMaterial({color:0x080d10,roughness:1});
  const socketMat = new THREE.MeshStandardMaterial({color:0x020506,roughness:1});
  const eyeMat = new THREE.MeshPhysicalMaterial({color:0xb7c2b4,roughness:.2,metalness:0,emissive:0x283b35,emissiveIntensity:.3,clearcoat:.7});
  const pupilMat = new THREE.MeshStandardMaterial({color:0x020606,roughness:.18});
  const cartilage = new THREE.MeshStandardMaterial({color:0x303b3d,roughness:.82,metalness:0});
  const rootScale = 1;

  // A single asymmetrical torso/neck volume. The shoulders are deliberately uneven;
  // the sternum twists away from the pelvis instead of reading as a human mannequin.
  const torso = new THREE.Mesh(makeSculpt(THREE,[
    [.02,.10,.095,-.015,-.015],[.16,.16,.13,-.005,-.02],[.34,.19,.15,.0,-.025],
    [.55,.205,.16,.005,-.035],[.76,.235,.18,.005,-.055],[.96,.29,.205,.015,-.065],
    [1.15,.34,.225,.025,-.045],[1.32,.39,.22,.025,-.005],[1.48,.43,.205,.015,.055],
    [1.62,.37,.18,.0,.075],[1.76,.27,.15,.0,.045],[1.9,.18,.13,.015,.005],
    [2.05,.145,.12,.025,-.055],[2.18,.12,.105,.03,-.09],[2.27,.075,.075,.03,-.105]
  ],144,112,1.35),skin);
  torso.name='Twisted_Continuous_Torso';
  torso.castShadow=true;torso.receiveShadow=true;root.add(torso);

  // Raised, irregular shoulder and rib structures are grown from the torso surface.
  addTube(THREE,root,[[-.34,1.55,.02],[-.43,1.68,.035],[-.48,1.79,.01],[-.39,1.88,-.015]], [.07,.09,.055,.012],skin,18,36,'Raised_Left_Shoulder');
  addTube(THREE,root,[[.29,1.48,.02],[.39,1.59,.035],[.44,1.72,.015],[.38,1.83,-.02]], [.055,.075,.045,.01],skin,16,30,'Raised_Right_Shoulder');
  for(let i=0;i<5;i++){
    const y=1.28-i*.205;
    addTube(THREE,root,[[-.24,y+.07,.12],[-.08,y,.19],[.12,y-.035,.17],[.28,y-.11,.08]],
      [.014,.022,.012,.002],i%2?skin:paleRidge,10,28,'Uneven_Rib_Ridge_'+i);
  }
  // A broken vertebral ridge on the back gives the silhouette a jagged, non-human profile.
  for(let i=0;i<8;i++){
    const y=.48+i*.185, side=i%2?1:-1, len=.13+(i%3)*.035;
    addTube(THREE,root,[[side*.015,y,-.145],[side*.055,y+.035,-.22],[side*len,y+.075,-.27],[side*(len+.055),y+.12,-.235]],
      [.035,.045,.022,.002],i%3===0?paleRidge:skin,10,22,'Dorsal_Verterbra_'+i);
  }

  // The neck rises off-axis and kinks before the skull. The head has its own pivot.
  const head = new THREE.Group();
  head.name='Cranium_Pivot';
  head.position.set(-.105,2.08,.025);
  head.rotation.z=-.13;
  root.add(head);
  const skull = new THREE.Mesh(makeSculpt(THREE,[
    [0,.10,.09,.0,.015],[.07,.15,.13,.0,.025],[.16,.205,.16,-.005,.035],
    [.28,.235,.18,-.015,.025],[.4,.22,.17,-.025,-.005],[.52,.19,.145,-.035,-.045],
    [.63,.145,.115,-.04,-.075],[.71,.075,.07,-.035,-.09],[.75,.018,.025,-.025,-.09]
  ],112,96,1.8),skin);
  skull.name='Asymmetric_Elongated_Cranium';skull.castShadow=true;skull.receiveShadow=true;head.add(skull);

  // One exposed, pale eye; the opposite side is an empty collapsed socket.
  addOrganicOrb(THREE,head,[-.125,.39,.151],[.09,.073,.035],socketMat,'Collapsed_Left_Orbit',.22);
  addOrganicOrb(THREE,head,[-.128,.397,.18],[.031,.023,.02],eyeMat,'Single_Pale_Eye',.18);
  addOrganicOrb(THREE,head,[-.13,.397,.197],[.009,.016,.007],pupilMat,'Pin_Pupil',.08);
  addOrganicOrb(THREE,head,[.105,.355,.15],[.105,.09,.026],darkFold,'Empty_Right_Orbit',.3);
  addTube(THREE,head,[[.015,.46,.14],[.11,.48,.145],[.205,.43,.105],[.18,.37,.15]],
    [.035,.05,.045,.012],skin,12,30,'Broken_Orbital_Rim');
  addTube(THREE,head,[[-.22,.47,.105],[-.16,.52,.145],[-.07,.49,.18],[.015,.44,.16]],
    [.025,.043,.03,.006],paleRidge,12,28,'Overhanging_Brow');
  // A narrow, displaced nasal keel instead of a recognizable human nose.
  addTube(THREE,head,[[-.035,.48,.13],[-.015,.34,.19],[.045,.23,.205],[.105,.16,.16]],
    [.035,.042,.026,.006],skin,14,32,'Displaced_Facial_Keel');
  addOrganicOrb(THREE,head,[.13,.19,.166],[.025,.018,.012],socketMat,'Nasal_Cavity',.2);

  // A long, off-centre vertical fissure makes the face read as an unknown organism,
  // not a human face with decorative eyes.
  addOrganicOrb(THREE,head,[-.005,.19,.177],[.047,.17,.018],darkFold,'Vertical_Facial_Fissure',.42);
  addTube(THREE,head,[[-.055,.34,.17],[-.035,.25,.202],[-.055,.15,.203],[-.025,.035,.155]],
    [.018,.025,.019,.004],paleRidge,10,28,'Left_Fissure_Lip');
  addTube(THREE,head,[[.045,.33,.17],[.025,.24,.205],[.055,.13,.195],[.03,.025,.15]],
    [.012,.02,.015,.003],skin,10,28,'Right_Fissure_Lip');
  for(let i=0;i<7;i++){
    const y=.30-i*.037, x=-.012+(i%2)*.026;
    addTube(THREE,head,[[x,y,.19],[x+.012,y-.018,.214],[x+.005,y-.038,.19]],
      [.009,.012,.001],i%2?cartilage:paleRidge,7,10,'Irregular_Fissure_Ridge');
  }
  // Fine facial creases and raised skin folds break up the smooth planes.
  for(let i=0;i<9;i++){
    const side=i%2?1:-1, y=.12+(i%4)*.085;
    addTube(THREE,head,[[side*.07,y+.08,.14],[side*.13,y+.035,.17],[side*.19,y,.125]],
      [.006,.012,.001],i%3===0?paleRidge:skin,8,16,'Facial_Crease');
  }

  const armLeft=makeArm(THREE,root,-1,skin,paleRidge,'Arm_Left',1.48);
  const armRight=makeArm(THREE,root,1,skin,paleRidge,'Arm_Right',1.78);
  const legLeft=makeLeg(THREE,root,-1,skin,paleRidge,'Leg_Left',.92);
  const legRight=makeLeg(THREE,root,1,skin,paleRidge,'Leg_Right',1.12);

  // Sparse surface filaments and contracted skin folds add readable close-up detail.
  for(let i=0;i<18;i++){
    const side=i%2?1:-1, y=.45+(i*.097)%1.55, x=side*(.13+((i*7)%9)*.018);
    addTube(THREE,root,[[x,y,.11],[x+side*.025,y+.035,.16],[x+side*.012,y+.075,.12]],
      [.003,.008,.001],i%4===0?cartilage:skin,6,10,'Surface_Filament');
  }
  root.scale.setScalar(rootScale);
  return {group:root,head,armLeft,armRight,legLeft,legRight};
}

function makeSkinMaterial(THREE){
  const size=1024, height=new Uint8Array(size*size), rough=new Uint8Array(size*size), color=new Uint8Array(size*size*4);
  let seed=78131;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;
    const broad=Math.sin(x*.018+Math.sin(y*.013)*2.7)*.5+Math.sin(y*.027-x*.009)*.35;
    const folds=Math.sin(x*.16+Math.sin(y*.07)*2)*Math.sin(y*.12+x*.035);
    const pores=(rand()-.5)*.32, h=Math.max(0,Math.min(255,128+broad*19+folds*15+pores*58));
    height[i]=h;
    rough[i]=Math.max(115,Math.min(255,218+broad*12+folds*18+(rand()-.5)*30));
    const mottled=broad*13+folds*10+(rand()-.5)*23;
    const p=i*4;
    color[p]=Math.max(0,Math.min(255,68+mottled));
    color[p+1]=Math.max(0,Math.min(255,79+mottled));
    color[p+2]=Math.max(0,Math.min(255,81+mottled));
    color[p+3]=255;
  }
  const normal=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++){
    const ym=(y+size-1)%size,yp=(y+1)%size;
    for(let x=0;x<size;x++){
      const xm=(x+size-1)%size,xp=(x+1)%size;
      const dx=(height[y*size+xp]-height[y*size+xm])/255*3.1;
      const dy=(height[yp*size+x]-height[ym*size+x])/255*3.1;
      const inv=1/Math.hypot(dx,dy,1),p=(y*size+x)*4;
      normal[p]=Math.round((-dx*inv)*127+128);
      normal[p+1]=Math.round((-dy*inv)*127+128);
      normal[p+2]=Math.round(inv*127+128);normal[p+3]=255;
    }
  }
  const texture=(data,format)=>{
    const t=new THREE.DataTexture(data,size,size,format);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2.4,3.2);
    t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
    t.anisotropy=8;t.needsUpdate=true;return t;
  };
  const albedo=texture(color,THREE.RGBAFormat);albedo.colorSpace=THREE.SRGBColorSpace;
  const bump=texture(height,THREE.RedFormat),roughMap=texture(rough,THREE.RedFormat),normalMap=texture(normal,THREE.RGBAFormat);
  return new THREE.MeshPhysicalMaterial({
    color:0xffffff,map:albedo,roughness:.9,roughnessMap:roughMap,metalness:0,
    bumpMap:bump,bumpScale:.046,normalMap,normalScale:new THREE.Vector2(.62,.62),
    clearcoat:.12,clearcoatRoughness:.72,sheen:.08,sheenColor:new THREE.Color(0x455256),
    vertexColors:true
  });
}

// Profile-driven sculpt with angular asymmetry, warped cross-sections and multi-scale surface breakup.
function makeSculpt(THREE,profile,vertical=120,radial=96,detail=1){
  const samples=[],cat=(p0,p1,p2,p3,t)=>.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t);
  for(let i=0;i<vertical;i++){
    const u=i/(vertical-1)*(profile.length-1),k=Math.min(profile.length-2,Math.floor(u)),t=u-k;
    const a=profile[Math.max(0,k-1)],b=profile[k],c=profile[k+1],d=profile[Math.min(profile.length-1,k+2)];
    samples.push([0,1,2,3,4].map(j=>cat(a[j]??0,b[j]??0,c[j]??0,d[j]??0,t)));
  }
  const p=[],col=[],idx=[];
  for(let i=0;i<samples.length;i++){
    const [y,rx,rz,cz,cx]=samples[i];
    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2,cs=Math.cos(a),sn=Math.sin(a);
      const asym=1+Math.sin(a*2.1+.7)*.11+Math.sin(a*5.3+i*.11)*.045;
      const folds=Math.sin(a*7.2+i*.23)*.014+Math.sin(a*13-i*.31)*.006;
      const fine=Math.sin(a*29+i*1.7)*Math.sin(i*.8+a*11)*.003*detail;
      const x=cx+cs*(rx*asym+folds+fine);
      const z=cz+sn*(rz*asym+folds*.8+fine);
      const warpedY=y+Math.sin(a*3.4+i*.12)*.012*detail;
      p.push(x,warpedY,z);
      const grain=.83+Math.sin(x*71+y*43+z*67)*.075+Math.sin(x*139-y*87+z*103)*.035;
      col.push(grain,grain*1.025,grain*1.04);
    }
  }
  for(let i=0;i<vertical-1;i++)for(let j=0;j<radial;j++){
    const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+(j+1)%radial,d=(i+1)*radial+j;
    idx.push(a,d,b,b,d,c);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function tubeGeometry(THREE,points,radii,radial=14,tubular=28,rough=.035){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const frames=curve.computeFrenetFrames(tubular,false),p=[],col=[],idx=[];
  for(let i=0;i<=tubular;i++){
    const t=i/tubular,center=curve.getPointAt(t),q=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(q)),f=q-k;
    const radius=radii[k]*(1-f)+radii[k+1]*f;
    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2,w=1+Math.sin(a*3+i*.41)*rough+Math.sin(a*7-i*.19)*rough*.45;
      const v=center.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius*w)
        .addScaledVector(frames.binormals[i],Math.sin(a)*radius*w);
      p.push(v.x,v.y,v.z);
      const shade=.82+Math.sin(v.x*87+v.y*59+v.z*73)*.09;
      col.push(shade,shade*1.025,shade*1.04);
    }
  }
  for(let i=0;i<tubular;i++)for(let j=0;j<radial;j++){
    const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+(j+1)%radial,d=(i+1)*radial+j;
    idx.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function addTube(THREE,parent,points,radii,material,radial=12,tubular=24,name='Organic_Ridge'){
  const m=new THREE.Mesh(tubeGeometry(THREE,points,radii,radial,tubular),material);
  m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function makeOrbGeometry(THREE,scale,detail=.2){
  const g=new THREE.SphereGeometry(1,40,28),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const n=1+Math.sin(x*8+y*11+z*5)*detail*.09+Math.sin(x*17-y*9+z*13)*detail*.035;
    p.setXYZ(i,x*scale[0]*n,y*scale[1]*n,z*scale[2]*n);
  }
  p.needsUpdate=true;g.computeVertexNormals();return g;
}
function addOrganicOrb(THREE,parent,pos,scale,mat,name,detail=.2){
  const m=new THREE.Mesh(makeOrbGeometry(THREE,scale,detail),mat);
  m.position.set(...pos);m.name=name;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}

function makeArm(THREE,root,side,skin,ridge,name,length){
  const pivot=new THREE.Group();pivot.name=name+'_Pivot';
  pivot.position.set(side*(side<0?.39:.34),1.73,side<0?-.015:.025);root.add(pivot);
  const extra=length-1.48;
  const points=side<0
    ?[[0,0,0],[side*.12,-.2,.025],[side*.18,-.48,.08],[side*.11,-.76,.12],[side*.16,-1.08,.16],[side*.19,-1.35-extra*.45,.18],[side*.21,-1.58-extra,.16]]
    :[[0,0,0],[side*.13,-.18,.02],[side*.19,-.42,.065],[side*.16,-.68,.11],[side*.23,-.92,.14],[side*.27,-1.12-extra*.4,.16]];
  const radii=side<0?[.205,.17,.13,.115,.083,.061,.043]:[.22,.18,.15,.12,.092,.055];
  addTube(THREE,pivot,points,radii,skin,22,52,name+'_Sculpted_Limb');
  const end=points[points.length-1];
  addTube(THREE,pivot,[end,[end[0]+side*.025,end[1]-.11,end[2]+.055],[end[0]+side*.035,end[1]-.2,end[2]+.075]],
    [.07,.09,.055],skin,18,24,name+'_Palm_Form');
  for(let i=0;i<4;i++){
    const spread=(i-1.5)*.052,flen=.25+(i%2)*.11+(side<0?.09:0),x=end[0]+spread;
    addTube(THREE,pivot,[[x,end[1]-.13,end[2]+.08],[x+spread*.3,end[1]-.25,end[2]+.13],
      [x+spread*.55,end[1]-.25-flen*.7,end[2]+.17],[x+spread*.8,end[1]-.23-flen,end[2]+.13]],
      [.032,.027,.014,.002],skin,9,22,name+'_Long_Digit_'+i);
  }
  addTube(THREE,pivot,[[end[0]-side*.045,end[1]-.13,end[2]+.06],[end[0]-side*.12,end[1]-.23,end[2]+.12],
    [end[0]-side*.17,end[1]-.37,end[2]+.15]],[.045,.028,.002],skin,10,20,name+'_Hooked_Thumb');
  return pivot;
}
function makeLeg(THREE,root,side,skin,ridge,name,length){
  const pivot=new THREE.Group();pivot.name=name+'_Pivot';pivot.position.set(side*.17,.76,0);root.add(pivot);
  const pts=side<0
    ?[[0,0,0],[side*.04,-.18,-.09],[side*.11,-.39,-.15],[side*.04,-.57,-.04],[side*.12,-.76,.04],[side*.16,-.9,.13]]
    :[[0,0,0],[side*.03,-.2,-.07],[side*.06,-.4,-.13],[side*.14,-.55,-.035],[side*.18,-.76,.08]];
  addTube(THREE,pivot,pts,side<0?[.18,.15,.11,.09,.07,.045]:[.19,.15,.12,.085,.05],skin,20,42,name+'_Bent_Sculpted_Leg');
  const foot=pts[pts.length-1];
  addTube(THREE,pivot,[foot,[foot[0],foot[1]-.025,foot[2]+.16],[foot[0]+side*.035,foot[1]-.04,foot[2]+.29]],
    [.075,.085,.035],skin,16,22,name+'_Distorted_Foot');
  for(let i=0;i<4;i++){
    const x=foot[0]+(i-1.5)*.045;
    addTube(THREE,pivot,[[x,foot[1]-.025,foot[2]+.22],[x+(i-1.5)*.012,foot[1]-.06,foot[2]+.31],
      [x+(i-1.5)*.02,foot[1]-.075,foot[2]+.39]],[.027,.015,.001],skin,8,16,name+'_Toe_'+i);
  }
  return pivot;
}
