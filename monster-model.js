// SILENCE creature: custom sculpt-like BufferGeometry model.
// Built from continuous, tapered organic surfaces rather than primitive body parts.
export function createMonsterModel(THREE) {
  const root = new THREE.Group();
  root.name = 'SILENCE_Organic_Creature';
  const skin = makeSkinMaterial(THREE);
  const dark = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.98, metalness: 0 });
  const deep = new THREE.MeshStandardMaterial({ color: 0x050708, roughness: 1, metalness: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x9daea6, roughness: 0.32, metalness: 0.02, emissive: 0x202b28, emissiveIntensity: 0.22 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x18211f, roughness: 0.42 });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x343f42, roughness: 0.96 });
  const body = new THREE.Mesh(makeRingSculpt(THREE, [
    [0.035,0.055,0.06,-0.005],[0.12,0.105,0.105,-0.005],[0.28,0.15,0.13,-0.005],
    [0.48,0.205,0.16,-0.005],[0.68,0.205,0.155,-0.005],[0.88,0.225,0.17,-0.005],
    [1.08,0.275,0.19,-0.005],[1.29,0.315,0.205,-0.005],[1.48,0.36,0.21,-0.005],
    [1.63,0.385,0.205,-0.005],[1.76,0.33,0.18,0.0],[1.86,0.235,0.15,0.005],
    [1.98,0.155,0.135,0.015],[2.10,0.13,0.12,0.02],[2.18,0.09,0.085,0.02]
  ], 116, 88), skin);
  body.name = 'Continuous_Torso_Neck_Sculpt';
  body.castShadow = true; body.receiveShadow = true;
  root.add(body);

  // Raised tendons and rib folds are subtle sculpted surface details.
  for (const side of [-1, 1]) {
    addTubeMesh(THREE, root, [
      [side*0.105,2.13,0.075],[side*0.13,1.98,0.105],[side*0.19,1.81,0.13],[side*0.29,1.69,0.12]
    ], [0.018,0.019,0.013,0.004], skin, 12, 22, 'Neck_Tendon');
    for (let j=0;j<3;j++) {
      const y=1.25-j*0.15;
      addTubeMesh(THREE, root, [
        [side*0.07,y+0.045,0.174],[side*0.15,y,0.187],[side*0.235,y-0.045,0.145]
      ], [0.008,0.009,0.003], ridgeMat, 8, 16, 'Subtle_Rib_Fold');
    }
  }

  // The skull is its own detailed sculpt so it can tilt independently.
  const head = new THREE.Group();
  head.name = 'Head_Pivot';
  head.position.set(0, 2.045, 0.018);
  root.add(head);
  const skull = new THREE.Mesh(makeRingSculpt(THREE, [
    [0.00,0.115,0.11,0.0],[0.07,0.16,0.14,0.0],[0.17,0.205,0.17,0.0],
    [0.30,0.218,0.185,-0.005],[0.43,0.198,0.17,-0.012],
    [0.54,0.165,0.145,-0.018],[0.62,0.105,0.095,-0.018],[0.66,0.025,0.03,-0.018]
  ], 88, 72, 0.82), skin);
  skull.name = 'Elongated_Facial_Sculpt';
  skull.castShadow = true; skull.receiveShadow = true;
  head.add(skull);

  // Deep sockets, small recessed eyes, pronounced brows and cheek planes.
  for (const side of [-1,1]) {
    addEllipsoid(THREE, head, [side*0.092,0.355,0.158], [0.067,0.052,0.027], deep, 'Recessed_Eye_Socket');
    addEllipsoid(THREE, head, [side*0.092,0.354,0.178], [0.027,0.018,0.018], eyeMat, 'Pale_Eye');
    addEllipsoid(THREE, head, [side*0.092,0.354,0.193], [0.008,0.013,0.006], irisMat, 'Dark_Iris');
    addTubeMesh(THREE, head, [
      [side*0.17,0.405,0.153],[side*0.115,0.425,0.174],[side*0.055,0.407,0.166]
    ], [0.018,0.024,0.009], skin, 10, 18, 'Heavy_Brow_Ridge');
    addTubeMesh(THREE, head, [
      [side*0.18,0.245,0.135],[side*0.12,0.225,0.17],[side*0.045,0.245,0.18]
    ], [0.014,0.018,0.006], ridgeMat, 9, 16, 'Cheek_Plane');
  }
  addTubeMesh(THREE, head, [[0,0.47,0.12],[0,0.37,0.185],[0,0.27,0.205],[0,0.235,0.19]],
    [0.035,0.029,0.021,0.012], skin, 12, 22, 'Narrow_Nasal_Ridge');
  addEllipsoid(THREE, head, [0,0.115,0.174], [0.094,0.014,0.014], deep, 'Thin_Mouth_Cavity');
  addTubeMesh(THREE, head, [
    [-0.102,0.132,0.18],[-0.05,0.139,0.194],[0,0.133,0.198],[0.05,0.139,0.194],[0.102,0.132,0.18]
  ], [0.008,0.009,0.006,0.009,0.008], ridgeMat, 8, 20, 'Upper_Lip');
  addTubeMesh(THREE, head, [
    [-0.085,0.096,0.18],[0,0.09,0.194],[0.085,0.096,0.18]
  ], [0.007,0.011,0.007], skin, 8, 16, 'Lower_Lip');
  for(let i=0;i<4;i++){
    const x=(i-1.5)*0.033;
    addTubeMesh(THREE, head, [[x,0.126,0.195],[x+0.002,0.108,0.199]], [0.006,0.0015],
      new THREE.MeshStandardMaterial({color:0x777b72,roughness:0.8}), 6, 5, 'Uneven_Tooth');
  }

  // Long arms: each is a custom tapered surface with a sculpted palm and five separate tapered digits.
  const armLeft = makeArm(THREE, root, -1, skin, 'Arm_Left');
  const armRight = makeArm(THREE, root, 1, skin, 'Arm_Right');
  const legLeft = makeLeg(THREE, root, -1, skin, 'Leg_Left');
  const legRight = makeLeg(THREE, root, 1, skin, 'Leg_Right');

  return { group: root, head, armLeft, armRight, legLeft, legRight };
}

function makeSkinMaterial(THREE) {
  const size=128, data=new Uint8Array(size*size);
  let seed=193;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    seed=(seed*1664525+1013904223)>>>0;
    const fine=(seed>>>24)/255;
    const wave=(Math.sin(x*.21+Math.sin(y*.08)*2)+Math.sin(y*.29+x*.035))*.5;
    data[y*size+x]=Math.max(0,Math.min(255,118+wave*34+(fine-.5)*68));
  }
  const bump=new THREE.DataTexture(data,size,size,THREE.RedFormat);
  bump.wrapS=bump.wrapT=THREE.RepeatWrapping;
  bump.repeat.set(3,4); bump.needsUpdate=true;
  return new THREE.MeshStandardMaterial({
    color:0x596164, roughness:0.96, metalness:0,
    vertexColors:true, bumpMap:bump, bumpScale:0.022
  });
}

function makeRingSculpt(THREE, profile, verticalSegments=100, radialSegments=72, detail=1) {
  const samples=[];
  const cat=(p0,p1,p2,p3,t)=>0.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t);
  for(let i=0;i<verticalSegments;i++){
    const u=i/(verticalSegments-1)*(profile.length-1), k=Math.min(profile.length-2,Math.floor(u)), t=u-k;
    const a=profile[Math.max(0,k-1)],b=profile[k],c=profile[k+1],d=profile[Math.min(profile.length-1,k+2)];
    samples.push([0,1,2,3].map(j=>cat(a[j],b[j],c[j],d[j],t)));
  }
  const positions=[], colors=[], indices=[];
  for(let i=0;i<samples.length;i++){
    const [y,rx,rz,cz]=samples[i];
    for(let j=0;j<radialSegments;j++){
      const a=j/radialSegments*Math.PI*2, cs=Math.cos(a), sn=Math.sin(a);
      const wave=Math.sin(a*5+i*.31)*.006+Math.sin(a*11-i*.17)*.0025;
      const pore=Math.sin(a*31+i*1.73)*Math.sin(i*.91+a*13)*.0018*detail;
      const x=cs*Math.max(.002,rx+wave+pore);
      const z=cz+sn*Math.max(.002,rz+wave*.7+pore);
      positions.push(x,y+Math.sin(a*4+i*.13)*.003*detail,z);
      const grain=Math.sin(x*81+y*47+z*69)*.055+Math.sin(x*137-y*93+z*111)*.025;
      const fold=Math.abs(Math.sin(y*37+a*2.3))*.055;
      const shade=Math.max(.42,Math.min(1.12,.82+grain-fold));
      colors.push(shade,shade*1.035,shade*1.045);
    }
  }
  for(let i=0;i<verticalSegments-1;i++) for(let j=0;j<radialSegments;j++){
    const a=i*radialSegments+j,b=i*radialSegments+(j+1)%radialSegments,c=(i+1)*radialSegments+(j+1)%radialSegments,d=(i+1)*radialSegments+j;
    indices.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function makeTaperedTubeGeometry(THREE, points, radii, radial=14, tubular=28) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const frames=curve.computeFrenetFrames(tubular,false), positions=[], colors=[], indices=[];
  for(let i=0;i<=tubular;i++){
    const t=i/tubular, center=curve.getPointAt(t);
    const q=t*(radii.length-1), k=Math.min(radii.length-2,Math.floor(q)), f=q-k;
    const radius=radii[k]*(1-f)+radii[k+1]*f;
    for(let j=0;j<radial;j++){
      const a=j/radial*Math.PI*2;
      const wobble=1+Math.sin(a*3+i*.38)*.035+Math.sin(a*7-i*.23)*.014;
      const v=center.clone().addScaledVector(frames.normals[i],Math.cos(a)*radius*wobble)
        .addScaledVector(frames.binormals[i],Math.sin(a)*radius*wobble);
      positions.push(v.x,v.y,v.z);
      const grain=.84+Math.sin(v.x*93+v.y*51+v.z*67)*.08;
      colors.push(grain,grain*1.025,grain*1.035);
    }
  }
  for(let i=0;i<tubular;i++) for(let j=0;j<radial;j++){
    const a=i*radial+j,b=i*radial+(j+1)%radial,c=(i+1)*radial+(j+1)%radial,d=(i+1)*radial+j;
    indices.push(a,b,d,b,c,d);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(indices);g.computeVertexNormals();
  return g;
}

function addTubeMesh(THREE, parent, points, radii, material, radial=12, tubular=24, name='Organic_Detail') {
  const mesh=new THREE.Mesh(makeTaperedTubeGeometry(THREE,points,radii,radial,tubular),material);
  mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

function makeEllipsoidGeometry(THREE, scale, segW=28, segH=18, flatten=1) {
  const p=[],c=[],idx=[];
  for(let y=0;y<=segH;y++){
    const v=y/segH*Math.PI, sy=Math.cos(v), ring=Math.sin(v);
    for(let x=0;x<=segW;x++){
      const u=x/segW*Math.PI*2;
      const n=1+Math.sin(u*5+v*7)*.018+Math.sin(u*11-v*9)*.009;
      p.push(Math.cos(u)*ring*scale[0]*n,sy*scale[1]*n,Math.sin(u)*ring*scale[2]*n*flatten);
      const shade=.86+Math.sin(u*13+v*17)*.05;
      c.push(shade,shade*1.025,shade*1.035);
    }
  }
  for(let y=0;y<segH;y++)for(let x=0;x<segW;x++){
    const a=y*(segW+1)+x,b=a+1,d=(y+1)*(segW+1)+x,e=d+1;
    idx.push(a,d,b,b,d,e);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function addEllipsoid(THREE,parent,position,scale,material,name){
  const mesh=new THREE.Mesh(makeEllipsoidGeometry(THREE,scale),material);
  mesh.position.set(...position);mesh.name=name;mesh.castShadow=true;parent.add(mesh);return mesh;
}

function makeArm(THREE, root, side, skin, name) {
  const pivot=new THREE.Group();pivot.name=name+'_Pivot';pivot.position.set(side*.345,1.79,0);root.add(pivot);
  addTubeMesh(THREE,pivot,[[0,0,0],[side*.105,-.2,.015],[side*.15,-.52,.045],[side*.12,-.78,.075],[side*.13,-1.12,.115],[side*.12,-1.31,.13]],
    [.19,.16,.125,.115,.078,.058],skin,20,42,name+'_Continuous_Limb');
  addTubeMesh(THREE,pivot,[[side*.12,-1.25,.13],[side*.13,-1.39,.18],[side*.13,-1.49,.19]],
    [.075,.09,.065],skin,18,18,name+'_Palm');
  for(let i=0;i<4;i++){
    const spread=(i-1.5)*.038, length=[.19,.25,.27,.21][i], sx=side*.13+spread;
    addTubeMesh(THREE,pivot,[[sx,-1.45,.19],[sx+spread*.25,-1.52,.22],[sx+spread*.55,-1.45-length*.78,.24],[sx+spread*.7,-1.45-length,.235]],
      [.027,.024,.016,.005],skin,9,18,name+'_Finger_'+i);
  }
  addTubeMesh(THREE,pivot,[[side*.055,-1.39,.17],[side*.015,-1.46,.21],[side*-.04,-1.56,.23],[side*-.06,-1.62,.22]],
    [.038,.032,.019,.005],skin,10,18,name+'_Thumb');
  return pivot;
}

function makeLeg(THREE, root, side, skin, name) {
  const pivot=new THREE.Group();pivot.name=name+'_Pivot';pivot.position.set(side*.155,.77,0);root.add(pivot);
  addTubeMesh(THREE,pivot,[[0,0,0],[side*.025,-.18,-.085],[side*.055,-.38,-.14],[side*.07,-.53,-.055],[side*.075,-.69,.02]],
    [.17,.145,.105,.087,.06],skin,18,34,name+'_Bent_Limb');
  addTubeMesh(THREE,pivot,[[side*.075,-.66,.015],[side*.075,-.75,.12],[side*.075,-.76,.26]],
    [.065,.09,.06],skin,16,20,name+'_Long_Foot');
  for(let i=0;i<4;i++){
    const x=side*.075+(i-1.5)*.032;
    addTubeMesh(THREE,pivot,[[x,-.75,.22],[x,-.78,.30],[x+(i-1.5)*.007,-.79,.355]],
      [.026,.018,.004],skin,8,12,name+'_Toe_'+i);
  }
  return pivot;
}
