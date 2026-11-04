(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const RENDER_SCALE = 2;
  const W = canvas.width / RENDER_SCALE, H = canvas.height / RENDER_SCALE;
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  const CHASE_BIKE_Y = H - 54;
  const ISO_X = Math.SQRT1_2, ISO_Y = Math.SQRT1_2 * .5;
  const CHASE_MACHINE_SCALE_X = 1.48, CHASE_MACHINE_SCALE_Y = 1.08;
  const titleScreen = document.querySelector('#title-screen');
  const toast = document.querySelector('#toast');
  const objectiveNode = document.querySelector('#objective');
  const objectiveIndex = document.querySelector('#objective-index');
  const networkCount = document.querySelector('#network-count');
  const networkProgress = document.querySelector('#network-progress');
  const keys = new Set();
  const world = { w: 5600, h: 3600 };
  const towers = [
    { x: 650, y: 360, baseX: 650, baseY: 360, name: 'NÓ AURORA', disabled: false, design: 0, rangeX: 104, rangeY: 36, pace: .20, phase: .2 },
    { x: 1460, y: 1110, baseX: 1460, baseY: 1110, name: 'NÓ VÉSPERA', disabled: false, design: 1, rangeX: 70, rangeY: 88, pace: .16, phase: 1.8 },
    { x: 2450, y: 340, baseX: 2450, baseY: 340, name: 'NÓ MERIDIANO', disabled: false, design: 2, rangeX: 118, rangeY: 53, pace: .24, phase: 3.2 },
    { x: 3350, y: 1700, baseX: 3350, baseY: 1700, name: 'NÓ TUFÃO', disabled: false, design: 3, rangeX: 88, rangeY: 70, pace: .30, phase: .8 },
    { x: 4300, y: 2400, baseX: 4300, baseY: 2400, name: 'NÓ CENTOPEIA', disabled: false, design: 4, rangeX: 42, rangeY: 34, pace: .13, phase: 2.4 }
  ];
  let roads = [
    [0, 1450], [260, 1450], [440, 1120], [570, 570], [650, 460],
    [940, 520], [1240, 800], [1460, 1130], [1830, 1290], [2160, 870],
    [2380, 480], [2450, 440], [2780, 440]
  ];
  let branchRoads = [];
  let buildings = [
    [250, 560, 56, 42], [330, 520, 40, 32], [390, 750, 62, 48], [760, 600, 50, 40],
    [940, 850, 46, 36], [1010, 880, 58, 38], [1340, 670, 64, 46], [1440, 750, 38, 34],
    [1320, 390, 60, 43], [1720, 660, 62, 48], [1530, 870, 48, 38], [280, 880, 44, 32],
    [465, 210, 64, 82], [820, 270, 77, 64], [875, 915, 90, 76], [1280, 200, 88, 80],
    [1375, 630, 82, 70], [1710, 120, 90, 80], [70, 950, 80, 66],
    [980, 1450, 105, 86], [1150, 220, 90, 70], [1670, 390, 120, 96], [1900, 300, 94, 74],
    [2090, 1180, 112, 91], [2320, 1420, 78, 66], [2550, 960, 130, 92], [2670, 150, 100, 80],
    [390, 1480, 68, 54], [730, 1250, 76, 62], [1530, 1560, 90, 73], [2170, 180, 72, 58]
  ];
  const fenceHitboxes = [];
  let fenceSegments = [[60, 635, 130, 0], [1030, 360, 100, Math.PI / 2], [1390, 900, 160, 0]];
  function rebuildFenceHitboxes() {
    fenceHitboxes.length = 0;
    fenceSegments.forEach(([fx, fy, length, angle]) => {
    const addRect = (x,y,w,h) => fenceHitboxes.push([fx,fy,x,y,w,h,angle]);
    for (let i = 0; i < length; i += 14) {
      if ((i / 14) % 4 === 2) continue;
      addRect(i,0,3,15);
    }
    for (let i = 0; i < length; i += 28) {
      if ((i / 28) % 3 === 1) continue;
      const span = (i / 28) % 2 ? 17 : 24;
      addRect(i,3,span,2); addRect(i+3,11,span-4,2);
    }
    });
  }
  rebuildFenceHitboxes();
  let state = 'title';
  let activeTower = 0;
  let mounted = true;
  let approachedByBike = false;
  let gameTime = 0;
  let lastTime = 0;
  let toastTimer = 0;
  let flash = 0;
  let totalRide = 0;
  let network = 0;
  let climbTime = 0;
  let climbLives = 3;
  let climbCheckpoint = 0;
  let hackStep = 0;
  let hackTime = 0;
  let hackMode = 'question', connectSelected = -1, cableCutAnswer = 0, repairAnswer = 1, pulseTarget = 1, pulseClock = 0, sequenceIndex = 0;
  const wireSequence = [0, 2, 1, 2];
  const cableConnected = [false, false, false];
  const cableMatch = [0, 1, 2];
  const cableColors = ['#e3b64f', '#72b8ae', '#df7257'];
  let chaseProgress = 0;
  let chaseSpeed = 105;
  let chaseLag = 90;
  let chaseElapsed = 0;
  let chaseLives = 3;
  let chaseInvulnerable = 0;
  let hookReady = false;
  let grappleAvailable = false;
  let grappleStartedAt = 0;
  let grappleOffset = 0;
  let grappleAttempts = 0;
  const grappleButton = document.querySelector('#grapple-action');
  const chaser = { x: 240, feet: 218, vy: 0, grounded: true, duck: 0, steer: 0 };
  const chaseObstacles = [
    { at: 620, x: 105, kind: 'debris', cleared: false }, { at: 1020, x: 365, kind: 'wall', cleared: false },
    { at: 1420, x: 225, kind: 'wreck', cleared: false }, { at: 1820, x: 112, kind: 'debris', cleared: false },
    { at: 2220, x: 358, kind: 'wall', cleared: false }, { at: 2620, x: 238, kind: 'wreck', cleared: false }
  ];
  let hazardCooldown = 0;
  let fuel = 68, hunger = 100, thirst = 100, exploreBuilding = -1, exploreStep = 0;
  let repairKits = 1, bikeLife = 100, bikeWearClock = 0, bikeCrashCooldown = 0, bikeParts = { motor: 100, handlebar: 100, frontTire: 100, rearTire: 100 };
  let bikeInspectOpen = false;
  const bikePartNames = { motor: 'MOTOR', handlebar: 'GUIDÃO', frontTire: 'PNEU DIANTEIRO', rearTire: 'PNEU TRASEIRO' };
  let supplies = buildings.map((b, i) => ({ x: b[0] + b[2] * .8, y: b[1] + b[3] * 1.2, type: i === 10 ? 'fuel' : ['ration','water','can'][i % 3], found: false, available: i === 10 ? Math.random() < .28 : Math.random() < .24 }));
  const worldReturn = { x: 0, y: 0 };
  const explorer = { x: 240, y: 145, hp: 3, invulnerable: 0 };
  const interiorHazards = [{ x: 190, y: 115, kind: 'weak' }, { x: 310, y: 180, kind: 'ceiling' }, { x: 115, y: 205, kind: 'gap' }];
  const interiorWalls = [{x:142,y:111,w:10,h:77},{x:152,y:111,w:58,h:10},{x:222,y:142,w:10,h:58},{x:232,y:142,w:55,h:10},{x:176,y:196,w:65,h:10},{x:250,y:180,w:10,h:37}];
  let walkCycle = 0;
  const camera = { x: 180, y: 3300 };
  const bike = { x: 180, y: 3300, angle: .87, speed: 0, wheel: 0 };
  const player = { x: 180, y: 3300, angle: .87, hp: 3 };
  const climber = { x: 34, feet: 245, vy: 0, grounded: true, invulnerable: 0 };
  const networkQuestions = [
    [
      { q: 'Qual equipamento encaminha dados entre redes?', a: ['Roteador', 'Switch', 'Repetidor USB'], ok: 0 },
      { q: 'Qual porta do roteador liga à internet?', a: ['LAN', 'USB', 'WAN'], ok: 2 },
      { q: 'Que cabo conecta o roteador ao modem?', a: ['HDMI', 'Ethernet', 'Áudio P2'], ok: 1 }
    ],
    [
      { q: 'O que liga vários aparelhos na rede local?', a: ['Switch', 'Microfone', 'Tela'], ok: 0 },
      { q: 'Em qual porta conectamos um PC da rede local?', a: ['WAN', 'VGA', 'LAN'], ok: 2 },
      { q: 'O que um switch encaminha entre aparelhos?', a: ['Energia da bateria', 'Sinal de vídeo', 'Pacotes de dados'], ok: 2 }
    ],
    [
      { q: 'O que permite a comunicação entre redes?', a: ['Roteador', 'Mouse', 'Caixa de som'], ok: 0 },
      { q: 'O que identifica um aparelho numa rede IP?', a: ['Nome da tela', 'Endereço IP', 'Frequência de áudio'], ok: 1 },
      { q: 'Qual serviço entrega IP aos aparelhos?', a: ['DHCP', 'HDMI', 'BIOS'], ok: 0 }
    ],
    [
      { q: 'Qual protocolo aprende rotas entre redes?', a: ['BGP', 'USB', 'JPEG'], ok: 0 },
      { q: 'O que faz a máscara de sub-rede?', a: ['Define a parte de rede do IP', 'Criptografa o monitor', 'Aumenta o sinal Wi-Fi'], ok: 0 },
      { q: 'Qual endereço identifica uma rede local privada?', a: ['192.168.1.10', '8.8.8.8', '1.1.1.1'], ok: 0 }
    ],
    [
      { q: 'Qual protocolo evita loops em switches?', a: ['STP', 'FTP', 'NTP'], ok: 0 },
      { q: 'O que é o gateway padrão?', a: ['Rota de saída para outras redes', 'Senha do Wi-Fi', 'Cabo de fibra'], ok: 0 },
      { q: 'Qual equipamento encaminha quadros pela MAC?', a: ['Switch', 'Roteador de áudio', 'Modem USB'], ok: 0 }
    ]
  ];
  const platforms = [
    { x: 0, w: 82, y: 245 }, { x: 80, w: 73, y: 214 }, { x: 153, w: 70, y: 183 },
    { x: 225, w: 70, y: 152 }, { x: 295, w: 72, y: 121 }, { x: 368, w: 112, y: 90 }
  ];
  const rubble = [];
  let seed = 98201;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < 390; i++) {
    const x = random() * world.w, y = random() * world.h;
    const nearRoad = roads.some(([rx, ry]) => Math.hypot(x - rx, y - ry) < 100);
    const nearTower = towers.some(t => Math.hypot(x - t.x, y - t.y) < 112);
    if (!nearTower && (!nearRoad || random() < .72)) rubble.push({ x, y, s: 2 + random() * 6, color: random() });
  }

  function pointSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function nearAnyRoad(x,y,limit) {
    return [roads,...branchRoads].some(path=>path.some((p,i)=>i>0&&pointSegmentDistance(x,y,path[i-1][0],path[i-1][1],p[0],p[1])<limit));
  }
  function generateMapLayout() {
    roads = [[180, 3300]];
    let roadY = 3300;
    const intervals = 17, span = world.w - 360;
    for (let i = 1; i <= intervals; i++) {
      roadY = Math.max(300, Math.min(world.h - 300, roadY + (Math.random() - .5) * 930));
      roads.push([Math.round(180 + span * i / intervals), Math.round(roadY)]);
    }
    branchRoads = [];
    const branchCount = 5 + Math.floor(Math.random() * 4);
    for (let b = 0; b < branchCount; b++) {
      const segment = 2 + Math.floor(Math.random() * (roads.length - 4));
      const [ax,ay] = roads[segment], [bx,by] = roads[segment+1];
      const t = .25 + Math.random() * .55, dx=bx-ax, dy=by-ay, baseAngle=Math.atan2(dy,dx);
      const angle=baseAngle+(Math.random()<.5?-1:1)*(.45+Math.random()*.8), path=[[Math.round(ax+dx*t),Math.round(ay+dy*t)]];
      let x=path[0][0],y=path[0][1],heading=angle;
      const points=3+Math.floor(Math.random()*4);
      for(let p=0;p<points;p++){heading+=(Math.random()-.5)*.62;x=Math.max(70,Math.min(world.w-70,x+Math.cos(heading)*(250+Math.random()*260)));y=Math.max(70,Math.min(world.h-70,y+Math.sin(heading)*(250+Math.random()*260)));path.push([Math.round(x),Math.round(y)]);}
      branchRoads.push(path);
    }
    buildings = [];
    for (let i = 0; i < 58; i++) {
      const gasStation = i === 10;
      const w = gasStation ? 100 : 42 + Math.random() * 78;
      const h = gasStation ? 78 : 36 + Math.random() * 68;
      let building = null;
      for (let attempt = 0; attempt < 100 && !building; attempt++) {
        const segment = 1 + Math.floor(Math.random() * (roads.length - 2));
        const [ax, ay] = roads[segment], [bx, by] = roads[segment + 1];
        const ratio = .2 + Math.random() * .6, dx = bx - ax, dy = by - ay;
        const length = Math.hypot(dx, dy) || 1, offset = (Math.random() < .5 ? -1 : 1) * (190 + Math.random() * 330);
        const cx = ax + dx * ratio - dy / length * offset, cy = ay + dy * ratio + dx / length * offset;
        const x = Math.round(cx - w * .825), y = Math.round(cy - h * .825);
        if (x < 70 || y < 70 || x + w * 1.65 > world.w - 70 || y + h * 1.65 > world.h - 70) continue;
        const onBranch = branchRoads.some(path => path.some((point,j)=>j>0&&pointSegmentDistance(cx,cy,path[j-1][0],path[j-1][1],point[0],point[1])<150));
        if (pointSegmentDistance(cx, cy, ax, ay, bx, by) < 150 || onBranch || Math.hypot(cx - bike.x, cy - bike.y) < 260) continue;
        const overlaps = buildings.some(([ox, oy, ow, oh]) => x < ox + ow * 1.65 + 48 && x + w * 1.65 + 48 > ox && y < oy + oh * 1.65 + 48 && y + h * 1.65 + 48 > oy);
        if (!overlaps) building = [x, y, Math.round(w), Math.round(h)];
      }
      if (!building) building = [220 + i * 91 % (world.w - 420), 180 + i * 137 % (world.h - 360), Math.round(w), Math.round(h)];
      buildings.push(building);
    }
    supplies = buildings.map((b, i) => ({ x: b[0] + b[2] * .8, y: b[1] + b[3] * 1.2, type: i === 10 ? 'fuel' : Math.random() < .18 ? 'toolkit' : ['ration','water','can'][i % 3], found: false, available: i === 10 ? Math.random() < .28 : Math.random() < .24 }));
    seed = Math.floor(Math.random() * 4294967296);
    rubble.length = 0;
    for (let i = 0; i < 1450; i++) {
      const x = random() * world.w, y = random() * world.h;
      const nearRoad = nearAnyRoad(x,y,90);
      if (!nearRoad || random() < .18) rubble.push({ x, y, s: 2 + random() * 6, color: random() });
    }
    fenceSegments = [];
    [3, 8, 13].forEach(index => {
      const [ax, ay] = roads[index], [bx, by] = roads[index + 1];
      const angle = Math.atan2(by - ay, bx - ax), length = 46 + Math.random() * 35;
      const dx = bx - ax, dy = by - ay, span = Math.hypot(dx, dy) || 1;
      fenceSegments.push([(ax + bx) * .5 - dy / span * 105, (ay + by) * .5 + dx / span * 105, length, angle]);
    });
    rebuildFenceHitboxes();
  }

  function active() { return towers.find(t => !t.disabled) || null; }
  function updateMachines(time) {
    for (const t of towers) {
      if (t.disabled) continue;
      const phase = time * t.pace + t.phase;
      const sway = Math.sin(phase * .57 + .6) * t.rangeY * .22;
      if (t.design === 0) { t.x = t.baseX + Math.sin(phase) * t.rangeX + Math.sin(phase * .43) * 24; t.y = t.baseY + Math.sin(phase * .5) * t.rangeY + sway; }
      else if (t.design === 1) { t.x = t.baseX + Math.cos(phase) * t.rangeX + Math.sin(phase * .38) * 30; t.y = t.baseY + Math.sin(phase) * t.rangeY + sway; }
      else if (t.design === 2) { t.x = t.baseX + Math.sin(phase) * t.rangeX + Math.sin(phase * 2) * t.rangeY + sway; }
      else if (t.design === 3) { t.x = t.baseX + Math.sin(phase * 1.7) * t.rangeX + Math.sin(phase * .6) * 25; t.y = t.baseY + Math.cos(phase * 1.35) * t.rangeY + sway * 1.8; }
      else { t.x = t.baseX + Math.sin(phase * .46) * t.rangeX; t.y = t.baseY + Math.sin(phase * .92) * t.rangeY + Math.sin(phase * .23) * 17; }
    }
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function worldBlocked(x, y, radius) {
    for (const [bx, by, bw, bh] of buildings) {
      const left = bx, top = by, right = bx + bw * 1.65, bottom = by + bh * 1.65;
      const nearestX = Math.max(left, Math.min(x, right)), nearestY = Math.max(top, Math.min(y, bottom));
      if ((x - nearestX) ** 2 + (y - nearestY) ** 2 < radius * radius) return true;
    }
    for (const [fx,fy,rx,ry,rw,rh,angle] of fenceHitboxes) {
      const dx=x-fx,dy=y-fy,localX=dx*Math.cos(angle)+dy*Math.sin(angle),localY=-dx*Math.sin(angle)+dy*Math.cos(angle);
      const nearestX=Math.max(rx,Math.min(localX,rx+rw)),nearestY=Math.max(ry,Math.min(localY,ry+rh));
      if ((localX-nearestX)**2+(localY-nearestY)**2<radius*radius) return true;
    }
    return false;
  }
  function nearbyBuilding(x, y) {
    return buildings.findIndex(([bx, by, bw, bh]) => x > bx - 24 && x < bx + bw * 1.65 + 24 && y > by - 24 && y < by + bh * 1.65 + 24);
  }
  function buildingDoor(index) {
    const [x, y, w, h] = buildings[index];
    return { x: x + w * 1.65 * .7, y: y + h * 1.65 + 12 };
  }
  function nearbyEntrance(x, y, maxDistance = 48) {
    let nearest = -1, best = maxDistance;
    buildings.forEach((_, i) => { const d = distance({ x, y }, buildingDoor(i)); if (d < best) { best = d; nearest = i; } });
    return nearest;
  }
  function moveWorldEntity(entity, dx, dy, radius) {
    const targetX = Math.max(18, Math.min(world.w - 18, entity.x + dx));
    const targetY = Math.max(18, Math.min(world.h - 18, entity.y + dy));
    if (!worldBlocked(targetX, targetY, radius)) { entity.x = targetX; entity.y = targetY; return true; }
    let moved = false;
    if (!worldBlocked(targetX, entity.y, radius)) { entity.x = targetX; moved = true; }
    if (!worldBlocked(entity.x, targetY, radius)) { entity.y = targetY; moved = true; }
    return moved;
  }
  function randomizeTowerSpawns() {
    const placed = [];
    function sampleRoadAtX(targetX) {
      for (let i=0;i<roads.length-1;i++) {
        const [ax,ay]=roads[i],[bx,by]=roads[i+1];
        if(targetX>=ax&&targetX<=bx){const ratio=(targetX-ax)/(bx-ax),dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;return{x:targetX,y:ay+dy*ratio,nx:-dy/len,ny:dx/len};}
      }
      return {x:targetX,y:roads[Math.floor(roads.length/2)][1],nx:0,ny:1};
    }
    towers.forEach((tower, i) => {
      const anchor = [1000,2100,3200,4300,5400][i], roadAnchor=sampleRoadAtX(anchor);
      let point = null;
      for (let attempt = 0; attempt < 180 && !point; attempt++) {
        const candidate = { x: anchor, y: Math.max(120, Math.min(world.h - 120, roadAnchor.y + (Math.random() - .5) * 180)) };
        if (distance(candidate, bike) < 650 || placed.some(p => distance(candidate, p) < 850) || worldBlocked(candidate.x, candidate.y, 48)) continue;
        point = candidate;
      }
      if (!point) {
        point = { x: roadAnchor.x, y: roadAnchor.y };
      }
      tower.baseX = tower.x = point.x; tower.baseY = tower.y = point.y;
      tower.rangeX = tower.design === 3 ? 72 + Math.random() * 26 : tower.design === 4 ? 32 + Math.random() * 20 : 28 + Math.random() * 30;
      tower.rangeY = tower.design === 3 ? 58 + Math.random() * 26 : 18 + Math.random() * 24; tower.phase = Math.random() * Math.PI * 2;
      placed.push(point);
    });
  }
  function projectPoint(x, y) {
    return {
      x: W / 2 + (x - camera.x - (y - camera.y)) * ISO_X,
      y: H / 2 + (x - camera.x + y - camera.y) * ISO_Y
    };
  }
  function projectFacing(angle) {
    const vx = Math.sin(angle), vy = -Math.cos(angle);
    return Math.atan2((vx - vy) * ISO_X, -(vx + vy) * ISO_Y);
  }
  function setToast(message, seconds = 2.2) {
    toast.textContent = message; toast.classList.add('visible'); toastTimer = seconds;
  }
  function setObjective(text, index = activeTower) {
    objectiveNode.textContent = text;
    objectiveIndex.textContent = String(Math.max(1, Math.min(index + 1, towers.length))).padStart(2, '0');
    networkCount.textContent = `${network} / ${towers.length}`;
    networkProgress.style.width = `${network / towers.length * 100}%`;
  }
  function updateObjective() {
    networkCount.textContent = `${network} / ${towers.length}`;
    networkProgress.style.width = `${network / towers.length * 100}%`;
    const tower = active();
    if (!tower) return;
    if (state === 'explore') setObjective('Vasculhe as ruínas por água, comida e combustível.', activeTower);
    else if (state === 'chase') setObjective('Mantenha o ritmo sob a máquina e desvie dos destroços.', activeTower);
    else if (state === 'grapple') setObjective('Mira por trás da moto: clique quando o retículo cruzar a perna.', activeTower);
    else if (state === 'climb') setObjective(`Escale ${tower.name} e alcance o terminal.`, activeTower);
    else if (state === 'hack') setObjective(hackMode === 'question' ? 'Responda sobre como conectar redes no terminal.' : hackMode === 'connect' ? 'Ligue WAN, LAN e backbone às portas corretas.' : hackMode === 'cut' ? 'Corte o cabo identificado pelo sensor de curto.' : hackMode === 'repair' ? 'Emende o cabo rompido para restaurar o enlace.' : hackMode === 'sequence' ? 'Reproduza a sequência de relés.' : 'Sincronize o pulso do terminal.', activeTower);
    else if (mounted && distance(player, tower) > 205) setObjective(`Use a moto para alcançar ${tower.name}.`, activeTower);
    else if (mounted) setObjective(`Aproxime-se de ${tower.name} para iniciar a perseguição.`, activeTower);
    else if (!approachedByBike) setObjective(`Volte à moto e alcance ${tower.name}.`, activeTower);
    else setObjective('A máquina está em movimento. Volte à moto para alcançá-la.', activeTower);
  }
  function startGame() {
    state = 'drive'; gameTime = 0; lastTime = 0; activeTower = 0; network = 0;
    bike.x = 180; bike.y = 3300; bike.angle = .87; bike.speed = 0; bike.wheel = 0;
    player.x = bike.x; player.y = bike.y; player.angle = bike.angle; player.hp = 3;
    mounted = true; approachedByBike = false; totalRide = 0; fuel = 68; hunger = 100; thirst = 100;
    repairKits = 1; bikeLife = 100; bikeWearClock = 0; bikeCrashCooldown = 0; Object.keys(bikeParts).forEach(part => bikeParts[part] = 100);
    bikeInspectOpen = false;
    generateMapLayout(); camera.x = player.x; camera.y = player.y;
    supplies.forEach(s => { s.found = false; s.available = s.type === 'fuel' ? Math.random() < .28 : Math.random() < .24; });
    towers.forEach(t => t.disabled = false);
    randomizeTowerSpawns();
    titleScreen.classList.add('dismissed'); keys.clear(); updateObjective();
    setToast('MOTO LIGADA — SIGA O SINAL DA MÁQUINA');
  }
  document.querySelector('#start-game').addEventListener('click', startGame);

  function dismount() {
    mounted = false;
    approachedByBike = false;
    player.x = bike.x + Math.cos(bike.angle) * 19;
    player.y = bike.y + Math.sin(bike.angle) * 19;
    player.angle = bike.angle;
    bike.speed = 0;
    setToast('A PÉ — A MOTO FICOU ESTACIONADA AQUI. E PARA VOLTAR'); updateObjective();
  }
  function mount() {
    if (distance(player, bike) > 43) { setToast('A MOTO ESTÁ FORA DE ALCANCE.'); return; }
    mounted = true; player.x = bike.x; player.y = bike.y; player.angle = bike.angle;
    setToast('MOTO PRONTA. SIGA PARA O PRÓXIMO NÓ.'); updateObjective();
  }
  function startGrappleAim() {
    if (!grappleAvailable) { setToast('APROXIME A MOTO DE UMA PERNA E MANTENHA O RITMO'); return; }
    state = 'grapple'; grappleStartedAt = gameTime; grappleAttempts++;
    grappleOffset = Math.sin(gameTime * 2.13 + activeTower) * 1.4;
    keys.clear(); updateObjective(); setToast('MIRA INSTÁVEL — CLIQUE NO BOTÃO NO MOMENTO CERTO', 2.2);
  }
  function grappleMeter(time) {
    const tower = active();
    const pose = chaseMachinePose(time, tower);
    const elapsed = gameTime - grappleStartedAt;
    const motion = elapsed * (2.1 + chaseSpeed * .0045) + grappleOffset;
    const needle = .5 + Math.sin(motion) * .46;
    const lateralDrift = (chaser.x - W * .5) / W * .16 + Math.sin(time * 7.4 + activeTower) * .07;
    const target = Math.max(.13, Math.min(.87, .5 + Math.sin(pose.phase * 1.2) * .21 + lateralDrift));
    const stable = Math.abs(needle - target) < .07 && pose.target.planted && chaseLag < 130;
    return { needle, target, stable, pose };
  }
  function attemptGrapple() {
    if (state !== 'grapple') return;
    const aim = grappleMeter(gameTime);
    if (aim.stable) {
      state = 'climb'; mounted = false; climbTime = 0; climbLives = 3; climbCheckpoint = 0; hazardCooldown = 1;
      climber.x = 31; climber.feet = 245; climber.vy = 0; climber.grounded = true; climber.invulnerable = 0;
      grappleAvailable = false; flash = .65; setToast('RAPEL PRESO — ESCALADA INICIADA'); updateObjective();
    } else {
      state = 'chase'; chaseLives = Math.max(1, chaseLives - 1); chaseLag = Math.min(360, chaseLag + 82); grappleAvailable = false;
      updateObjective(); setToast('O GANCHO RASPOU A PERNA — MANTENHA A MOTO ESTÁVEL E TENTE DE NOVO', 2.4);
    }
  }
  grappleButton.addEventListener('click', () => {
    if (state === 'chase') startGrappleAim();
    else if (state === 'grapple') attemptGrapple();
  });
  canvas.addEventListener('pointerdown', event => { if (state === 'grapple') attemptGrapple(); else if (state === 'hack') handleHackPointer(event); });
  function syncGrappleButton() {
    const visible = state === 'chase' || state === 'grapple';
    grappleButton.hidden = !visible;
    grappleButton.disabled = state === 'chase' && !grappleAvailable;
    grappleButton.textContent = state === 'grapple' ? 'DISPARAR RAPEL' : grappleAvailable ? 'MIRAR / RAPEL' : 'RAPEL INDISPONÍVEL';
  }
  function interact() {
    if (state === 'chase') { startGrappleAim(); return; }
    if (state === 'grapple') { attemptGrapple(); return; }
    if (state === 'drive') {
      if (mounted) { dismount(); return; }
      const building = nearbyEntrance(player.x, player.y);
      if (building >= 0) { state = 'explore'; exploreBuilding = building; exploreStep = 0; worldReturn.x = player.x; worldReturn.y = player.y; explorer.x = 83; explorer.y = 198; explorer.hp = 3; keys.clear(); setToast(building === 10 ? 'POSTO ABANDONADO — VASCULHE A MESA' : 'ENTRE NA RUÍNA — PROCURE SUPRIMENTOS NA MESA'); updateObjective(); return; }
      if (nearbyBuilding(player.x, player.y) >= 0) { setToast('PROCURE A PORTA DA CONSTRUÇÃO PARA ENTRAR.'); return; }
      if (distance(player, bike) < 43) {
        if (bikeLife <= 0 && repairKits <= 0) { setToast('MOTO AVARIADA — PROCURE UM KIT DE REPARO'); return; }
        if (bikeLife < 75 || Object.values(bikeParts).some(value => value < 70)) {
          if (repairKits > 0) { repairKits--; bikeLife = Math.min(100, bikeLife + 45); Object.keys(bikeParts).forEach(part => bikeParts[part] = Math.min(100, bikeParts[part] + 55)); setToast('KIT USADO — PEÇAS DA MOTO REPARADAS'); }
          else { setToast('SEM KIT DE REPARO — PROCURE FERRAMENTAS NAS RUÍNAS'); return; }
        }
        mount(); return;
      }
      const tower = active();
      if (tower && distance(player, tower) < 180) setToast('A MÁQUINA ESTÁ EM MOVIMENTO. ALCANCE-A DE MOTO.');
      else setToast('E  MONTAR NA MOTO ESTACIONADA.');
    } else if (state === 'explore') {
      if (Math.hypot(explorer.x - 78, explorer.y - 200) > 42) { setToast('A SAÍDA FICA NA PORTA — SIGA O MARCADOR.'); return; }
      state = 'drive'; player.x = worldReturn.x; player.y = worldReturn.y; mounted = false; keys.clear(); setToast('VOCÊ VOLTA À ESTRADA.'); updateObjective();
    } else if (state === 'climb') {
      if (climber.feet < 108 && climber.x > 390) {
        state = 'hack'; hackStep = 0; hackTime = 70; hackMode = 'question'; connectSelected = -1; cableConnected.fill(false); setToast('TERMINAL ENCONTRADO — DIAGNÓSTICO DE REDE');
      } else setToast('O TERMINAL FICA NO TOPO DA MÁQUINA.');
    }
  }
  function completeHack() {
    const tower = active();
    tower.disabled = true; network++; activeTower = towers.findIndex(t => !t.disabled); approachedByBike = false;
    flash = 1; state = active() ? 'drive' : 'ending'; mounted = false; bike.speed = 0;
    player.x = bike.x + Math.cos(bike.angle) * 20; player.y = bike.y + Math.sin(bike.angle) * 20; player.angle = bike.angle;
    setToast(active() ? `${tower.name} DESATIVADO — SINAL RESTAURADO` : 'REDE RESTAURADA — A HUMANIDADE VOLTOU A OUVIR', 4);
    if (active()) updateObjective(); else setObjective('Rede restaurada. O mundo voltou a responder.', towers.length - 1);
  }
  function beginCableChallenge() {
    hackMode = ['connect','cut','repair','sequence','timing'][activeTower]; hackStep = 0; connectSelected = -1; cableConnected.fill(false); sequenceIndex = 0; pulseClock = 0; pulseTarget = Math.floor(Math.random() * 3);
    cableCutAnswer = (activeTower + 1) % 3; repairAnswer = 1;
    setToast(hackMode === 'connect' ? 'LIGUE WAN, LAN E BACKBONE ÀS PORTAS CORRETAS' : hackMode === 'cut' ? 'ISOLE O CURTO — CORTE SOMENTE O CABO INDICADO' : hackMode === 'repair' ? 'REPARE A LINHA COM UMA EMENDA CONDUTORA' : hackMode === 'sequence' ? 'REPRODUZA A ORDEM DOS RELÉS' : 'SINCRONIZE O PULSO DO NÓ');
    updateObjective();
  }
  function resolveCablePair(port) {
    if (connectSelected < 0) { setToast('SELECIONE UM CABO À ESQUERDA PRIMEIRO.'); return; }
    if (port === cableMatch[connectSelected]) {
      cableConnected[connectSelected] = true; connectSelected = -1;
      if (cableConnected.every(Boolean)) completeHack(); else setToast('CABO CONECTADO — LIGUE OS OUTROS');
    } else { connectSelected = -1; hackTime -= 3; setToast('PORTA ERRADA — CONFIRA WAN, LAN E BACKBONE'); }
  }
  function hackInput(choice) {
    if (state !== 'hack' || choice < 0 || choice > 2) return;
    if (hackMode === 'question') {
      const question = networkQuestions[activeTower][hackStep];
      if (choice === question.ok) {
        hackStep++;
        if (hackStep >= networkQuestions[activeTower].length) beginCableChallenge();
        else setToast('RESPOSTA CERTA — PRÓXIMA PERGUNTA');
      } else { hackTime -= 4; setToast('RESPOSTA INCORRETA — TENTE OUTRA OPÇÃO', 1.2); }
    } else if (hackMode === 'connect') {
      if (connectSelected < 0) {
        if (cableConnected[choice]) { setToast('ESSE CABO JÁ ESTÁ CONECTADO.'); return; }
        connectSelected = choice; setToast('CABO SELECIONADO — ESCOLHA A PORTA CORRESPONDENTE');
      } else resolveCablePair(choice);
    } else if (hackMode === 'cut') {
      if (choice === cableCutAnswer) completeHack();
      else { hackTime -= 8; setToast('ESSE CABO ESTÁ BOM — VERIFIQUE O DIAGNÓSTICO.'); }
    } else if (hackMode === 'repair') {
      if (choice === repairAnswer) completeHack();
      else { hackTime -= 8; setToast('ESSE MATERIAL NÃO RESTABELECE A CONEXÃO.'); }
    } else if (hackMode === 'sequence') {
      if (choice === wireSequence[sequenceIndex]) { sequenceIndex++; if (sequenceIndex >= wireSequence.length) completeHack(); else setToast(`SINAL CORRETO — ${sequenceIndex}/${wireSequence.length}`); }
      else { sequenceIndex = 0; hackTime -= 6; setToast('SEQUÊNCIA ERRADA — RECOMECE A COMBINAÇÃO.'); }
    } else if (hackMode === 'timing') {
      if (choice === pulseTarget && Math.abs(Math.sin(pulseClock * 7)) > .86) completeHack();
      else { hackTime -= 3; setToast('PULSO PERDIDO — APERTE QUANDO O INDICADOR BRILHAR.'); }
    }
  }
  function handleHackPointer(event) {
    if (state !== 'hack') return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * W, y = (event.clientY - bounds.top) / bounds.height * H;
    if (hackMode === 'question') {
      const choice = Math.floor((y - 108) / 32);
      if (x >= 100 && x <= 380 && choice >= 0 && choice < 3) hackInput(choice);
    } else if (hackMode === 'connect') {
      const row = Math.round((y - 125) / 35);
      if (row < 0 || row > 2) return;
      if (x < 230) {
        if (!cableConnected[row]) { connectSelected = row; setToast('CABO SELECIONADO — TOQUE NA PORTA À DIREITA'); }
      } else if (x > 250) resolveCablePair(row);
    } else {
      const row = Math.floor((x - 103) / 91);
      if (y >= 134 && y <= 208 && row >= 0 && row < 3) hackInput(row);
    }
  }

  function keyDown(e) {
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    if (state === 'title') { if (key === 'enter') startGame(); return; }
    if (state === 'ending') { if (key === 'enter') { state = 'title'; titleScreen.classList.remove('dismissed'); } return; }
    if (state === 'drive' && !mounted && key === 'f' && !e.repeat) {
      if (distance(player,bike) <= 85) bikeInspectOpen = !bikeInspectOpen;
      else setToast('CHEGUE PERTO DA MOTO PARA INSPECIONÁ-LA.');
      return;
    }
    if (state === 'hack') {
      if (['1','2','3'].includes(key) && !e.repeat) hackInput(Number(key) - 1);
      return;
    }
    if (state === 'explore' && key === 'e' && !e.repeat) { interact(); return; }
    if (key === 'e' && !e.repeat) { interact(); return; }
    if (state === 'climb' && (key === ' ' || key === 'w' || key === 'arrowup') && !e.repeat) {
      if (climber.grounded || climber.feet > 235) { climber.vy = -208; climber.grounded = false; }
    }
    keys.add(key);
  }
  function keyUp(e) { keys.delete(e.key.toLowerCase()); }
  addEventListener('keydown', keyDown);
  addEventListener('keyup', keyUp);
  addEventListener('blur', () => keys.clear());

  function drawGround(time) {
    ctx.fillStyle = '#20292a'; ctx.fillRect(0, 0, world.w, world.h);
    const left = Math.max(0, Math.floor((camera.x - 520) / 16) * 16), right = Math.min(world.w, camera.x + 520);
    const top = Math.max(0, Math.floor((camera.y - 520) / 16) * 16), bottom = Math.min(world.h, camera.y + 520);
    for (let y = top; y < bottom; y += 16) for (let x = left; x < right; x += 16) {
      const shade = ((x / 16 * 7 + y / 16 * 13) % 5);
      ctx.fillStyle = shade === 0 ? '#252f30' : shade === 1 ? '#222c2d' : '#202a2b';
      ctx.fillRect(x, y, 16, 16);
      if ((x * 7 + y * 3) % 11 === 0) { ctx.fillStyle = '#343b38'; ctx.fillRect(x + 4, y + 5, 2, 2); }
    }
    rubble.forEach(r => { if (Math.abs(r.x-camera.x)<560 && Math.abs(r.y-camera.y)<560) { ctx.fillStyle = r.color > .5 ? '#3c4641' : '#1c292b'; ctx.fillRect(r.x, r.y, r.s, r.s * .7); } });
    ctx.lineCap = 'square'; ctx.lineJoin = 'round';
    ctx.beginPath(); roads.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = '#282f30'; ctx.lineWidth = 46; ctx.stroke();
    ctx.beginPath(); roads.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = '#383e3b'; ctx.lineWidth = 30; ctx.stroke();
    branchRoads.forEach(path=>{ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#282f30';ctx.lineWidth=46;ctx.stroke();ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#383e3b';ctx.lineWidth=30;ctx.stroke();});
    ctx.setLineDash([9, 13]); ctx.lineWidth = 1; ctx.strokeStyle = '#a1805a40'; ctx.stroke(); ctx.setLineDash([]);
    branchRoads.forEach(path=>{ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.setLineDash([9,13]);ctx.lineWidth=1;ctx.strokeStyle='#a1805a40';ctx.stroke();ctx.setLineDash([]);});
    // Buckled asphalt, potholes and long cracks scar the old transit routes.
    roads.slice(2).filter((_,i) => i % 3 === 0).forEach(([x,y], i) => {
      const [px,py] = roads[Math.min(roads.length-1, i*3+1)], a = Math.atan2(y-py,x-px);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = '#151e20'; ctx.beginPath(); ctx.ellipse(0, 0, 11 + i % 3 * 3, 4 + i % 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#172021'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(1, -2); ctx.lineTo(5, -1); ctx.lineTo(10, -6); ctx.moveTo(-1, 0); ctx.lineTo(-7, -5); ctx.moveTo(4, -1); ctx.lineTo(7, 5); ctx.stroke();
      ctx.restore();
    });
    fenceSegments.forEach(([x,y,length,angle]) => drawFence(x,y,length,angle));
  }
  function drawBuilding(x, y, w, h, i) {
    ctx.fillStyle = '#182426'; ctx.fillRect(x - 5, y - 4, w + 12, h + 12);
    ctx.fillStyle = '#4a5147'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#303b39'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = '#67705e'; ctx.fillRect(x + 7, y + 6, Math.max(7, w * .32), 4);
    ctx.fillStyle = '#d08e5b'; ctx.fillRect(x + w - 10, y + h - 8, 4, 4);
    ctx.fillStyle = '#151f21'; ctx.fillRect(x + 9, y + h - 1, 12, 5);
    if (i % 3 === 0) { ctx.fillStyle = '#3a4641'; ctx.fillRect(x + w * .55, y - 7, 4, 8); ctx.fillRect(x + w * .55 + 5, y - 11, 3, 12); }
  }
  function drawFence(x, y, length, angle) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    for (let i = 0; i < length; i += 14) { if ((i / 14) % 4 !== 2) { ctx.fillStyle = '#4d554d'; ctx.fillRect(i, 0, 3, 15); } }
    for (let i = 0; i < length; i += 28) {
      if ((i / 28) % 3 === 1) continue;
      const span = (i / 28) % 2 ? 17 : 24; ctx.fillStyle = '#765b43'; ctx.fillRect(i, 3, span, 2); ctx.fillRect(i + 3, 11, span - 4, 2);
    }
    ctx.restore();
  }
  function polygon(points, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath(); ctx.fill();
  }
  function drawIsoBuilding(x, y, w, h, index, time) {
    w *= 1.65; h *= 1.65;
    const base = [projectPoint(x, y), projectPoint(x + w, y), projectPoint(x + w, y + h), projectPoint(x, y + h)];
    const floors = index === 10 ? 1 : w >= 115 && h >= 99 ? 3 + index % 4 : 1 + index % 2;
    const lift = 20 + floors * 13 + h * .26;
    const roof = base.map((p, i) => ({ x: p.x, y: p.y - lift - ((index + i * 2) % 5 === 0 ? 9 + index % 3 * 3 : 0) }));
    ctx.fillStyle = '#11191a88'; ctx.beginPath(); ctx.ellipse((base[0].x + base[2].x) / 2 + 4, (base[0].y + base[2].y) / 2 + 3, w * .48, h * .18, 0, 0, Math.PI * 2); ctx.fill();
    polygon([base[1], base[2], roof[2], roof[1]], index % 2 ? '#1a2425' : '#161f21');
    polygon([base[2], base[3], roof[3], roof[2]], index % 3 ? '#232a29' : '#1b2324');
    const facePoint = (a, b, bottom, u, v) => ({ x: a.x + (b.x - a.x) * u + (bottom.x - a.x) * v, y: a.y + (b.y - a.y) * u + (bottom.y - a.y) * v });
    const rows = Math.max(2, Math.floor(lift / 15)), columns = Math.min(5, Math.max(2, Math.floor(w / 34)));
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const u = (col + 1) / (columns + 1), v = (row + 1) / (rows + 1);
      const p1 = { x: roof[1].x + (roof[2].x - roof[1].x) * u + (base[1].x - roof[1].x) * v, y: roof[1].y + (roof[2].y - roof[1].y) * u + (base[1].y - roof[1].y) * v };
      const p2 = { x: roof[2].x + (roof[3].x - roof[2].x) * u + (base[2].x - roof[2].x) * v, y: roof[2].y + (roof[3].y - roof[2].y) * u + (base[2].y - roof[2].y) * v };
      const pane = (row * 3 + col * 5 + index) % 9;
      ctx.fillStyle = pane === 0 ? '#956647' : pane < 3 ? '#303a38' : '#111a1c';
      ctx.fillRect(p1.x - 2, p1.y - 3, 4, 6); ctx.fillRect(p2.x - 2, p2.y - 3, 4, 6);
    }
    if (index % 2 === 0) {
      const hole = [facePoint(roof[1], roof[2], base[1], .56,.32),facePoint(roof[1], roof[2], base[1],.76,.34),facePoint(roof[1],roof[2],base[1],.73,.45),facePoint(roof[1],roof[2],base[1],.8,.55),facePoint(roof[1],roof[2],base[1],.65,.72),facePoint(roof[1],roof[2],base[1],.5,.67)];
      polygon(hole, '#0d1416'); ctx.strokeStyle = '#504d42'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hole[1].x, hole[1].y); ctx.lineTo(hole[2].x, hole[2].y); ctx.lineTo(hole[3].x, hole[3].y); ctx.stroke();
    } else {
      const hole = [facePoint(roof[2], roof[3], base[2], .18,.55),facePoint(roof[2], roof[3], base[2],.42,.51),facePoint(roof[2],roof[3],base[2],.48,.63),facePoint(roof[2],roof[3],base[2],.37,.78),facePoint(roof[2],roof[3],base[2],.14,.72)];
      polygon(hole, '#0e1517');
    }
    const door = [facePoint(roof[2],roof[3],base[2],.22,.62), facePoint(roof[2],roof[3],base[2],.40,.62), facePoint(roof[2],roof[3],base[2],.40,1), facePoint(roof[2],roof[3],base[2],.22,1)];
    polygon(door, '#0a1112');
    ctx.strokeStyle = '#867253'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(door[0].x,door[0].y); ctx.lineTo(door[3].x,door[3].y); ctx.lineTo(door[2].x,door[2].y); ctx.stroke();
    ctx.fillStyle = '#d0a56d'; ctx.fillRect((door[2].x+door[3].x)*.5-1,(door[2].y+door[3].y)*.5-2,2,2);
    polygon(roof, index % 3 ? '#3b4542' : '#555c50');
    // Broken rooftop slabs and snapped reinforcement rods break the old skyline.
    for (let chunk = 0; chunk < 3; chunk++) {
      const px = roof[0].x + (roof[1].x - roof[0].x) * ((chunk + 1) / 4);
      const py = roof[0].y + (roof[1].y - roof[0].y) * ((chunk + 1) / 4);
      ctx.fillStyle = chunk % 2 ? '#202a29' : '#697064'; ctx.fillRect(px - 5, py - 4 - (chunk + index) % 3 * 2, 9, 3);
      if ((chunk + index) % 2 === 0) { ctx.strokeStyle = '#78604a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 2, py - 3); ctx.lineTo(px + 5, py - 14); ctx.lineTo(px + 9, py - 16); ctx.stroke(); }
    }
    const center = { x: (roof[0].x + roof[1].x + roof[2].x + roof[3].x) / 4, y: (roof[0].y + roof[1].y + roof[2].y + roof[3].y) / 4 };
    if (index === 10) {
      ctx.fillStyle = '#8b4939'; ctx.fillRect(center.x - 12, center.y - lift * .45, 24, 9); ctx.fillStyle = '#e2b879'; ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAS', center.x, center.y - lift * .45 + 6);
      ctx.fillStyle = '#303936'; ctx.fillRect(center.x - 19, center.y - lift * .45 + 9, 38, 4);
    }
    ctx.fillStyle = '#303d39'; ctx.fillRect(center.x - 9, center.y - 4, 18, 9);
    ctx.fillStyle = '#819078'; ctx.fillRect(center.x - 7, center.y - 3, 9, 2);
    ctx.fillStyle = '#d28a58'; ctx.fillRect(center.x + 5, center.y + 2, 3, 3);
    ctx.fillStyle = '#667366'; ctx.fillRect(center.x + 11, center.y - lift * .35, 3, lift * .38);
    ctx.fillStyle = index % 4 === 0 && Math.sin(time * 2.7 + index * 1.8) > -.2 ? '#bb754e' : '#4e4138'; ctx.fillRect(center.x + 11, center.y - lift * .35 - 3, 3, 3);
    for (let puff = 0; puff < 3; puff++) {
      const rise = (time * 7 + index * 11 + puff * 13) % 32;
      ctx.globalAlpha = .16 * (1 - rise / 34); ctx.fillStyle = '#969d98';
      ctx.beginPath(); ctx.ellipse(center.x + 20 + puff * 4, center.y - lift * .4 - rise, 2 + rise * .12, 1 + rise * .08, -.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawIsoTower(tower, index, time) {
    const screenCenter = projectPoint(tower.x, tower.y);
    const gait = time * tower.pace * ([5,4.2,7,10,2.6][tower.design]) + tower.phase;
    const bodyBob = Math.sin(gait * (tower.design===4?1:2)) * (tower.design===4?1:1.6);
    ctx.save(); ctx.translate(screenCenter.x, screenCenter.y + bodyBob); ctx.scale(1.58, 1.52);
    const c = { x: 0, y: 0 };
    const activeNode = !tower.disabled && tower === active();
    const pulse = Math.sin(time * 2.8 + index) * 2;
    const pace = gait;
    const stride = Math.sin(pace) * ([9,13,9,17,5][tower.design]);
    const shell = tower.design === 0 ? '#56635f' : tower.design === 1 ? '#685a49' : '#536274';
    const edge = tower.design === 0 ? '#88958a' : tower.design === 1 ? '#b08a58' : '#8ba4b4';
    const core = tower.disabled ? '#75d9ae' : '#f07558';
    ctx.fillStyle = '#07101199'; ctx.beginPath(); ctx.ellipse(c.x + 4, c.y + 26, 83, 29, 0, 0, Math.PI * 2); ctx.fill();
    if (activeNode) { ctx.strokeStyle = '#e9785a66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y + 22, 96 + pulse, 35 + pulse * .3, 0, 0, Math.PI * 2); ctx.stroke(); }

    // The three walkers have different leg counts and gait: a heavy four-legger,
    // a broad six-leg carrier, and a tall, three-legged surveyor.
    const legs = tower.design === 1
      ? [[-49,-44,-78,-56,-92,-7],[-34,-38,-51,-65,-67,-18],[4,-38,19,-68,30,-13],[43,-43,69,-62,83,-4],[52,-36,84,-39,96,8],[-47,-35,-77,-22,-91,13]]
      : tower.design === 2
        ? [[-21,-48,-48,-65,-72,22],[21,-48,49,-65,74,19],[0,-42,4,-4,0,43]]
        : tower.design === 3
          ? [[-46,-42,-74,-56,-96,13],[-20,-38,-38,-7,-54,27],[20,-38,38,-7,54,27],[46,-42,74,-56,96,13]]
          : tower.design === 4
            ? [[-51,-42,-69,-58,-78,13],[-37,-39,-49,-12,-57,25],[-20,-37,-27,-2,-36,28],[-4,-35,-6,-5,-12,29],[12,-35,15,-4,19,28],[28,-37,39,-2,47,26],[43,-39,59,-13,68,23],[54,-41,76,-55,89,12]]
            : [[-38,-43,-65,-57,-79,15],[-23,-38,-39,-5,-48,28],[28,-38,43,-5,52,29],[42,-43,70,-58,84,14]];
    legs.forEach(([hx,hy,kx,ky,fx,fy], i) => {
      const legPhase = pace + (i % 2) * Math.PI;
      const swing = Math.sin(legPhase) * ([5,7,5,10,3][tower.design]);
      const hip = { x: c.x + hx, y: c.y + hy };
      const knee = { x: c.x + kx + swing * .45, y: c.y + ky + Math.max(0, Math.cos(legPhase) * 3) };
      const foot = { x: c.x + fx + swing, y: c.y + fy + Math.max(0, Math.sin(legPhase) * 5) };
      ctx.strokeStyle = '#11191b'; ctx.lineWidth = tower.design === 2 ? 10 : 8; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.strokeStyle = shell; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.fillStyle = '#202a2d'; ctx.fillRect(knee.x - 5, knee.y - 5, 10, 10); ctx.fillStyle = edge; ctx.fillRect(knee.x - 2, knee.y - 2, 4, 4);
      ctx.fillStyle = '#121a1c'; ctx.fillRect(foot.x - 8, foot.y - 3, 16, 6); ctx.fillStyle = edge; ctx.fillRect(foot.x - 5, foot.y - 2, 10, 2);
    });

    if (tower.design === 0) {
      // Aurora: tall sensor mast rising from a massive sloped command hull.
      polygon([{x:c.x-54,y:c.y-54},{x:c.x-43,y:c.y-76},{x:c.x+34,y:c.y-76},{x:c.x+59,y:c.y-57},{x:c.x+50,y:c.y-29},{x:c.x-48,y:c.y-27}], '#11191b');
      polygon([{x:c.x-49,y:c.y-55},{x:c.x-40,y:c.y-70},{x:c.x+31,y:c.y-70},{x:c.x+50,y:c.y-55},{x:c.x+44,y:c.y-33},{x:c.x-45,y:c.y-31}], shell);
      polygon([{x:c.x-34,y:c.y-69},{x:c.x-22,y:c.y-91},{x:c.x+21,y:c.y-91},{x:c.x+34,y:c.y-70}], '#303b3c');
      ctx.fillStyle = '#172123'; ctx.fillRect(c.x - 17, c.y - 87, 34, 12); ctx.fillStyle = core; ctx.fillRect(c.x - 11, c.y - 83, 22, 4);
      ctx.fillStyle = edge; ctx.fillRect(c.x - 37, c.y - 60, 3, 21); ctx.fillRect(c.x + 34, c.y - 59, 3, 18);
      ctx.fillStyle = '#293436'; ctx.fillRect(c.x - 27, c.y - 25, 53, 9); ctx.fillStyle = '#a4a48d'; ctx.fillRect(c.x - 19, c.y - 22, 31, 2);
      ctx.strokeStyle = '#242e30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x + 48, c.y - 48); ctx.lineTo(c.x + 75, c.y - 65); ctx.lineTo(c.x + 83, c.y - 63); ctx.stroke();
    } else if (tower.design === 1) {
      // Véspera: low, wide armored carrier with paired reactor pods and hazard paint.
      ctx.fillStyle = '#11191b'; ctx.fillRect(c.x - 66, c.y - 64, 132, 43);
      polygon([{x:c.x-61,y:c.y-61},{x:c.x-48,y:c.y-74},{x:c.x+45,y:c.y-74},{x:c.x+62,y:c.y-57},{x:c.x+56,y:c.y-29},{x:c.x-57,y:c.y-28}], shell);
      ctx.fillStyle = '#333c3a'; ctx.fillRect(c.x - 48, c.y - 56, 96, 7); ctx.fillStyle = edge; ctx.fillRect(c.x - 45, c.y - 54, 52, 2);
      ctx.fillStyle = '#192224'; ctx.fillRect(c.x - 62, c.y - 46, 18, 25); ctx.fillRect(c.x + 44, c.y - 46, 18, 25);
      ctx.fillStyle = core; ctx.fillRect(c.x - 59, c.y - 39, 12, 4); ctx.fillRect(c.x + 47, c.y - 39, 12, 4);
      ctx.fillStyle = '#d0ad68'; for (let i = 0; i < 6; i++) ctx.fillRect(c.x - 28 + i * 11, c.y - 28, 5, 3);
      ctx.fillStyle = '#1c2729'; ctx.fillRect(c.x - 22, c.y - 84, 44, 20); ctx.fillStyle = shell; ctx.fillRect(c.x - 16, c.y - 81, 32, 14);
      ctx.fillStyle = core; ctx.fillRect(c.x - 7, c.y - 76, 14, 4);
    } else if (tower.design === 2) {
      // Meridian: narrow three-leg sentinel, with a forward lance and crown antenna.
      polygon([{x:c.x-34,y:c.y-48},{x:c.x-45,y:c.y-70},{x:c.x-19,y:c.y-88},{x:c.x+29,y:c.y-76},{x:c.x+41,y:c.y-52},{x:c.x+24,y:c.y-29},{x:c.x-27,y:c.y-28}], '#101719');
      polygon([{x:c.x-29,y:c.y-51},{x:c.x-37,y:c.y-68},{x:c.x-16,y:c.y-82},{x:c.x+25,y:c.y-72},{x:c.x+34,y:c.y-53},{x:c.x+20,y:c.y-34},{x:c.x-23,y:c.y-33}], shell);
      ctx.fillStyle = '#202b30'; ctx.fillRect(c.x - 12, c.y - 71, 27, 12); ctx.fillStyle = core; ctx.fillRect(c.x - 5, c.y - 67, 18, 4);
      polygon([{x:c.x+28,y:c.y-60},{x:c.x+50,y:c.y-67},{x:c.x+81,y:c.y-63},{x:c.x+82,y:c.y-56},{x:c.x+49,y:c.y-51},{x:c.x+29,y:c.y-52}], '#283338');
      ctx.fillStyle = edge; ctx.fillRect(c.x + 51, c.y - 63, 25, 2);
      ctx.strokeStyle = '#202a2d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(c.x, c.y - 84); ctx.lineTo(c.x + 2, c.y - 104); ctx.lineTo(c.x + 23, c.y - 111); ctx.stroke();
      ctx.fillStyle = core; ctx.fillRect(c.x + 20, c.y - 114, 5, 5);
    } else if (tower.design === 3) {
      // Tufão: fast four-legged runner with a long turbine body and twin fins.
      polygon([{x:c.x-59,y:c.y-51},{x:c.x-45,y:c.y-78},{x:c.x+37,y:c.y-78},{x:c.x+59,y:c.y-54},{x:c.x+52,y:c.y-31},{x:c.x-51,y:c.y-30}], '#101719');
      polygon([{x:c.x-52,y:c.y-54},{x:c.x-40,y:c.y-72},{x:c.x+34,y:c.y-72},{x:c.x+50,y:c.y-52},{x:c.x+44,y:c.y-36},{x:c.x-45,y:c.y-35}], shell);
      ctx.fillStyle='#202c30';ctx.fillRect(c.x-22,c.y-67,45,15);ctx.fillStyle=core;ctx.fillRect(c.x-16,c.y-62,32,5);
      ctx.fillStyle=edge;ctx.beginPath();ctx.moveTo(c.x-48,c.y-58);ctx.lineTo(c.x-76,c.y-74);ctx.lineTo(c.x-71,c.y-47);ctx.fill();ctx.beginPath();ctx.moveTo(c.x+47,c.y-58);ctx.lineTo(c.x+77,c.y-76);ctx.lineTo(c.x+68,c.y-45);ctx.fill();
      ctx.strokeStyle='#69766b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(c.x-15,c.y-83);ctx.lineTo(c.x+8,c.y-99);ctx.lineTo(c.x+30,c.y-83);ctx.stroke();
    } else {
      // Centopeia: low armored crawler with eight short synchronized legs.
      polygon([{x:c.x-61,y:c.y-49},{x:c.x-53,y:c.y-66},{x:c.x+49,y:c.y-66},{x:c.x+63,y:c.y-50},{x:c.x+56,y:c.y-29},{x:c.x-56,y:c.y-29}], '#101719');
      polygon([{x:c.x-54,y:c.y-52},{x:c.x-47,y:c.y-62},{x:c.x+45,y:c.y-62},{x:c.x+54,y:c.y-49},{x:c.x+49,y:c.y-35},{x:c.x-49,y:c.y-35}], shell);
      ctx.fillStyle='#212b2d';ctx.fillRect(c.x-31,c.y-58,63,12);ctx.fillStyle=core;ctx.fillRect(c.x-21,c.y-54,42,4);
      for(let i=0;i<6;i++){ctx.fillStyle=i%2?edge:'#373e38';ctx.fillRect(c.x-45+i*18,c.y-30,8,5);}
      ctx.strokeStyle=edge;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(c.x-39,c.y-63);ctx.lineTo(c.x-49,c.y-81);ctx.moveTo(c.x+39,c.y-63);ctx.lineTo(c.x+49,c.y-81);ctx.stroke();
    }
    if (!tower.disabled) {
      const beamX = c.x + Math.sin(time * 1.7 + index) * 68;
      ctx.strokeStyle = core; ctx.globalAlpha = .36; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(beamX, c.y - 68); ctx.lineTo(beamX + 8, c.y + 11); ctx.stroke(); ctx.globalAlpha = 1;
    } else { ctx.fillStyle = '#8fe0b9'; ctx.fillRect(c.x - 4, c.y - 82, 8, 3); }
    ctx.restore();
    ctx.fillStyle = '#d4dac3'; ctx.font = '7px monospace'; ctx.textAlign = 'center'; ctx.fillText(tower.name, screenCenter.x, screenCenter.y - 180);
  }
  function drawIsoMap(time) {
    ctx.save();
    const camX = (camera.x - camera.y) * ISO_X, camY = (camera.x + camera.y) * ISO_Y;
    ctx.translate(W / 2 - camX, H / 2 - camY);
    ctx.transform(ISO_X, ISO_Y, -ISO_X, ISO_Y, 0, 0);
    drawGround(time);
    ctx.restore();
  }
  function drawIsoDepthObjects(time, includeActors) {
    const objects = [];
    buildings.forEach(([x, y, w, h], i) => objects.push({ depth: x + y + (w + h) * .82, draw: () => drawIsoBuilding(x, y, w, h, i, time) }));
    towers.forEach((tower, i) => objects.push({ depth: tower.x + tower.y, draw: () => drawIsoTower(tower, i, time) }));
    const tower = active();
    if (includeActors && mounted) objects.push({ depth: bike.x + bike.y, draw: () => {
      const p = projectPoint(bike.x, bike.y);
      drawBike(p.x, p.y, projectFacing(bike.angle), bike.speed, time);
      drawFootWorld(p.x, p.y, projectFacing(player.angle), time);
    } });
    else if (includeActors) {
      objects.push({ depth: bike.x + bike.y, draw: () => {
        const p = projectPoint(bike.x, bike.y);
        drawBike(p.x, p.y, projectFacing(bike.angle), 0, time);
      } });
      objects.push({ depth: player.x + player.y, draw: () => {
        const p = projectPoint(player.x, player.y);
        drawFootWorld(p.x, p.y, projectFacing(player.angle), time);
      } });
    }
    objects.sort((a, b) => a.depth - b.depth).forEach(o => o.draw());
  }
  function drawTerminal(tower) {
    const source = projectPoint(tower.x, tower.y), term = projectPoint(tower.x, tower.y + 108);
    ctx.strokeStyle = '#79d8b288'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(source.x, source.y); ctx.lineTo(term.x, term.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#10181977'; ctx.beginPath(); ctx.ellipse(term.x + 2, term.y + 7, 17, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#53645a'; ctx.fillRect(term.x - 13, term.y - 7, 26, 14); ctx.fillStyle = '#192726'; ctx.fillRect(term.x - 9, term.y - 6, 18, 10);
    ctx.fillStyle = '#8de0bd'; ctx.fillRect(term.x - 7, term.y - 4, 14, 6); ctx.fillStyle = '#c7f2cb'; ctx.fillRect(term.x - 2, term.y - 2, 4, 3);
  }

  function drawBike(x, y, angle, speed, time) {
    ctx.save(); ctx.translate(x + 3, y + 6); ctx.scale(1, .62); ctx.fillStyle = '#07101188'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(.72, .72);
    const bounce = Math.abs(Math.sin(time * 17)) * Math.min(1, Math.abs(speed) / 70);
    // Soft shadow, two aligned tires, and a clear front/rear silhouette.
    ctx.fillStyle = '#0a1111aa'; ctx.fillRect(-10, -13 + bounce, 20, 31);
    ctx.fillStyle = '#080d0f'; ctx.fillRect(-4, -18, 8, 11); ctx.fillRect(-5, 9, 10, 11);
    ctx.fillStyle = '#535a57'; ctx.fillRect(-2, -16, 4, 7); ctx.fillRect(-3, 11, 6, 7);
    ctx.fillStyle = '#9a6b4e'; ctx.fillRect(-3, 17, 6, 2);
    // Black fairing and tank with restrained steel highlights.
    ctx.fillStyle = '#111719'; ctx.fillRect(-7, -11, 14, 25);
    ctx.fillStyle = '#252c2d'; ctx.fillRect(-8, -7, 16, 11);
    ctx.fillStyle = '#3e4746'; ctx.fillRect(-6, -9, 2, 8); ctx.fillRect(4, -9, 2, 8);
    ctx.fillStyle = '#080d0f'; ctx.fillRect(-5, 3, 10, 9);
    ctx.fillStyle = '#343c3d'; ctx.fillRect(-4, 4, 8, 6);
    ctx.fillStyle = '#70746c'; ctx.fillRect(-2, 5, 4, 4);
    ctx.fillStyle = '#121719'; ctx.fillRect(-8, -2, 3, 8); ctx.fillRect(5, -2, 3, 8);
    ctx.fillStyle = '#6748a0'; ctx.fillRect(-1, -8, 2, 7); ctx.fillRect(-6, 0, 2, 4); ctx.fillRect(4, 0, 2, 4);
    // Purple crossbar and grips are deliberately easy to spot from above.
    ctx.fillStyle = '#160f21'; ctx.fillRect(-12, -13, 24, 5);
    ctx.fillStyle = '#a77be4'; ctx.fillRect(-11, -12, 22, 2);
    ctx.fillStyle = '#714bb0'; ctx.fillRect(-12, -14, 4, 7); ctx.fillRect(8, -14, 4, 7);
    ctx.fillStyle = '#d9b6ff'; ctx.fillRect(-10, -13, 2, 2); ctx.fillRect(8, -13, 2, 2);
    ctx.fillStyle = '#f0cb83'; ctx.fillRect(-3, -18, 6, 3); ctx.fillStyle = '#fff0c2'; ctx.fillRect(-2, -18, 4, 1);
    ctx.fillStyle = '#ed7356'; ctx.fillRect(-2, 18, 4, 2);
    ctx.restore();
  }
  function bikePartColor(value) {
    return value >= 100 ? '#edf1e5' : value >= 72 ? '#78d49a' : value >= 38 ? '#e5a44e' : '#e26052';
  }
  function drawBikeInspectMenu() {
    ctx.fillStyle = '#050a0bd9'; ctx.fillRect(0,0,W,H);
    panel(84,34,312,202,'#111a1c','#78857a');
    ctx.fillStyle='#e4e8da';ctx.font='8px monospace';ctx.textAlign='left';ctx.fillText('INSPEÇÃO DA MOTOCICLETA',97,52);
    ctx.fillStyle='#8f9d94';ctx.font='6px monospace';ctx.fillText('ESTADO GERAL',97,68);
    ctx.fillStyle='#273330';ctx.fillRect(97,74,286,5);ctx.fillStyle=bikePartColor(bikeLife);ctx.fillRect(97,74,286*Math.max(0,bikeLife)/100,5);
    ctx.fillStyle='#d9e0d4';ctx.font='6px monospace';ctx.fillText(`${Math.round(bikeLife)}%  ·  KITS DE REPARO: ${repairKits}`,97,91);
    // Side profile with color-coded contact points for the four serviceable parts.
    ctx.strokeStyle='#74847a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(122,160);ctx.lineTo(156,132);ctx.lineTo(190,151);ctx.lineTo(222,139);ctx.lineTo(230,160);ctx.lineTo(188,160);ctx.lineTo(156,132);ctx.lineTo(146,159);ctx.stroke();
    ctx.fillStyle='#242f2e';ctx.fillRect(163,137,30,22);ctx.fillStyle='#66736a';ctx.fillRect(168,141,20,13);ctx.fillStyle=bikePartColor(bikeParts.motor);ctx.fillRect(174,145,9,5);
    ctx.strokeStyle='#a77be4';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(215,137);ctx.lineTo(229,126);ctx.lineTo(239,126);ctx.stroke();
    [[130,160,'rearTire'],[221,160,'frontTire'],[179,150,'motor'],[230,128,'handlebar']].forEach(([x,y,part])=>{ctx.fillStyle='#070d0e';ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();ctx.strokeStyle=bikePartColor(bikeParts[part]);ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.stroke();});
    ctx.fillStyle='#080d0f';ctx.beginPath();ctx.arc(130,160,3,0,Math.PI*2);ctx.arc(221,160,3,0,Math.PI*2);ctx.fill();
    const rows=[['MOTOR','motor'],['GUIDÃO','handlebar'],['PNEU DIANTEIRO','frontTire'],['PNEU TRASEIRO','rearTire']];
    rows.forEach(([label,part],i)=>{const y=111+i*25,value=bikeParts[part],color=bikePartColor(value);ctx.fillStyle=color;ctx.fillRect(253,y-6,5,5);ctx.fillStyle='#cdd7ca';ctx.font='5px monospace';ctx.textAlign='left';ctx.fillText(label,263,y);ctx.fillStyle='#273330';ctx.fillRect(263,y+4,115,4);ctx.fillStyle=color;ctx.fillRect(263,y+4,115*Math.max(0,value)/100,4);ctx.textAlign='right';ctx.fillStyle=color;ctx.fillText(`${Math.round(value)}%`,378,y);});
    ctx.textAlign='center';ctx.fillStyle='#aeb9aa';ctx.font='6px monospace';ctx.fillText('BRANCO ÍNTEGRO  ·  VERDE BOM  ·  LARANJA RUIM  ·  VERMELHO CRÍTICO',W/2,218);
    ctx.fillStyle='#d8bd83';ctx.fillText('F  FECHAR  ·  E  REPARAR OU MONTAR',W/2,229);
  }
  function drawPerson(x, y, angle, time, moving, bikePose = false) {
    ctx.save(); ctx.translate(x, y); ctx.scale(.72, .72);
    const sideFacing = Math.abs(Math.sin(angle)) > Math.abs(Math.cos(angle));
    if (sideFacing && Math.sin(angle) < 0) ctx.scale(-1, 1);
    const step = moving ? Math.sin(time * 13) * 2 : 0;
    const reach = bikePose ? -2 : 0;
    // Backpack and silhouette shadow.
    ctx.fillStyle = '#0c1315'; ctx.fillRect(-8, -8, 17, 21);
    ctx.fillStyle = '#765a41'; ctx.fillRect(4, -4, 5, 8); ctx.fillStyle = '#c0a06b'; ctx.fillRect(6, -2, 2, 3);
    // Boots and legs animate independently while walking.
    ctx.fillStyle = '#171e20'; ctx.fillRect(-6, 4 + step, 5, 7); ctx.fillRect(2, 4 - step, 5, 7);
    ctx.fillStyle = '#937354'; ctx.fillRect(-6, 9 + step, 5, 2); ctx.fillRect(2, 9 - step, 5, 2);
    // Jacket, shoulder pads, arms, gloves, and utility belt.
    ctx.fillStyle = '#233636'; ctx.fillRect(-7, -5, 15, 12);
    ctx.fillStyle = '#405751'; ctx.fillRect(-6, -5, 12, 2); ctx.fillRect(-2, -3, 3, 8);
    ctx.fillStyle = '#b07854'; ctx.fillRect(-1, 1, 2, 2);
    ctx.fillStyle = '#171f20'; ctx.fillRect(-10, -4 + reach, 4, 9); ctx.fillRect(7, -4 + reach, 4, 9);
    ctx.fillStyle = '#65756a'; ctx.fillRect(-9, -4 + reach, 2, 4); ctx.fillRect(8, -4 + reach, 2, 4);
    ctx.fillStyle = '#b4875c'; ctx.fillRect(-11, 3 + reach, 4, 3); ctx.fillRect(7, 3 + reach, 4, 3);
    // Helmet, brim, visor, and a small signal light on the pack.
    ctx.fillStyle = '#11191c'; ctx.fillRect(-6, -13, 13, 10);
    ctx.fillStyle = '#d7c18c'; ctx.fillRect(-6, -13, 12, 3); ctx.fillRect(-4, -15, 8, 2);
    ctx.fillStyle = '#7658a6'; ctx.fillRect(-4, -10, 8, 3);
    ctx.fillStyle = '#c6ecce'; ctx.fillRect(7, -5, 2, 2);
    ctx.restore();
  }
  function drawFootWorld(x, y, angle, time) {
    ctx.fillStyle = '#080f1088'; ctx.beginPath(); ctx.ellipse(x + 2, y + 5, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    drawPerson(x, y, angle, time, keys.has('w') || keys.has('s') || keys.has('a') || keys.has('d'), mounted);
  }
  function drawMinimap() {
    const x = W - 89, y = 12, w = 77, h = 53;
    panel(x, y, w, h, '#111c1d', '#65766a');
    const sx = w / world.w, sy = h / world.h;
    [roads,...branchRoads].forEach(path=>path.forEach(([rx,ry],i)=>{if(i){const [px,py]=path[i-1];ctx.strokeStyle='#697466';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+px*sx,y+py*sy);ctx.lineTo(x+rx*sx,y+ry*sy);ctx.stroke();}}));
    const p = mounted ? bike : player; ctx.fillStyle = '#ecdfaa'; ctx.fillRect(x + p.x * sx - 2, y + p.y * sy - 2, 4, 4);
  }
  function panel(x, y, w, h, fill = '#101a1c', stroke = '#475a53') {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }
  function drawDriveHud(time) {
    panel(11, 10, 157, 43, '#101a1ddd', '#617369');
    ctx.fillStyle = '#93a49a'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText(`SETOR 0${Math.min(activeTower + 1, towers.length)}  /  MANTIQUEIRA`, 19, 21);
    const source = mounted ? bike : player, tower = active();
    const signal = tower ? Math.max(0, 4 - Math.floor(distance(source, tower) / 240)) : 0;
    ctx.fillStyle = '#81928c'; ctx.fillText('SINAL', 19, 36);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i < signal ? '#83d8bd' : '#33413f'; ctx.fillRect(52 + i * 8, 30 - i * 2, 5, 6 + i * 2); }
    if (tower) {
      const angle = Math.atan2(tower.x - source.x, -(tower.y - source.y)) - (mounted ? bike.angle : player.angle);
      ctx.fillStyle = '#81928c'; ctx.fillText('DIREÇÃO', 93, 36);
      ctx.save(); ctx.translate(145, 32); ctx.rotate(angle); ctx.fillStyle = '#e2c17c'; ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(5,5); ctx.lineTo(0,2); ctx.lineTo(-5,5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (mounted) {
      panel(11, H - 37, 97, 26, '#101a1ddd', '#617369');
      ctx.fillStyle = '#93a49a'; ctx.font = '6px monospace'; ctx.fillText('VELOCIDADE', 18, H - 26);
      ctx.fillStyle = '#f0dfb3'; ctx.font = '10px monospace'; ctx.fillText(`${bike.speed<0?'RÉ ':''}${Math.round(Math.abs(bike.speed) * .52)} KM/H`, 18, H - 15);
    }
    drawMinimap(); drawSurvivalHud();
    ctx.textAlign = 'right'; ctx.fillStyle = '#82938b'; ctx.font = '6px monospace';
    ctx.fillText(mounted ? 'W ACELERA  ·  S FREIA E ENGATA RÉ  ·  A/D VIRA  ·  E DESCE' : 'W A S D MOVER  ·  E EXPLORAR / MOTO', W - 12, H - 11);
    if (!mounted && nearbyEntrance(player.x, player.y) >= 0) hint('E  ENTRAR PELA PORTA', W / 2, 31, time);
    else if (!mounted && distance(player,bike)<55 && (bikeLife<75 || Object.values(bikeParts).some(value=>value<70))) hint(repairKits>0?'E  USAR KIT E REPARAR A MOTO':'PROCURE UM KIT DE FERRAMENTAS',W/2,31,time);
    else if (tower && !mounted && distance(player, bike) < 55) hint('E  MONTAR NA MOTO', W / 2, 31, time);
    else if (tower && mounted && distance(bike, tower) < 205) hint('APROXIME-SE PARA INICIAR A PERSEGUIÇÃO', W / 2, 31, time);
    if (!mounted && distance(player,bike)<85) hint('F  INSPECIONAR MOTO',W/2,50,time);
    if (bikeInspectOpen && !mounted) drawBikeInspectMenu();
  }
  function hint(text, x, y, time) {
    const width = Math.max(132, text.length * 4.6 + 18);
    panel(x - width / 2, y - 11, width, 19, '#142323eF', '#83d2b2');
    ctx.fillStyle = Math.sin(time * 6) > -.3 ? '#ccf4d7' : '#83d2b2'; ctx.textAlign = 'center'; ctx.font = '7px monospace'; ctx.fillText(text, x, y + 2);
  }

  function drawWorld(time, dt) {
    const focus = mounted ? bike : player;
    camera.x += (focus.x - camera.x) * Math.min(1, dt * 5);
    camera.y += (focus.y - camera.y) * Math.min(1, dt * 5);
    ctx.fillStyle = '#182425'; ctx.fillRect(0, 0, W, H);
    drawIsoMap(time); drawIsoDepthObjects(time, true);
    drawAtmosphere(time, 'world');
    drawDriveHud(time);
  }

  function drawExplore(time) {
    const roomType = exploreBuilding === 10 ? 4 : exploreBuilding % 4;
    const palette = [
      { floor:'#303834', wall:'#4b554c', dark:'#222d2c', light:'#8c8064', accent:'#a56f4d' },
      { floor:'#293638', wall:'#475452', dark:'#192527', light:'#71827a', accent:'#ba8354' },
      { floor:'#34332e', wall:'#514a3d', dark:'#242625', light:'#9b8662', accent:'#aa614a' },
      { floor:'#263334', wall:'#3e4b48', dark:'#1b2627', light:'#748b80', accent:'#c09a61' },
      { floor:'#35332c', wall:'#4a4940', dark:'#242722', light:'#ba9b66', accent:'#a44e3b' }
    ][roomType];
    ctx.fillStyle = '#101819'; ctx.fillRect(0, 0, W, H);
    for (let y = -50; y < H + 60; y += 24) for (let x = -60; x < W + 60; x += 40) {
      const sx = x + ((y / 24) % 2) * 20, sy = y + Math.sin(time * .7 + x) * .4;
      ctx.fillStyle = ((x + y) / 24) % 3 ? palette.floor : '#283435';
      ctx.beginPath(); ctx.moveTo(sx, sy + 12); ctx.lineTo(sx + 20, sy); ctx.lineTo(sx + 40, sy + 12); ctx.lineTo(sx + 20, sy + 24); ctx.closePath(); ctx.fill();
    }
    // Room shell, layered walls, fractured masonry, and perspective floor insets.
    polygon([{x:39,y:190},{x:226,y:67},{x:430,y:185},{x:236,y:306}], '#11191a');
    polygon([{x:60,y:187},{x:226,y:86},{x:405,y:188},{x:236,y:289}], palette.floor);
    polygon([{x:44,y:187},{x:226,y:75},{x:236,y:270},{x:44,y:158}], palette.dark);
    polygon([{x:226,y:75},{x:421,y:187},{x:421,y:154},{x:236,y:42}], palette.wall);
    polygon([{x:44,y:187},{x:236,y:302},{x:236,y:270},{x:44,y:158}], '#202b2b');
    polygon([{x:236,y:302},{x:421,y:187},{x:421,y:154},{x:236,y:270}], '#293331');
    // Alternating stone tiles and long cracks lead the eye into the room.
    for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
      const px = 92 + col * 38 - row * 12, py = 160 + row * 19;
      ctx.strokeStyle = (row + col + exploreBuilding) % 4 === 0 ? '#9a89654a' : '#11191a42'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 17, py - 10); ctx.lineTo(px + 34, py); ctx.stroke();
    }
    ctx.strokeStyle = '#090f10'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(114,208); ctx.lineTo(156,229); ctx.lineTo(174,216); ctx.moveTo(278,245); ctx.lineTo(311,224); ctx.lineTo(324,230); ctx.stroke();
    ctx.strokeStyle = palette.accent; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(114,208); ctx.lineTo(156,229); ctx.lineTo(174,216); ctx.stroke();
    // Ruined windows, exposed reinforcement and sagging conduits.
    polygon([{x:92,y:142},{x:133,y:117},{x:134,y:159},{x:93,y:183}], '#10191a');
    ctx.strokeStyle = '#7b806e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(112,130); ctx.lineTo(114,169); ctx.moveTo(93,161); ctx.lineTo(133,139); ctx.stroke();
    ctx.fillStyle = '#101718'; ctx.fillRect(219,97,6,170); ctx.fillRect(393,169,6,91);
    ctx.fillStyle = palette.light; ctx.fillRect(221,98,2,157); ctx.fillRect(395,171,2,82);
    ctx.strokeStyle = '#806849'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(226,79); ctx.lineTo(249,101); ctx.lineTo(241,119); ctx.lineTo(258,139); ctx.moveTo(396,171); ctx.lineTo(376,185); ctx.lineTo(388,200); ctx.stroke();
    ctx.strokeStyle = '#756d5c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(73,151); ctx.lineTo(94,165); ctx.lineTo(106,160); ctx.moveTo(349,145); ctx.lineTo(366,153); ctx.lineTo(384,142); ctx.stroke();
    // Interior partitions: solid masonry dividers with visible broken tops.
    interiorWalls.forEach((wall,i) => { ctx.fillStyle='#101718'; ctx.fillRect(wall.x-2,wall.y-3,wall.w+4,wall.h+5); ctx.fillStyle=i%2?'#536158':'#62695b'; ctx.fillRect(wall.x,wall.y,wall.w,wall.h); ctx.fillStyle='#879079'; ctx.fillRect(wall.x,wall.y,wall.w,2); ctx.fillStyle='#303b37'; for(let k=5;k<wall.w;k+=12)ctx.fillRect(wall.x+k,wall.y+4,2,wall.h-6); });
    // Each ruin type has a recognizable interior silhouette and a small debris field.
    if (roomType === 0) {
      polygon([{x:263,y:190},{x:300,y:168},{x:338,y:190},{x:300,y:214}], '#111819');
      polygon([{x:267,y:184},{x:300,y:165},{x:334,y:184},{x:300,y:205}], '#687164');
      polygon([{x:267,y:184},{x:300,y:205},{x:300,y:216},{x:267,y:195}], '#37413b');
      ctx.fillStyle = '#967e5c'; ctx.fillRect(296,170,7,3); ctx.fillRect(277,185,5,3);
      polygon([{x:335,y:214},{x:349,y:205},{x:369,y:216},{x:355,y:225}], '#1b2422');
      polygon([{x:335,y:214},{x:355,y:225},{x:355,y:242},{x:335,y:231}], '#343c35');
      polygon([{x:355,y:225},{x:369,y:216},{x:369,y:233},{x:355,y:242}], '#242c29');
      ctx.strokeStyle = palette.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(339,216); ctx.lineTo(353,224); ctx.moveTo(340,222); ctx.lineTo(353,230); ctx.stroke();
    } else if (roomType === 1) {
      polygon([{x:278,y:119},{x:312,y:99},{x:357,y:119},{x:323,y:140}], '#151e20');
      polygon([{x:282,y:116},{x:312,y:98},{x:352,y:116},{x:322,y:134}], '#8b7558');
      polygon([{x:282,y:116},{x:322,y:134},{x:322,y:139},{x:282,y:121}], '#3c443d');
      polygon([{x:322,y:134},{x:352,y:116},{x:352,y:121},{x:322,y:139}], '#55503e');
      for (let i = 0; i < 4; i++) { const bx=288+i*14, by=116+(i%2)*15; polygon([{x:bx,y:by},{x:bx+8,y:by-5},{x:bx+15,y:by-1},{x:bx+7,y:by+4}], ['#926d4d','#5c7167','#987f5c'][i%3]); ctx.fillStyle='#172020'; ctx.fillRect(bx+3,by+4,3,7); }
      polygon([{x:354,y:192},{x:364,y:186},{x:374,y:192},{x:364,y:199}], '#171f20');
      polygon([{x:354,y:192},{x:364,y:199},{x:364,y:222},{x:354,y:215}], '#704f3d');
      polygon([{x:364,y:199},{x:374,y:192},{x:374,y:215},{x:364,y:222}], '#4f4138');
      ctx.fillStyle = '#9b7750'; ctx.fillRect(361,187,8,3); ctx.fillStyle = '#202829'; ctx.fillRect(359,205,9,2);
    } else if (roomType === 2) {
      polygon([{x:270,y:187},{x:309,y:164},{x:352,y:188},{x:313,y:212}], '#131b1b');
      polygon([{x:274,y:183},{x:309,y:163},{x:347,y:184},{x:312,y:205}], '#56665e');
      ctx.fillStyle = '#a97a50'; ctx.fillRect(301,172,19,8); ctx.fillStyle = '#a6c09a'; ctx.fillRect(304,174,12,3);
      polygon([{x:274,y:207},{x:288,y:199},{x:302,y:207},{x:288,y:215}], '#252e2b');
      polygon([{x:278,y:206},{x:288,y:200},{x:298,y:206},{x:288,y:212}], '#a17a55');
      polygon([{x:278,y:206},{x:288,y:212},{x:288,y:223},{x:278,y:217}], '#5c4936');
      polygon([{x:288,y:212},{x:298,y:206},{x:298,y:217},{x:288,y:223}], '#403b31');
      polygon([{x:337,y:210},{x:350,y:202},{x:363,y:210},{x:350,y:218}], '#252e2b');
      polygon([{x:340,y:209},{x:350,y:203},{x:360,y:209},{x:350,y:215}], '#a17a55');
      polygon([{x:340,y:209},{x:350,y:215},{x:350,y:226},{x:340,y:220}], '#5c4936');
      polygon([{x:350,y:215},{x:360,y:209},{x:360,y:220},{x:350,y:226}], '#403b31');
    } else if (roomType === 3) {
      polygon([{x:274,y:197},{x:310,y:176},{x:349,y:198},{x:312,y:219}], '#1b2524');
      polygon([{x:276,y:190},{x:310,y:170},{x:347,y:191},{x:312,y:211}], '#667267');
      ctx.fillStyle = '#9b7956'; ctx.fillRect(278,190,4,11); ctx.fillRect(342,190,4,11);
      ctx.fillStyle = '#556d69'; ctx.fillRect(183,232,61,3); ctx.fillRect(203,236,4,11); ctx.fillRect(235,235,4,10);
    } else {
      // Rare service station: counter, dead terminal, oil drums and pump hose.
      polygon([{x:265,y:150},{x:303,y:128},{x:362,y:150},{x:324,y:172}], '#171e1d');
      polygon([{x:269,y:146},{x:303,y:127},{x:357,y:147},{x:323,y:167}], '#a08a61');
      polygon([{x:269,y:146},{x:323,y:167},{x:323,y:174},{x:269,y:153}], '#5d503c');
      polygon([{x:323,y:167},{x:357,y:147},{x:357,y:154},{x:323,y:174}], '#3b3930');
      ctx.fillStyle = '#141d1e'; ctx.fillRect(299,117,31,24); ctx.fillStyle = '#56695e'; ctx.fillRect(302,120,25,14); ctx.fillStyle = '#b95c42'; ctx.fillRect(307,124,14,2);
      polygon([{x:351,y:159},{x:360,y:154},{x:373,y:160},{x:364,y:166}], '#252c28');
      polygon([{x:351,y:159},{x:364,y:166},{x:364,y:194},{x:351,y:187}], '#5e4840');
      polygon([{x:364,y:166},{x:373,y:160},{x:373,y:188},{x:364,y:194}], '#403831');
      ctx.fillStyle = '#9b7a52'; ctx.fillRect(357,155,9,3); ctx.fillStyle = '#202829'; ctx.fillRect(357,174,7,2);
      ctx.strokeStyle = '#c18d5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(352,158); ctx.bezierCurveTo(377,161,371,181,365,182); ctx.stroke();
      ctx.fillStyle = '#222c2a'; ctx.fillRect(276,160,51,4); ctx.fillStyle = '#b08058'; ctx.fillRect(282,164,3,18); ctx.fillRect(319,164,3,18);
    }
    // The exit is a real doorway in the near wall, with a lit threshold to guide return.
    polygon([{x:58,y:181},{x:79,y:168},{x:99,y:180},{x:99,y:207},{x:79,y:220},{x:58,y:207}], '#111819');
    polygon([{x:64,y:183},{x:79,y:174},{x:93,y:182},{x:93,y:202},{x:79,y:212},{x:64,y:203}], '#080e10');
    ctx.strokeStyle = '#a78659'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(63,203); ctx.lineTo(79,213); ctx.lineTo(94,203); ctx.stroke();
    ctx.fillStyle = Math.sin(time * 5) > 0 ? '#e1bd78' : '#876c4d'; ctx.fillRect(77,210,4,2);
    ctx.fillStyle = '#b8b39a'; ctx.font = '5px monospace'; ctx.textAlign = 'center'; ctx.fillText('PORTA',79,166);
    // Shared salvage table: every discoverable food or fuel item is placed on top.
    ctx.fillStyle = '#080d0e99'; ctx.beginPath(); ctx.ellipse(322,244,39,9,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#302a22'; ctx.fillRect(297,225,5,22); ctx.fillRect(341,225,5,21); ctx.fillRect(309,234,4,13); ctx.fillRect(332,234,4,12);
    polygon([{x:288,y:220},{x:320,y:200},{x:355,y:220},{x:323,y:241}], '#17201e');
    polygon([{x:291,y:217},{x:320,y:199},{x:351,y:217},{x:322,y:236}], '#80664a');
    polygon([{x:291,y:217},{x:322,y:236},{x:322,y:241},{x:291,y:222}], '#4a3b2d');
    polygon([{x:322,y:236},{x:351,y:217},{x:351,y:222},{x:322,y:241}], '#594530');
    ctx.strokeStyle = '#b18d61'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(298,217); ctx.lineTo(321,231); ctx.lineTo(344,217); ctx.stroke();
    ctx.fillStyle = '#d0bd8d'; ctx.font = '4px monospace'; ctx.textAlign = 'center'; ctx.fillText('SUPRIMENTOS',322,230);
    for (let i = 0; i < 12; i++) {
      const rx = 73 + (i * 47 + exploreBuilding * 13) % 330, ry = 247 + (i * 17) % 35;
      ctx.fillStyle = i % 3 ? '#717166' : '#a17c55'; ctx.fillRect(rx,ry,3 + i%3,2); ctx.fillStyle = '#171f20'; ctx.fillRect(rx+2,ry+2,3,1);
    }
    interiorHazards.forEach((hazard, i) => {
      const bob = Math.sin(time * 3 + i) * 2;
      if (hazard.kind === 'weak') { ctx.fillStyle = '#a76547'; ctx.beginPath(); ctx.moveTo(hazard.x - 17, hazard.y + bob); ctx.lineTo(hazard.x, hazard.y - 9 + bob); ctx.lineTo(hazard.x + 18, hazard.y + bob); ctx.lineTo(hazard.x, hazard.y + 9 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#de9b58'; ctx.font = '5px monospace'; ctx.fillText('FRÁGIL', hazard.x - 12, hazard.y - 12 + bob); }
      else if (hazard.kind === 'gap') { ctx.fillStyle = '#080e10'; ctx.beginPath(); ctx.moveTo(hazard.x - 28,hazard.y); ctx.lineTo(hazard.x,hazard.y - 13); ctx.lineTo(hazard.x + 31,hazard.y); ctx.lineTo(hazard.x,hazard.y + 13); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#d27455'; ctx.fillRect(hazard.x - 3,hazard.y - 2,6,3); }
      else { ctx.fillStyle = '#68706a'; ctx.fillRect(hazard.x - 24,hazard.y - 22 + bob,48,5); ctx.fillStyle = '#b08058'; ctx.fillRect(hazard.x - 17,hazard.y - 17 + bob,3,9); }
    });
    const supply = supplies[exploreBuilding];
    if (supply && supply.available && !supply.found) {
      const sx = 322 + Math.sin(time * .6) * 3, sy = 211;
      drawExploreSupply(supply.type, sx, sy, time);
      if (Math.hypot(explorer.x - sx, explorer.y - sy) < 20) {
        supply.found = true;
        if (supply.type === 'fuel') { fuel = Math.min(100, fuel + 34); setToast('ACHOU COMBUSTÍVEL — +34%'); }
        else if (supply.type === 'ration') { hunger = Math.min(100, hunger + 42); setToast('RAÇÃO MILITAR — FOME REDUZIDA'); }
        else if (supply.type === 'water') { thirst = Math.min(100, thirst + 38); setToast('GARRAFA ENCONTRADA — SEDE REDUZIDA'); }
        else if (supply.type === 'toolkit') { repairKits++; setToast(`KIT DE FERRAMENTAS — REPAROS DISPONÍVEIS: ${repairKits}`); }
        else { hunger = Math.min(100, hunger + 21); setToast('ENLATADO ENCONTRADO — FOME REDUZIDA'); }
      }
    }
    const p = { x: explorer.x, y: explorer.y };
    ctx.fillStyle = '#080d0e88'; ctx.beginPath(); ctx.ellipse(p.x,p.y + 7,8,4,0,0,Math.PI*2); ctx.fill();
    drawPerson(p.x, p.y, 0, time, keys.size > 0, false);
    drawAtmosphere(time, 'world');
    panel(10, 9, 180, 33, '#101a1deF', '#667a6e'); ctx.fillStyle = '#d5c18b'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText(exploreBuilding === 10 ? 'EXPLORAÇÃO · POSTO DE GASOLINA' : `INTERIOR · SETOR ${String(exploreBuilding + 1).padStart(2,'0')}`, 18, 22); ctx.fillStyle = '#9da99a'; ctx.fillText(Math.hypot(explorer.x - 78, explorer.y - 200) < 42 ? 'E  SAIR PELA PORTA' : 'PROCURE A PORTA PARA SAIR', 18, 34);
    if (Math.hypot(explorer.x - 78, explorer.y - 200) < 42) hint('E  SAIR PELA PORTA', W / 2, 43, time);
    drawSurvivalHud();
  }

  function drawExploreSupply(type, x, y, time) {
    const bob = Math.sin(time * 3.2) * 1.5;
    y += bob;
    ctx.fillStyle = '#070d0e99'; ctx.beginPath(); ctx.ellipse(x, y + 14, type === 'ration' ? 19 : 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (type === 'ration') {
      // Sealed olive drab R2 field-ration pouch, with crimped foil edges and a printed 24h label.
      polygon([{x:x-13,y:y-16},{x:x-9,y:y-20},{x:x+10,y:y-20},{x:x+14,y:y-16},{x:x+16,y:y+12},{x:x+12,y:y+16},{x:x-12,y:y+16},{x:x-16,y:y+12}], '#202a20');
      polygon([{x:x-11,y:y-16},{x:x-8,y:y-18},{x:x+9,y:y-18},{x:x+12,y:y-15},{x:x+13,y:y+11},{x:x+10,y:y+13},{x:x-10,y:y+13},{x:x-13,y:y+10}], '#596044');
      ctx.fillStyle = '#7b7951'; ctx.fillRect(x-11,y-16,5,4); ctx.fillRect(x+4,y-11,6,4); ctx.fillRect(x-7,y+5,7,5); ctx.fillRect(x+7,y+6,4,4);
      ctx.fillStyle = '#303c2d'; ctx.fillRect(x-10,y-10,20,16); ctx.fillStyle = '#c9c5a4'; ctx.fillRect(x-8,y-8,16,12);
      ctx.fillStyle = '#596044'; ctx.fillRect(x-6,y-6,12,2); ctx.fillStyle = '#9b5e3f'; ctx.fillRect(x-6,y-3,12,1);
      ctx.fillStyle = '#263126'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center'; ctx.fillText('R2',x,y+4);
      ctx.fillStyle = '#4c5840'; ctx.font = '4px monospace'; ctx.fillText('24 HORAS',x,y+9);
      ctx.fillStyle = '#d4c99d'; ctx.fillRect(x-10,y-20,20,2); for (let i=0;i<5;i++) ctx.fillRect(x-9+i*4,y-21,1,4);
      ctx.fillStyle = '#e1d7ad'; ctx.fillRect(x+10,y-15,3,3); ctx.fillStyle = '#6b7653'; ctx.fillRect(x+11,y-14,1,1);
    } else if (type === 'water') {
      ctx.fillStyle = '#172526'; ctx.fillRect(x-7,y-15,14,28); ctx.fillStyle = '#52827c'; ctx.fillRect(x-5,y-13,10,24);
      ctx.fillStyle = '#619b91'; ctx.fillRect(x-4,y-17,8,5); ctx.fillStyle = '#d1b274'; ctx.fillRect(x-4,y-21,8,4);
      ctx.fillStyle = '#202d2b'; ctx.fillRect(x-5,y-5,10,8); ctx.fillStyle = '#c4d1ba'; ctx.fillRect(x-3,y-3,6,2); ctx.fillStyle = '#9ac6b5'; ctx.fillRect(x-2,y+1,4,1);
      ctx.fillStyle = '#a5cfc1'; ctx.fillRect(x-3,y-11,2,5);
    } else if (type === 'toolkit') {
      ctx.fillStyle='#19221e';ctx.fillRect(x-15,y-12,30,25);ctx.fillStyle='#6e775d';ctx.fillRect(x-13,y-10,26,21);ctx.fillStyle='#c5aa72';ctx.fillRect(x-8,y-5,16,3);ctx.fillRect(x-2,y-9,4,14);ctx.fillStyle='#252d27';ctx.fillRect(x-10,y+12,20,3);ctx.fillStyle='#dfc990';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText('TOOLS',x,y+4);
    } else if (type === 'fuel') {
      ctx.fillStyle = '#171c19'; ctx.fillRect(x-12,y-12,24,26); ctx.fillStyle = '#85553c'; ctx.fillRect(x-10,y-10,20,22);
      ctx.fillStyle = '#b08058'; ctx.fillRect(x-7,y-15,10,4); ctx.fillRect(x-2,y-18,8,3); ctx.fillStyle = '#d2b071'; ctx.fillRect(x-4,y-16,4,2);
      ctx.fillStyle = '#1c2724'; ctx.fillRect(x-7,y-5,14,9); ctx.fillStyle = '#d3bd83'; ctx.fillRect(x-5,y-3,10,2); ctx.fillStyle = '#c46b45'; ctx.fillRect(x-2,y+1,4,2);
      ctx.fillStyle = '#a16a48'; ctx.fillRect(x-11,y-8,2,16); ctx.fillRect(x+9,y-8,2,16);
    } else {
      // Canned meal with rolled metal rim, label band and pull tab.
      ctx.fillStyle = '#161e1f'; ctx.fillRect(x-10,y-14,20,27); ctx.fillStyle = '#969486'; ctx.fillRect(x-8,y-13,16,24);
      ctx.fillStyle = '#c2b89b'; ctx.fillRect(x-8,y-14,16,3); ctx.fillRect(x-8,y+9,16,3); ctx.fillStyle = '#626e61'; ctx.fillRect(x-7,y-7,14,13);
      ctx.fillStyle = '#ad7048'; ctx.fillRect(x-5,y-5,10,2); ctx.fillStyle = '#d4c492'; ctx.fillRect(x-4,y-2,8,5); ctx.fillStyle = '#496354'; ctx.fillRect(x-2,y-1,4,3);
      ctx.fillStyle = '#ddd2ae'; ctx.fillRect(x-2,y-13,4,1); ctx.fillRect(x+1,y-12,3,2);
    }
    ctx.textAlign = 'left';
  }

  function drawSurvivalHud() {
    const x = W - 121; panel(x, H - 42, 110, 31, '#101a1ddd', '#617369'); ctx.font = '5px monospace'; ctx.textAlign = 'left';
    [['GAS',fuel,'#d9ab68'],['FOME',hunger,'#c69d6d'],['SEDE',thirst,'#78b9b0']].forEach((v,i) => { const y = H - 33 + i * 9; ctx.fillStyle = '#9ba99d'; ctx.fillText(v[0],x + 5,y); ctx.fillStyle = '#293834'; ctx.fillRect(x + 31,y - 4,57,4); ctx.fillStyle = v[2]; ctx.fillRect(x + 31,y - 4,57 * Math.max(0,v[1]) / 100,4); ctx.textAlign='right';ctx.fillStyle='#d8dfd1';ctx.fillText(String(Math.round(v[1])),x+104,y);ctx.textAlign='left'; });
  }

  function drawAtmosphere(time, view) {
    ctx.save();
    ctx.fillStyle = 'rgba(7, 13, 18, .13)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const drift = ((time * (5 + i * 3) + i * 197) % (W + 280)) - 140;
      const cy = 55 + i * 76 + Math.sin(time * .18 + i * 2) * 18;
      const haze = ctx.createRadialGradient(drift, cy, 4, drift, cy, 152 + i * 24);
      haze.addColorStop(0, i === 1 ? 'rgba(109, 131, 129, .15)' : 'rgba(97, 121, 120, .11)');
      haze.addColorStop(.52, 'rgba(80, 103, 104, .055)'); haze.addColorStop(1, 'rgba(65, 83, 88, 0)');
      ctx.fillStyle = haze; ctx.fillRect(drift - 180, cy - 180, 360, 360);
    }
    if (view === 'world') {
      towers.forEach((tower, i) => {
        if (tower.disabled) return;
        const p = projectPoint(tower.x, tower.y);
        if (p.x < -90 || p.x > W + 90 || p.y < -100 || p.y > H + 90) return;
        const glow = ctx.createRadialGradient(p.x, p.y - 32, 2, p.x, p.y - 32, 82);
        glow.addColorStop(0, i === activeTower ? 'rgba(235, 112, 81, .2)' : 'rgba(177, 95, 74, .1)');
        glow.addColorStop(1, 'rgba(177, 95, 74, 0)'); ctx.fillStyle = glow; ctx.fillRect(p.x - 90, p.y - 122, 180, 180);
      });
    }
    ctx.globalCompositeOperation = 'source-over';
    const lightning = Math.pow(Math.max(0, Math.sin(time * .43 + 1.7)), 38);
    if (lightning > .22) { ctx.fillStyle = `rgba(177, 199, 201, ${lightning * .13})`; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = 'rgba(174, 193, 196, .17)'; ctx.lineWidth = .55;
    for (let i = 0; i < 74; i++) {
      const x = (i * 67 + Math.sin(time * .8 + i) * 9) % W;
      const y = (i * 43 + time * (82 + i % 4 * 12)) % H;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2.2, y + 5 + i % 3); ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const x = (i * 109 + Math.sin(time * .25 + i * 3) * 23 + W) % W;
      const y = ((i * 53 - time * 4 + H * 2) % H + H) % H;
      ctx.fillStyle = i % 3 ? 'rgba(171, 186, 166, .3)' : 'rgba(226, 163, 103, .38)';
      ctx.fillRect(x, y, .7, .7);
    }
    const vignette = ctx.createRadialGradient(W * .5, H * .47, 42, W * .5, H * .47, Math.hypot(W, H) * .68);
    vignette.addColorStop(0, 'rgba(2, 7, 10, 0)'); vignette.addColorStop(.64, 'rgba(2, 7, 10, .12)'); vignette.addColorStop(1, 'rgba(2, 7, 10, .58)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function startChase() {
    state = 'chase'; mounted = false; bike.speed = 0; approachedByBike = true;
    chaseProgress = 0; chaseSpeed = 120; chaseLag = 90; chaseElapsed = 0; chaseLives = 3; chaseInvulnerable = 0; hookReady = false; grappleAvailable = false;
    chaser.x = W * .5; chaser.feet = CHASE_BIKE_Y; chaser.vy = 0; chaser.grounded = true; chaser.duck = 0; chaser.steer = 0;
    chaseObstacles.forEach(o => o.cleared = false);
    keys.clear(); setToast('SOB A MÁQUINA — ACELERE PARA ACOMPANHAR · A/D DESVIA', 2.8); updateObjective();
  }
  function chaseMachinePose(time, tower) {
    const phase = time * (1.5 + tower.design * .22) + tower.phase;
    const step = Math.sin(phase * 2.1);
    const roots = tower.design === 1
      ? [[82,0],[150,Math.PI],[330,Math.PI],[398,0],[118,Math.PI*.5],[362,Math.PI*1.5]]
      : tower.design === 2
        ? [[135,0],[240,Math.PI*1.25],[345,Math.PI*.5]]
        : tower.design === 3
          ? [[86,0],[151,Math.PI],[329,Math.PI],[394,0]]
          : tower.design === 4
            ? [[55,0],[104,Math.PI],[153,0],[202,Math.PI],[278,0],[327,Math.PI],[376,0],[425,Math.PI]]
            : [[95,0],[164,Math.PI],[316,Math.PI],[385,0]];
    const feet = roots.map(([rootX, offset], i) => {
      const cycle = tower.design===4 ? Math.sin(phase * 1.15 + offset) : Math.sin(phase * (tower.design===3?2.8:2.1) + offset);
      return { x: rootX + Math.sin(phase + offset) * (tower.design===4?13:tower.design===3?48:32), rootX, y: 70 + Math.max(0, cycle) * (tower.design===4?102:tower.design===3?145:132), planted: cycle > (tower.design===3?.76:.68), index: i };
    });
    const bike = { x: chaser.x, y: CHASE_BIKE_Y };
    const target = feet.reduce((best, foot) => Math.hypot(foot.x - bike.x, foot.y - bike.y) < Math.hypot(best.x - bike.x, best.y - bike.y) ? foot : best, feet[0]);
    return {
      phase, step, feet, target,
      bodyX: W * .5 + Math.sin(phase * .32) * 12
    };
  }
  function updateChase(dt) {
    const left = keys.has('a') || keys.has('arrowleft'), right = keys.has('d') || keys.has('arrowright');
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    chaser.steer += (steer - chaser.steer) * Math.min(1, dt * 8);
    chaser.x = Math.max(40, Math.min(W - 40, chaser.x + steer * 250 * dt));
    const targetSpeed = keys.has('w') ? 225 : keys.has('s') ? 74 : 128;
    chaseSpeed += (targetSpeed - chaseSpeed) * Math.min(1, dt * 2.8);
    chaseProgress += chaseSpeed * dt;
    chaseElapsed += dt;
    const tower = active(), machineSpeed = [151,159,167,188,126][tower.design];
    chaseLag = Math.max(0, Math.min(390, chaseLag + (machineSpeed - chaseSpeed) * dt));
    chaseInvulnerable = Math.max(0, chaseInvulnerable - dt);
    for (const o of chaseObstacles) {
      const y = CHASE_BIKE_Y - (o.at - chaseProgress) * .27;
      if (o.cleared) continue;
      if (y > CHASE_BIKE_Y + 36) { o.cleared = true; continue; }
      if (Math.abs(y - CHASE_BIKE_Y) > 20 || Math.abs(o.x - chaser.x) > 40) continue;
      o.cleared = true;
      if (chaseInvulnerable <= 0) { chaseLives--; chaseInvulnerable = 1.1; chaseLag = Math.min(390, chaseLag + 42); chaser.x += chaser.x < W * .5 ? -24 : 24; setToast('A MOTO BATEU NOS ESCOMBROS — DESVIE COM A/D'); }
    }
    const pose = chaseMachinePose(gameTime, tower);
    for (const foot of pose.feet) {
      if (foot.y > 184 && Math.hypot(foot.x - chaser.x, foot.y - CHASE_BIKE_Y) < 36 && chaseInvulnerable <= 0) {
        chaseLives--; chaseInvulnerable = 1.4; chaseLag = Math.min(390, chaseLag + 58); chaser.x += chaser.x < foot.x ? -55 : 55;
        setToast('PISÃO! LEIA A SOMBRA E SAIA DA ZONA DE IMPACTO'); break;
      }
    }
    if (chaseLag >= 375) { state = 'drive'; grappleAvailable = false; keys.clear(); bike.speed = 0; setToast('VOCÊ FICOU PARA TRÁS — REENCONTRE A MÁQUINA NO MAPA', 3.2); updateObjective(); return; }
    grappleAvailable = chaseProgress > 620 && chaseLag < 125 && pose.target.planted && Math.hypot(pose.target.x - chaser.x, pose.target.y - CHASE_BIKE_Y) < 92;
    hookReady = grappleAvailable;
    if (state === 'grapple' && gameTime - grappleStartedAt > 6) { state = 'chase'; chaseLives = Math.max(1, chaseLives - 1); chaseLag = Math.min(390, chaseLag + 60); updateObjective(); setToast('A JANELA DO RAPEL FECHOU — VOLTE A PERSEGUIR', 2); }
  }
  function drawChaseSideLegacy(time) {
    const tower = active();
    ctx.fillStyle = '#111b20'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      const width = 58 + (i % 3) * 21, height = 110 + (i * 37 % 95);
      const x = ((i * 116 - chaseProgress * (.16 + i % 3 * .08)) % 820 + 820) % 820 - 170;
      ctx.fillStyle = i % 2 ? '#1b282d' : '#202f34';
      const roofY = 222 - height;
      ctx.beginPath(); ctx.moveTo(x, 222); ctx.lineTo(x + 1, roofY + 34); ctx.lineTo(x + width * .18, roofY + 24); ctx.lineTo(x + width * .3, roofY + 29 - i % 3 * 5); ctx.lineTo(x + width * .48, roofY + 3); ctx.lineTo(x + width * .56, roofY + 21); ctx.lineTo(x + width * .82, roofY + 17); ctx.lineTo(x + width, roofY + 36); ctx.lineTo(x + width, 222); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#344b4c'; ctx.fillRect(x + width * .35, 222 - height + 12, 4, height - 23);
      for (let wy = 222 - height + 22; wy < 211; wy += 22) { ctx.fillStyle = (i + Math.floor(wy / 22) + Math.floor(time * 2)) % 5 === 0 ? '#b88353' : '#344e4d'; ctx.fillRect(x + 8, wy, 5, 3); ctx.fillRect(x + width - 17, wy, 5, 3); }
      ctx.fillStyle = '#10191c'; ctx.fillRect(x + width * .58, 222 - height + 3, 3, height - 9);
      ctx.fillStyle = '#0c1417'; ctx.fillRect(x + width * .28, roofY + height * .4, 13, 23); ctx.fillRect(x + width * .7, roofY + height * .66, 8, 17);
      ctx.strokeStyle = '#111a1d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + width * .48, roofY + 3); ctx.lineTo(x + width * .46, roofY - 13); ctx.lineTo(x + width * .53, roofY - 19); ctx.stroke();
      if (i % 2 === 0) { const smoke = (time * 11 + i * 17) % 43; ctx.globalAlpha = .18 * (1 - smoke / 50); ctx.fillStyle = '#89908a'; ctx.beginPath(); ctx.ellipse(x + width * .48 + smoke * .12, roofY - smoke * .45, 4 + smoke * .13, 3 + smoke * .1, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
    ctx.fillStyle = '#263331'; ctx.fillRect(0, 222, W, 48); ctx.fillStyle = '#4f5a4b'; ctx.fillRect(0, 222, W, 4);
    for (let x = -((chaseProgress * 1.6) % 40); x < W; x += 40) { ctx.fillStyle = '#65705a'; ctx.fillRect(x, 242, 18, 3); ctx.fillStyle = '#182526'; ctx.fillRect(x + 9, 229, 3, 5); }
    // Each machine has a distinct moving silhouette and gait.
    const pose = chaseMachinePose(time, tower);
    const { phase, step, planted, bodyX } = pose;
    const legX = bodyX + Math.sin(phase) * 45;
    const shell = tower.design === 0 ? '#596963' : tower.design === 1 ? '#6b5a45' : '#536579';
    const trim = tower.design === 0 ? '#92a095' : tower.design === 1 ? '#c09a61' : '#91adbf';
    const core = tower.disabled ? '#78d4aa' : '#ed765b';
    const dark = '#0b1215';
    ctx.save(); ctx.translate(bodyX, 222 + Math.sin(phase * 2) * 1.3); ctx.scale(CHASE_MACHINE_SCALE_X, CHASE_MACHINE_SCALE_Y); ctx.translate(-bodyX, -222);
    ctx.fillStyle = dark; ctx.fillRect(bodyX - 72, 35, 145, 63);
    if (tower.design === 0) {
      ctx.fillStyle = shell; ctx.beginPath(); ctx.moveTo(bodyX - 67, 79); ctx.lineTo(bodyX - 56, 43); ctx.lineTo(bodyX - 40, 35); ctx.lineTo(bodyX + 42, 35); ctx.lineTo(bodyX + 67, 51); ctx.lineTo(bodyX + 60, 88); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#293739'; ctx.fillRect(bodyX - 22, 27, 45, 22); ctx.fillRect(bodyX - 13, 14, 27, 19);
      ctx.fillStyle = core; ctx.fillRect(bodyX - 9, 19, 19, 5); ctx.fillStyle = trim; ctx.fillRect(bodyX - 43, 48, 3, 26); ctx.fillRect(bodyX + 38, 49, 4, 23);
      ctx.fillStyle = '#242f32'; ctx.fillRect(bodyX + 46, 64, 32, 10); ctx.fillStyle = trim; ctx.fillRect(bodyX + 67, 67, 11, 3);
    } else if (tower.design === 1) {
      ctx.fillStyle = shell; ctx.fillRect(bodyX - 78, 44, 156, 43); ctx.fillRect(bodyX - 53, 34, 107, 13);
      ctx.fillStyle = '#252f30'; ctx.fillRect(bodyX - 63, 53, 126, 8); ctx.fillStyle = trim; ctx.fillRect(bodyX - 52, 56, 67, 2);
      ctx.fillStyle = '#192325'; ctx.fillRect(bodyX - 77, 65, 19, 28); ctx.fillRect(bodyX + 58, 65, 19, 28);
      ctx.fillStyle = core; ctx.fillRect(bodyX - 72, 72, 10, 5); ctx.fillRect(bodyX + 62, 72, 10, 5);
      ctx.fillStyle = '#d1ab69'; for (let i = 0; i < 6; i++) ctx.fillRect(bodyX - 25 + i * 11, 81, 6, 4);
    } else if (tower.design === 2) {
      ctx.fillStyle = shell; ctx.beginPath(); ctx.moveTo(bodyX - 64, 83); ctx.lineTo(bodyX - 44, 39); ctx.lineTo(bodyX - 20, 28); ctx.lineTo(bodyX + 39, 37); ctx.lineTo(bodyX + 67, 76); ctx.lineTo(bodyX + 36, 91); ctx.lineTo(bodyX - 41, 91); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#243136'; ctx.fillRect(bodyX - 13, 44, 48, 17); ctx.fillStyle = core; ctx.fillRect(bodyX + 9, 49, 22, 5);
      ctx.fillStyle = '#28343a'; ctx.beginPath(); ctx.moveTo(bodyX + 37, 62); ctx.lineTo(bodyX + 73, 53); ctx.lineTo(bodyX + 95, 60); ctx.lineTo(bodyX + 71, 69); ctx.lineTo(bodyX + 38, 70); ctx.closePath(); ctx.fill();
      ctx.fillStyle = trim; ctx.fillRect(bodyX + 72, 59, 20, 2); ctx.fillStyle = '#202b31'; ctx.fillRect(bodyX - 4, 23, 7, 17); ctx.fillRect(bodyX - 27, 29, 54, 4);
    }
    // Heavy legs reach the ground; knees and piston highlights animate with each gait.
    const drawLeg = (hipX, kneeX, footX, offset, color) => {
      const swing = Math.sin(phase + offset) * 13;
      const hipY = tower.design === 1 ? 83 : 88;
      const kneeY = 143 + Math.max(0, Math.cos(phase * 2.1 + offset) * 11);
      const footY = 211 + Math.max(0, Math.sin(phase * 2.1 + offset) * 8);
      ctx.strokeStyle = dark; ctx.lineWidth = 17; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(bodyX + hipX, hipY); ctx.lineTo(bodyX + kneeX + swing * .45, kneeY); ctx.lineTo(bodyX + footX + swing, footY); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(bodyX + hipX, hipY); ctx.lineTo(bodyX + kneeX + swing * .45, kneeY); ctx.lineTo(bodyX + footX + swing, footY); ctx.stroke();
      ctx.fillStyle = '#202c2e'; ctx.fillRect(bodyX + kneeX + swing * .45 - 8, kneeY - 8, 16, 16); ctx.fillStyle = trim; ctx.fillRect(bodyX + kneeX + swing * .45 - 3, kneeY - 3, 6, 6);
      ctx.fillStyle = dark; ctx.fillRect(bodyX + footX + swing - 13, footY - 4, 26, 11); ctx.fillStyle = trim; ctx.fillRect(bodyX + footX + swing - 8, footY - 3, 15, 2);
    };
    drawLeg(-48, -64, -83, 0, shell); drawLeg(0, 8, 4, Math.PI, shell); drawLeg(legX - bodyX, 28, legX - bodyX + 5, 0, trim);
    if (tower.design === 0) drawLeg(48, 61, 72, Math.PI, shell);
    if (tower.design === 1) { drawLeg(49, 66, 83, Math.PI, '#76634a'); drawLeg(-22, -37, -50, Math.PI * .5, '#76634a'); drawLeg(60, 79, 96, Math.PI * .5, '#76634a'); }
    // Shared belly armor bridges every limb into one continuous machine body.
    ctx.fillStyle = dark; ctx.fillRect(bodyX - 65, 82, 130, 19);
    ctx.fillStyle = shell; ctx.fillRect(bodyX - 53, 86, 106, 9);
    ctx.fillStyle = trim; ctx.fillRect(bodyX - 29, 89, 58, 2);
    ctx.restore();
    drawChaseBikeSideLegacy(chaser.x, chaser.feet, time);
    chaseObstacles.forEach(o => {
      if (o.cleared) return;
      const x = 360 + o.at - chaseProgress;
      if (x < -35 || x > W + 35) return;
      if (o.kind === 'scrap') {
        ctx.fillStyle = '#101718'; ctx.beginPath(); ctx.ellipse(x, 219, 17, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#101718'; ctx.fillRect(x - 13, 203, 27, 16); ctx.fillStyle = '#8b7657'; ctx.fillRect(x - 8, 197, 16, 11);
        ctx.fillStyle = '#4d5145'; ctx.fillRect(x + 5, 207, 9, 8); ctx.fillStyle = '#d07859'; ctx.fillRect(x - 4, 200, 4, 3);
      } else {
        ctx.fillStyle = '#12191a'; ctx.fillRect(x - 14, 149, 28, 9); ctx.fillRect(x - 9, 157, 18, 43);
        ctx.fillStyle = '#d07859'; ctx.fillRect(x - 3, 159, 6, 37); ctx.fillStyle = '#414b48'; ctx.fillRect(x - 13, 148, 26, 3);
      }
      if (x > chaser.x + 35 && x < chaser.x + 155) {
        const blink = Math.sin(time * 13) > -.25;
        ctx.fillStyle = blink ? '#f0c477' : '#a86b53'; ctx.beginPath(); ctx.moveTo(x, o.kind === 'scrap' ? 181 : 137); ctx.lineTo(x - 6, o.kind === 'scrap' ? 170 : 126); ctx.lineTo(x + 6, o.kind === 'scrap' ? 170 : 126); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#171e20'; ctx.fillRect(x - 1, o.kind === 'scrap' ? 173 : 129, 2, 5);
      }
    });
    const targetX = pose.legX;
    const targetY = 222 + (190 + (planted ? 0 : 13) - 222) * CHASE_MACHINE_SCALE_Y;
    if (hookReady) { ctx.strokeStyle = '#8ce5b6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, targetY, 13 + Math.sin(time * 12) * 2, 0, Math.PI * 2); ctx.stroke(); hint('E  LANÇAR RAPEL', W / 2, 27, time); }
    drawAtmosphere(time, 'chase');
    panel(11, 10, 109, 31, '#101a1deF', '#667a6e'); ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'left'; ctx.font = '6px monospace'; ctx.fillText(`PERSEGUIÇÃO · NÓ 0${activeTower + 1}`, 18, 22); ctx.fillStyle = '#df8d66'; ctx.fillText('INTEGRIDADE', 18, 34); for (let i = 0; i < 3; i++) { ctx.fillStyle = i < chaseLives ? '#df8d66' : '#3a4140'; ctx.fillRect(74 + i * 12, 28, 8, 6); }
    panel(W - 87, 10, 76, 30, '#101a1deF', '#667a6e');
    ctx.textAlign = 'right'; ctx.fillStyle = '#a6b5a5'; ctx.fillText('VELOCIDADE', W - 18, 21); ctx.fillStyle = '#dfc68d'; ctx.fillText(`${Math.round(chaseSpeed)} KM/H`, W - 18, 33);
    ctx.textAlign = 'right'; ctx.fillStyle = '#a6b5a5'; ctx.fillText('A/D DESVIAR · W ACELERAR · S FREAR/ABAIXAR · ESPAÇO SALTO', W - 12, H - 9);
    if (!hookReady && chaseProgress > 350) { ctx.textAlign = 'center'; ctx.fillStyle = '#d0b878'; ctx.fillText('ESPERE A PERNA TOCAR O CHÃO PARA LANÇAR O RAPEL', W / 2, H - 22); }
  }

  function drawChaseBikeSideLegacy(x, feet, time) {
    const bounce = chaser.grounded ? Math.abs(Math.sin(time * 17)) * Math.min(1, chaseSpeed / 180) : 0;
    const y = feet + bounce;
    const spin = time * 8 + chaseProgress * .045;
    ctx.fillStyle = '#05090aaa'; ctx.beginPath(); ctx.ellipse(x - 2, 220, 34, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (chaseInvulnerable > 0 && Math.floor(time * 14) % 2) ctx.globalAlpha = .3;
    for (const wx of [x - 18, x + 18]) {
      ctx.fillStyle = '#070b0e'; ctx.beginPath(); ctx.arc(wx, y - 6, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#69716e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx, y - 6, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(wx, y - 6); ctx.rotate(spin); ctx.strokeStyle = '#a77be4'; ctx.lineWidth = 1;
      for (let spoke = 0; spoke < 4; spoke++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 5); ctx.stroke(); }
      ctx.restore(); ctx.fillStyle = '#b8aaa0'; ctx.fillRect(wx - 1.5, y - 7.5, 3, 3);
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.max(-.13, Math.min(.13, -chaser.vy * .0004)));
    // Side profile: linked frame, engine, tank, front fairing and purple bar.
    ctx.strokeStyle = '#11181b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-18, -10); ctx.lineTo(-5, -22); ctx.lineTo(9, -10); ctx.lineTo(-4, -8); ctx.lineTo(-18, -10); ctx.moveTo(-5, -22); ctx.lineTo(17, -18); ctx.lineTo(9, -10); ctx.stroke();
    ctx.fillStyle = '#252b2d'; ctx.fillRect(-8, -17, 14, 10); ctx.fillStyle = '#454b49'; ctx.fillRect(-5, -15, 8, 5);
    ctx.fillStyle = '#11171a'; ctx.beginPath(); ctx.moveTo(-10, -24); ctx.lineTo(-4, -29); ctx.lineTo(9, -27); ctx.lineTo(13, -21); ctx.lineTo(5, -17); ctx.lineTo(-7, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#46504e'; ctx.fillRect(-4, -27, 11, 2); ctx.fillStyle = '#a77be4'; ctx.fillRect(-1, -26, 5, 2);
    ctx.fillStyle = '#151a1c'; ctx.beginPath(); ctx.moveTo(8, -25); ctx.lineTo(17, -29); ctx.lineTo(22, -25); ctx.lineTo(19, -13); ctx.lineTo(13, -12); ctx.lineTo(9, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c4c8bb'; ctx.fillRect(17, -23, 4, 3); ctx.fillStyle = '#7954b3'; ctx.fillRect(15, -30, 10, 2); ctx.fillRect(21, -32, 3, 5);
    ctx.strokeStyle = '#665a4c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-18, -11); ctx.lineTo(-24, -6); ctx.lineTo(-30, -6); ctx.stroke();
    ctx.fillStyle = '#151a1b'; ctx.fillRect(-29, -8, 11, 3); ctx.fillStyle = '#777a72'; ctx.fillRect(-27, -7, 8, 1);
    // Rider stays tucked to the tank; the S control lowers the helmet under beams.
    const tuck = chaser.duck * 7;
    ctx.fillStyle = '#252f30'; ctx.beginPath(); ctx.moveTo(-9, -26); ctx.lineTo(-3, -35 + tuck); ctx.lineTo(6, -33 + tuck); ctx.lineTo(12, -26); ctx.lineTo(4, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#61766d'; ctx.fillRect(-3, -32 + tuck, 8, 3);
    ctx.strokeStyle = '#a17a57'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, -28 + tuck); ctx.lineTo(14, -26); ctx.lineTo(20, -28); ctx.stroke();
    ctx.fillStyle = '#a77be4'; ctx.fillRect(17, -30, 5, 3);
    ctx.strokeStyle = '#161d20'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-1, -23); ctx.lineTo(-4, -16); ctx.lineTo(4, -12); ctx.moveTo(4, -23); ctx.lineTo(2, -17); ctx.lineTo(10, -14); ctx.stroke();
    ctx.fillStyle = '#887052'; ctx.fillRect(1, -14, 8, 3); ctx.fillStyle = '#14191b'; ctx.fillRect(-7, -37 + tuck, 13, 9);
    ctx.fillStyle = '#dbc69a'; ctx.fillRect(-7, -38 + tuck, 12, 3); ctx.fillStyle = '#9f70d2'; ctx.fillRect(1, -35 + tuck, 5, 3); ctx.fillStyle = '#b08b64'; ctx.fillRect(11, -26, 5, 3);
    ctx.fillStyle = '#df7658'; ctx.fillRect(20, -17, 3, 3); ctx.restore(); ctx.globalAlpha = 1;
    if (chaseSpeed > 130) { ctx.fillStyle = '#b28a61'; ctx.globalAlpha = .55; ctx.fillRect(x - 31 - (time * 17) % 14, y - 7, 2, 2); ctx.fillRect(x - 36 - (time * 11) % 12, y - 3, 2, 2); ctx.globalAlpha = 1; }
  }

  function drawChase(time) {
    const tower = active(), pose = chaseMachinePose(time, tower), scroll = chaseProgress * .27;
    ctx.fillStyle = '#10191c'; ctx.fillRect(0, 0, W, H);
    // A broken service road and enormous ruined blocks slide beneath the top-down camera.
    for (let y = -40; y < H + 36; y += 30) for (let x = -24; x < W + 30; x += 48) {
      const yy = ((y + scroll) % 30 + 30) % 30 + y - ((y + scroll) % 30);
      ctx.fillStyle = ((x / 48 + y / 30) % 3) ? '#202a2c' : '#253032';
      ctx.beginPath(); ctx.moveTo(x, yy + 9); ctx.lineTo(x + 23, yy); ctx.lineTo(x + 47, yy + 10); ctx.lineTo(x + 24, yy + 21); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#171f21'; ctx.fillRect(31, 0, W - 62, H);
    ctx.fillStyle = '#232a29'; ctx.fillRect(48, 0, W - 96, H);
    ctx.fillStyle = '#343a36'; ctx.fillRect(54, 0, 2, H); ctx.fillRect(W - 56, 0, 2, H);
    ctx.strokeStyle = '#81745655'; ctx.lineWidth = 1; ctx.setLineDash([12, 18]); ctx.beginPath(); ctx.moveTo(W / 2, -12 + scroll % 30); ctx.lineTo(W / 2, H + 12); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const row = Math.floor((i * 76 + chaseProgress * .46) / 420), y = ((i * 76 + chaseProgress * .46) % 420) - 70;
      const leftX = i % 2 ? 4 : 15, rightX = W - 15 - (i % 2 ? 0 : 13), height = 48 + (i * 29 % 46), width = 40 + i % 3 * 13;
      drawChaseRuin(leftX, y, width, height, row + i, time);
      drawChaseRuin(rightX - width, y - 26, width, height + 19, row + i + 2, time);
    }
    // Collapsed paving, cracked slabs and snapped reinforcement are the driving hazards.
    chaseObstacles.forEach(o => {
      if (o.cleared) return;
      const y = CHASE_BIKE_Y - (o.at - chaseProgress) * .27;
      if (y < -48 || y > H + 48) return;
      drawChaseDebris(o, y, time);
      const distanceY = CHASE_BIKE_Y - y;
      if (distanceY > 18 && distanceY < 112) {
        const blink = Math.sin(time * 12 + o.at) > -.2;
        ctx.fillStyle = blink ? '#e1b76e' : '#855949'; ctx.beginPath(); ctx.moveTo(o.x, y + 24); ctx.lineTo(o.x - 5, y + 34); ctx.lineTo(o.x + 5, y + 34); ctx.closePath(); ctx.fill();
      }
    });
    drawTopdownMachine(tower, pose, time);
    drawChaseBike(chaser.x, CHASE_BIKE_Y, time);
    if (grappleAvailable) {
      const t = pose.target;
      ctx.strokeStyle = '#8be4b6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 18 + Math.sin(time * 12) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8be4b666'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(chaser.x, CHASE_BIKE_Y - 18); ctx.lineTo(t.x, t.y + 12); ctx.stroke(); ctx.setLineDash([]);
    }
    drawAtmosphere(time, 'chase');
    panel(10, 9, 107, 37, '#101a1deF', '#667a6e');
    ctx.textAlign = 'left'; ctx.fillStyle = '#a6b5a5'; ctx.font = '6px monospace'; ctx.fillText(`SOB A MÁQUINA · NÓ 0${activeTower + 1}`, 17, 21); ctx.fillStyle = '#df8d66'; ctx.fillText('INTEGRIDADE', 17, 38);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < chaseLives ? '#df8d66' : '#3a4140'; ctx.fillRect(75 + i * 11, 31, 8, 6); }
    panel(139, 9, 202, 37, '#101a1deF', '#667a6e');
    ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'center'; ctx.fillText('DISTÂNCIA DA MÁQUINA', 240, 21);
    ctx.fillStyle = '#283432'; ctx.fillRect(151, 28, 178, 5); ctx.fillStyle = chaseLag > 250 ? '#df795e' : '#80c9a9'; ctx.fillRect(151, 28, 178 * (1 - chaseLag / 390), 5);
    panel(W - 89, 9, 78, 37, '#101a1deF', '#667a6e'); ctx.textAlign = 'right'; ctx.fillStyle = '#a6b5a5'; ctx.fillText('MOTO', W - 18, 21); ctx.fillStyle = '#dfc68d'; ctx.fillText(`${Math.round(chaseSpeed)} KM/H`, W - 18, 38);
    ctx.textAlign = 'center'; ctx.fillStyle = '#bdc8b2'; ctx.fillText('SEGURE W PARA ACOMPANHAR · A/D DESVIA · S FREIA', W / 2, H - 9);
    if (grappleAvailable) { ctx.fillStyle = '#a8e6bd'; ctx.fillText('PERNA AO ALCANCE — APERTE E OU USE O BOTÃO DE RAPEL', W / 2, H - 22); }
  }

  function drawChaseRuin(x, y, w, h, seed, time) {
    ctx.fillStyle = '#0d1416aa'; ctx.fillRect(x + 4, y + 5, w, h);
    ctx.fillStyle = seed % 2 ? '#252d2c' : '#303632';
    ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x + w * .2, y); ctx.lineTo(x + w * .62, y + 3); ctx.lineTo(x + w, y + 12); ctx.lineTo(x + w - 3, y + h); ctx.lineTo(x + 7, y + h - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#101719'; ctx.fillRect(x + w * .28, y + h * .25, 8, h * .32); ctx.fillRect(x + w * .68, y + h * .16, 7, h * .23);
    ctx.fillStyle = '#76563f'; ctx.fillRect(x + w * .28, y + h * .25, 3, 4);
    ctx.strokeStyle = '#11191a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w * .57, y + 5); ctx.lineTo(x + w * .48, y + h * .35); ctx.lineTo(x + w * .66, y + h * .58); ctx.lineTo(x + w * .51, y + h - 4); ctx.stroke();
    ctx.fillStyle = '#8d9285'; for (let i = 0; i < 4; i++) { const px = x + ((seed * 13 + i * 17) % Math.max(1, w - 5)); const py = y + h - 4 + Math.sin(time + seed + i) * 2; ctx.fillRect(px, py, 3 + i % 2, 2); }
  }

  function drawChaseDebris(obstacle, y, time) {
    const x = obstacle.x;
    ctx.fillStyle = '#080e10a8'; ctx.beginPath(); ctx.ellipse(x + 3, y + 9, obstacle.kind === 'wall' ? 30 : 22, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (obstacle.kind === 'wall') {
      ctx.fillStyle = '#323936'; ctx.beginPath(); ctx.moveTo(x - 29, y - 9); ctx.lineTo(x - 17, y - 20); ctx.lineTo(x + 8, y - 16); ctx.lineTo(x + 27, y - 7); ctx.lineTo(x + 22, y + 10); ctx.lineTo(x - 18, y + 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#171f20'; ctx.fillRect(x - 5, y - 11, 8, 17); ctx.fillStyle = '#8c6044'; ctx.fillRect(x + 5, y - 18, 2, 12);
      ctx.strokeStyle = '#9c7650'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, y - 16); ctx.lineTo(x + 17, y - 27); ctx.lineTo(x + 21, y - 25); ctx.stroke();
    } else if (obstacle.kind === 'wreck') {
      ctx.fillStyle = '#151c1e'; ctx.beginPath(); ctx.moveTo(x - 23, y - 11); ctx.lineTo(x - 14, y - 18); ctx.lineTo(x + 17, y - 17); ctx.lineTo(x + 24, y - 7); ctx.lineTo(x + 18, y + 13); ctx.lineTo(x - 17, y + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4d5149'; ctx.fillRect(x - 12, y - 11, 25, 5); ctx.fillStyle = '#a15f46'; ctx.fillRect(x + 18, y - 4, 4, 4); ctx.fillStyle = '#080d0f'; ctx.fillRect(x - 22, y - 14, 8, 6); ctx.fillRect(x + 12, y + 8, 9, 6);
    } else {
      ctx.fillStyle = '#353a35'; ctx.beginPath(); ctx.moveTo(x - 21, y + 8); ctx.lineTo(x - 18, y - 9); ctx.lineTo(x - 2, y - 15); ctx.lineTo(x + 9, y - 7); ctx.lineTo(x + 22, y - 10); ctx.lineTo(x + 18, y + 11); ctx.lineTo(x + 1, y + 15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#171f20'; ctx.fillRect(x - 5, y - 7, 6, 15); ctx.fillStyle = '#747365'; ctx.fillRect(x - 15, y - 6, 7, 3);
      ctx.strokeStyle = '#a07b51'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 12, y - 11); ctx.lineTo(x + 25, y - 20); ctx.lineTo(x + 27, y - 16); ctx.stroke();
    }
    if (Math.sin(time * 8 + obstacle.at) > .65) { ctx.fillStyle = '#e6a65f'; ctx.fillRect(x - 2, y - 2, 3, 2); }
  }

  function drawTopdownMachine(tower, pose, time) {
    const shell = tower.design === 0 ? '#4c5a57' : tower.design === 1 ? '#61523f' : '#4e6072';
    const trim = tower.design === 0 ? '#88948a' : tower.design === 1 ? '#b38c59' : '#91a8bd';
    const core = tower.disabled ? '#78d4aa' : '#ed765b';
    pose.feet.forEach((foot, i) => {
      const hipX = foot.rootX, kneeX = (hipX + foot.x) * .5 + Math.sin(pose.phase + i) * 8, kneeY = (48 + foot.y) * .5;
      ctx.strokeStyle = '#091113'; ctx.lineWidth = 22; ctx.lineCap = 'square'; ctx.beginPath(); ctx.moveTo(hipX, 42); ctx.lineTo(kneeX, kneeY); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.strokeStyle = shell; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(hipX, 42); ctx.lineTo(kneeX, kneeY); ctx.lineTo(foot.x, foot.y); ctx.stroke();
      ctx.fillStyle = '#1b2528'; ctx.fillRect(kneeX - 9, kneeY - 9, 18, 18); ctx.fillStyle = trim; ctx.fillRect(kneeX - 4, kneeY - 4, 8, 8);
      if (foot.y > 146) { ctx.fillStyle = '#d75f5050'; ctx.beginPath(); ctx.ellipse(foot.x, CHASE_BIKE_Y, 42, 24, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#060c0e88'; ctx.beginPath(); ctx.ellipse(foot.x + 3, foot.y + 9, 32, 17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#101719'; ctx.fillRect(foot.x - 24, foot.y - 17, 48, 34); ctx.fillStyle = shell; ctx.fillRect(foot.x - 19, foot.y - 16, 38, 27);
      ctx.fillStyle = trim; ctx.fillRect(foot.x - 11, foot.y - 11, 4, 15); ctx.fillRect(foot.x + 8, foot.y - 11, 4, 15);
      if (foot.planted) { ctx.fillStyle = core; ctx.fillRect(foot.x - 5, foot.y + 10, 10, 3); }
    });
    const bx = pose.bodyX;
    ctx.fillStyle = '#080e10b0'; ctx.beginPath(); ctx.ellipse(bx + 5, 28, 211, 61, 0, 0, Math.PI * 2); ctx.fill();
    if (tower.design === 0) {
      ctx.fillStyle = '#111a1d'; ctx.beginPath(); ctx.moveTo(bx - 214, 6); ctx.lineTo(bx - 180, -24); ctx.lineTo(bx - 83, -33); ctx.lineTo(bx + 153, -29); ctx.lineTo(bx + 211, -3); ctx.lineTo(bx + 183, 58); ctx.lineTo(bx - 189, 61); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shell; ctx.beginPath(); ctx.moveTo(bx - 199, 4); ctx.lineTo(bx - 168, -17); ctx.lineTo(bx - 77, -26); ctx.lineTo(bx + 148, -22); ctx.lineTo(bx + 192, 1); ctx.lineTo(bx + 169, 49); ctx.lineTo(bx - 172, 52); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#243033'; ctx.fillRect(bx - 54, 2, 111, 31); ctx.fillStyle = core; ctx.fillRect(bx - 24, 11, 51, 7); ctx.fillStyle = trim; ctx.fillRect(bx - 154, 8, 4, 27); ctx.fillRect(bx + 137, 5, 4, 29);
    } else if (tower.design === 1) {
      ctx.fillStyle = '#101719'; ctx.fillRect(bx - 218, -16, 436, 78); ctx.fillStyle = shell; ctx.fillRect(bx - 204, -8, 408, 58);
      ctx.fillStyle = '#1c2629'; ctx.fillRect(bx - 169, 0, 338, 29); ctx.fillStyle = trim; ctx.fillRect(bx - 113, 7, 216, 4);
      ctx.fillStyle = core; ctx.fillRect(bx - 177, 37, 19, 6); ctx.fillRect(bx + 158, 37, 19, 6);
      for (let i = 0; i < 9; i++) { ctx.fillStyle = '#bc985f'; ctx.fillRect(bx - 79 + i * 19, 43, 9, 4); }
    } else if (tower.design === 2) {
      ctx.fillStyle = '#101719'; ctx.beginPath(); ctx.moveTo(bx - 181, 45); ctx.lineTo(bx - 156, -22); ctx.lineTo(bx - 47, -36); ctx.lineTo(bx + 121, -24); ctx.lineTo(bx + 216, 7); ctx.lineTo(bx + 151, 54); ctx.lineTo(bx - 133, 57); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shell; ctx.beginPath(); ctx.moveTo(bx - 167, 38); ctx.lineTo(bx - 143, -16); ctx.lineTo(bx - 42, -28); ctx.lineTo(bx + 112, -17); ctx.lineTo(bx + 194, 8); ctx.lineTo(bx + 137, 45); ctx.lineTo(bx - 124, 48); ctx.closePath(); ctx.fill();
      ctx.fillStyle = core; ctx.fillRect(bx + 74, 5, 67, 6); ctx.fillStyle = trim; ctx.fillRect(bx - 89, 6, 84, 3);
    } else if (tower.design === 3) {
      ctx.fillStyle=shell;ctx.beginPath();ctx.moveTo(bx-208,28);ctx.lineTo(bx-174,-22);ctx.lineTo(bx+142,-22);ctx.lineTo(bx+213,15);ctx.lineTo(bx+168,53);ctx.lineTo(bx-177,53);ctx.closePath();ctx.fill();
      ctx.fillStyle='#263236';ctx.fillRect(bx-91,-7,182,30);ctx.fillStyle=core;ctx.fillRect(bx-60,2,120,8);ctx.fillStyle=trim;ctx.fillRect(bx-190,17,37,5);ctx.fillRect(bx+151,14,35,5);
      ctx.strokeStyle=trim;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(bx-126,-16);ctx.lineTo(bx-156,-43);ctx.moveTo(bx+126,-16);ctx.lineTo(bx+159,-43);ctx.stroke();
    } else {
      ctx.fillStyle=shell;ctx.fillRect(bx-213,-10,426,64);ctx.fillStyle='#263033';ctx.fillRect(bx-168,-23,336,42);ctx.fillStyle=core;ctx.fillRect(bx-122,-9,244,7);
      for(let i=0;i<8;i++){ctx.fillStyle=i%2?trim:'#242d2b';ctx.fillRect(bx-177+i*50,30,29,14);}
    }
    ctx.fillStyle = '#11191b'; ctx.fillRect(bx - 138, 52, 276, 20); ctx.fillStyle = shell; ctx.fillRect(bx - 119, 56, 238, 10);
    ctx.fillStyle = '#aeb7a4'; ctx.fillRect(bx - 50, 59, 100, 2);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = Math.sin(time * 2 + i + tower.phase) > .25 ? core : '#714b41'; ctx.fillRect(bx - 126 + i * 31, 70, 5, 3); }
  }

  function drawChaseBike(x, y, time) {
    ctx.fillStyle = '#070b0d99'; ctx.beginPath(); ctx.ellipse(x + 3, y + 9, 25, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(chaser.steer * .13); ctx.scale(1.55, 1.55);
    drawBike(0, 0, 0, chaseSpeed, time); drawPerson(0, 2, 0, time, true, true); ctx.restore();
    if (chaseSpeed > 165) { ctx.fillStyle = '#b88c58'; ctx.globalAlpha = .56; ctx.fillRect(x - 10, y + 25 + (time * 18) % 9, 2, 2); ctx.fillRect(x + 6, y + 29 + (time * 12) % 8, 2, 2); ctx.globalAlpha = 1; }
  }

  function drawGrappleView(time) {
    const tower = active(), aim = grappleMeter(time), pose = aim.pose;
    ctx.fillStyle = '#10171a'; ctx.fillRect(0, 0, W, H);
    const sky = ctx.createLinearGradient(0, 0, 0, 190); sky.addColorStop(0, '#202b30'); sky.addColorStop(1, '#11191d'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 190);
    drawAtmosphere(time, 'grapple');
    for (let i = 0; i < 7; i++) {
      const w = 45 + i % 3 * 25, h = 70 + i * 13, x = ((i * 89 - chaseProgress * .14) % 650 + 650) % 650 - 82;
      ctx.fillStyle = i % 2 ? '#202a2d' : '#293333'; ctx.beginPath(); ctx.moveTo(x, 190); ctx.lineTo(x + 3, 190 - h + 18); ctx.lineTo(x + w * .25, 190 - h + 4); ctx.lineTo(x + w * .32, 190 - h + 17); ctx.lineTo(x + w, 190 - h + 26); ctx.lineTo(x + w, 190); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#82634a'; for (let j = 0; j < 3; j++) if ((i + j) % 3 === 0) ctx.fillRect(x + 9 + j * 13, 190 - h + 35 + j * 14, 4, 5);
    }
    ctx.fillStyle = '#262e2c'; ctx.beginPath(); ctx.moveTo(135, 0); ctx.lineTo(345, 0); ctx.lineTo(476, H); ctx.lineTo(4, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#66705c66'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(135, 0); ctx.lineTo(64, H); ctx.moveTo(345, 0); ctx.lineTo(416, H); ctx.stroke();
    for (let y = 23; y < H; y += 27) { const row = (y + chaseProgress * .16) % H; ctx.strokeStyle = '#90805b26'; ctx.beginPath(); ctx.moveTo(180 - row * .35, row); ctx.lineTo(300 + row * .35, row); ctx.stroke(); }
    const targetX = W * .5 + (pose.target.x - chaser.x) * .52 + Math.sin(pose.phase) * 14;
    const targetY = 93 + (pose.target.y - CHASE_BIKE_Y) * .32;
    // Rear-view rider and bike silhouette establish the new isometric camera.
    ctx.fillStyle = '#070b0d'; ctx.beginPath(); ctx.ellipse(W * .5, 251, 25, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0e11'; ctx.fillRect(W * .5 - 8, 213, 16, 40); ctx.fillStyle = '#262d2e'; ctx.fillRect(W * .5 - 16, 217, 32, 21); ctx.fillStyle = '#5c5b51'; ctx.fillRect(W * .5 - 12, 219, 24, 4);
    ctx.fillStyle = '#b65f4b'; ctx.fillRect(W * .5 - 4, 244, 8, 3); ctx.fillStyle = '#8455b4'; ctx.fillRect(W * .5 - 15, 216, 30, 2);
    ctx.fillStyle = '#11181b'; ctx.fillRect(W * .5 - 11, 190, 22, 26); ctx.fillStyle = '#42534e'; ctx.fillRect(W * .5 - 9, 194, 18, 15);
    ctx.fillStyle = '#141a1d'; ctx.fillRect(W * .5 - 8, 177, 16, 14); ctx.fillStyle = '#d6c59d'; ctx.fillRect(W * .5 - 8, 177, 15, 4); ctx.fillStyle = '#9f70d2'; ctx.fillRect(W * .5 + 3, 182, 5, 4);
    // The hanging leg fills the forward view; the reticle and timing bar follow its motion.
    ctx.strokeStyle = '#0b1214'; ctx.lineWidth = 31; ctx.beginPath(); ctx.moveTo(targetX + 17, -20); ctx.lineTo(targetX - 10, 48); ctx.lineTo(targetX, targetY + 2); ctx.stroke();
    ctx.strokeStyle = tower.design === 1 ? '#756044' : tower.design === 2 ? '#586d80' : '#5b6962'; ctx.lineWidth = 21; ctx.beginPath(); ctx.moveTo(targetX + 17, -20); ctx.lineTo(targetX - 10, 48); ctx.lineTo(targetX, targetY + 2); ctx.stroke();
    ctx.fillStyle = '#141b1e'; ctx.fillRect(targetX - 24, targetY - 8, 48, 18); ctx.fillStyle = '#8a8e80'; ctx.fillRect(targetX - 18, targetY - 7, 36, 4);
    ctx.strokeStyle = aim.stable ? '#a4f1bd' : '#e1ac67'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, targetY, 11 + Math.sin(time * 18) * 2, 0, Math.PI * 2); ctx.stroke();
    const barX = 74, barY = 147, barW = 332;
    ctx.fillStyle = '#10191beF'; ctx.fillRect(barX - 9, barY - 24, barW + 18, 48); ctx.strokeStyle = '#65766d'; ctx.strokeRect(barX - 8.5, barY - 23.5, barW + 17, 47);
    ctx.fillStyle = '#667064'; ctx.textAlign = 'center'; ctx.font = '6px monospace'; ctx.fillText('CLIQUE QUANDO O RETÍCULO CRUZAR A FAIXA VERDE', W / 2, barY - 12);
    ctx.fillStyle = '#35433f'; ctx.fillRect(barX, barY, barW, 6);
    const bandW = 33, targetBarX = barX + aim.target * barW;
    ctx.fillStyle = aim.stable ? '#9be6b5' : '#578d73'; ctx.fillRect(targetBarX - bandW / 2, barY - 3, bandW, 12);
    const needleX = barX + aim.needle * barW; ctx.fillStyle = '#f1d18b'; ctx.fillRect(needleX - 2, barY - 8, 4, 22);
    ctx.fillStyle = '#e4e9dc'; ctx.textAlign = 'left'; ctx.fillText('MIRA', barX, barY + 20); ctx.textAlign = 'right'; ctx.fillText('RAPEL', barX + barW, barY + 20);
    panel(11, 10, 145, 27, '#101a1deF', '#667a6e'); ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'left'; ctx.fillText(`ALVO · NÓ 0${activeTower + 1}`, 18, 27);
  }

  function drawClimbBackground(time) {
    ctx.fillStyle = '#182729'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 10) for (let x = 0; x < W; x += 12) {
      ctx.fillStyle = (x + y) % 4 ? '#1c2b2c' : '#202f30'; ctx.fillRect(x, y, 11, 9);
    }
    ctx.fillStyle = '#263638'; ctx.fillRect(32, 20, 416, 226);
    ctx.fillStyle = '#101a1d'; ctx.fillRect(44, 28, 390, 211);
    ctx.fillStyle = '#2b393b'; ctx.fillRect(52, 35, 376, 197);
    // Deep-lit city windows far behind the giant's external framework.
    for (let i = 0; i < 18; i++) {
      const wx = 60 + (i * 47) % 355, wy = 46 + (i * 61) % 169;
      ctx.fillStyle = i % 4 === 0 ? '#9c7850' : '#435b58'; ctx.fillRect(wx, wy, 5, 9);
      ctx.fillStyle = '#182326'; ctx.fillRect(wx + 1, wy + 10, 3, 3);
    }
    // Huge load-bearing ribs frame the climb route on the machine's outer hull.
    ctx.strokeStyle = '#121e21'; ctx.lineWidth = 15; ctx.beginPath();
    ctx.moveTo(36, 243); ctx.lineTo(122, 22); ctx.moveTo(444, 243); ctx.lineTo(357, 22);
    ctx.moveTo(34, 65); ctx.lineTo(446, 65); ctx.moveTo(34, 202); ctx.lineTo(446, 202); ctx.stroke();
    ctx.strokeStyle = '#526560'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(39, 237); ctx.lineTo(125, 27); ctx.moveTo(441, 237); ctx.lineTo(354, 27);
    ctx.moveTo(38, 59); ctx.lineTo(442, 59); ctx.moveTo(38, 196); ctx.lineTo(442, 196); ctx.stroke();
    for (let x = 42; x < 448; x += 40) {
      ctx.fillStyle = '#364644'; ctx.fillRect(x, 25, 4, 218); ctx.fillStyle = '#647568'; ctx.fillRect(x + 1, 28, 1, 210);
    }
    for (let y = 44; y < 240; y += 40) {
      ctx.fillStyle = '#354442'; ctx.fillRect(36, y, 408, 4); ctx.fillStyle = '#596658'; ctx.fillRect(39, y, 402, 1);
    }
    // Distant concentric machine coils and vertical data conduits.
    ctx.strokeStyle = '#46605c'; ctx.lineWidth = 1;
    for (let r = 26; r < 108; r += 13) { ctx.beginPath(); ctx.arc(238, 126, r + Math.sin(time + r) * 2, 0, Math.PI * 2); ctx.stroke(); }
    for (let x = 72; x < 430; x += 71) {
      ctx.fillStyle = '#172222'; ctx.fillRect(x, 21, 7, 230); ctx.fillStyle = '#668171'; ctx.fillRect(x + 3, 21, 1, 230);
      const lightY = (time * 34 + x * 2) % 208 + 24; ctx.fillStyle = '#8ad2b4'; ctx.fillRect(x + 1, lightY, 4, 3);
    }
    ctx.fillStyle = '#1a2627'; ctx.fillRect(0, 246, W, 24); ctx.fillStyle = '#88907c'; ctx.fillRect(0, 245, W, 2);
    // Narrow climb rails join the ledges.
    ctx.fillStyle = '#82907a';
    [[91, 214, 8, 31], [165, 183, 8, 31], [236, 152, 8, 31], [309, 121, 8, 31], [384, 90, 8, 31]].forEach(([x, y, w, h]) => { ctx.fillRect(x, y, 2, h); ctx.fillRect(x + w, y, 2, h); for (let k = 0; k < h; k += 7) ctx.fillRect(x, y + k, w + 2, 2); });
    platforms.forEach((p, i) => {
      ctx.fillStyle = '#121d20'; ctx.fillRect(p.x, p.y, p.w, 9);
      ctx.fillStyle = i === climbCheckpoint ? '#82d5ae' : '#758171'; ctx.fillRect(p.x, p.y, p.w, 3);
      ctx.fillStyle = '#33413e'; ctx.fillRect(p.x + 5, p.y + 5, p.w - 10, 3);
      for (let x = p.x + 7; x < p.x + p.w - 4; x += 18) { ctx.fillStyle = '#b07856'; ctx.fillRect(x, p.y + 2, 2, 2); }
    });
    // Sweeping, live power arcs.
    const beamX = 66 + ((time * (activeTower >= 3 ? 105 : 78)) % 354);
    ctx.fillStyle = '#e7795b'; ctx.globalAlpha = .24 + .22 * Math.sin(time * 8);
    ctx.fillRect(beamX, 179, 35, 3); ctx.fillRect(430 - ((time * 54) % 300), 118, 27, 3); ctx.globalAlpha = 1;
    drawDrone(110 + Math.sin(time * .8) * 115, 137 + Math.sin(time * 1.6) * 13, time);
    // Apex terminal.
    ctx.fillStyle = '#101d20'; ctx.fillRect(404, 47, 56, 31);
    ctx.fillStyle = '#485b52'; ctx.fillRect(407, 50, 50, 24);
    ctx.fillStyle = '#8ce0b6'; ctx.fillRect(415, 55, 34, 4);
    ctx.fillStyle = '#172321'; ctx.fillRect(416, 62, 32, 7);
    ctx.fillStyle = '#cee9c5'; ctx.fillRect(429, 64, 6, 3);
  }
  function drawDrone(x, y, time) {
    ctx.fillStyle = '#0b1416'; ctx.fillRect(x - 12, y - 6, 25, 13);
    ctx.fillStyle = '#a35548'; ctx.fillRect(x - 8, y - 3, 16, 6);
    ctx.fillStyle = '#e38261'; ctx.fillRect(x - 3, y - 1, 6, 2);
    ctx.fillStyle = '#b27356'; ctx.fillRect(x - 16, y - 9, 7, 2); ctx.fillRect(x + 9, y - 9, 7, 2);
    ctx.fillStyle = '#c17c58'; ctx.fillRect(x - 15, y + 7, 5, 2); ctx.fillRect(x + 10, y + 7, 5, 2);
    ctx.fillStyle = Math.sin(time * 6) > 0 ? '#efbd73' : '#7d534b'; ctx.fillRect(x - 2, y + 5, 4, 3);
  }
  function drawClimber(time, dt) {
    ctx.fillStyle = '#0e181a'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(32, -10); ctx.transform(1, .10, -.12, .90, 0, 0);
    drawClimbBackground(time);
    // Small side-on character with animated legs and a cable pack.
    const blink = climber.invulnerable > 0 && Math.floor(time * 14) % 2;
    if (!blink) {
      const x = Math.round(climber.x), y = Math.round(climber.feet - 20);
      const step = climber.grounded ? Math.sin(time * 10) * 2 : -2;
      ctx.fillStyle = '#0d1719'; ctx.fillRect(x - 7, y - 1, 15, 21);
      ctx.fillStyle = '#705641'; ctx.fillRect(x + 5, y + 4, 5, 10); ctx.fillStyle = '#c2a071'; ctx.fillRect(x + 7, y + 6, 2, 3);
      ctx.fillStyle = '#314541'; ctx.fillRect(x - 5, y + 4, 11, 11);
      ctx.fillStyle = '#60766a'; ctx.fillRect(x - 5, y + 6, 2, 6); ctx.fillRect(x + 3, y + 5, 2, 4);
      ctx.fillStyle = '#d18d61'; ctx.fillRect(x - 3, y - 5, 8, 8);
      ctx.fillStyle = '#d9c18e'; ctx.fillRect(x - 4, y - 8, 10, 4); ctx.fillRect(x - 2, y - 10, 6, 2);
      ctx.fillStyle = '#7658a6'; ctx.fillRect(x + 3, y - 4, 3, 2);
      ctx.fillStyle = '#252522'; ctx.fillRect(x - 5, y + 14 + step, 4, 6); ctx.fillRect(x + 1, y + 14 - step, 4, 6);
      ctx.fillStyle = '#a4825e'; ctx.fillRect(x - 6, y + 19 + step, 5, 2); ctx.fillRect(x + 1, y + 19 - step, 5, 2);
      ctx.fillStyle = '#a77be4'; ctx.fillRect(x - 9, y + 7, 3, 2); ctx.fillRect(x + 7, y + 5, 3, 2);
    }
    ctx.restore(); drawAtmosphere(time, 'climb');
    if (state === 'hack') drawHack(time);
    drawClimbHud(time);
  }
  function drawClimbHud(time) {
    panel(11, 10, 151, 39, '#101a1deF', '#667a6e');
    ctx.textAlign = 'left'; ctx.fillStyle = '#a6b5a5'; ctx.font = '6px monospace'; ctx.fillText(`ESCALADA  ·  NÓ 0${activeTower + 1}`, 19, 22);
    ctx.fillStyle = '#d5b071'; ctx.fillText('INTEGRIDADE', 19, 38);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < climbLives ? '#df8d66' : '#3a4140'; ctx.fillRect(82 + i * 14, 31, 10, 7); }
    panel(W - 108, 10, 97, 24, '#101a1deF', '#667a6e');
    ctx.fillStyle = '#a6b5a5'; ctx.textAlign = 'right'; ctx.fillText('A/D MOVER  ·  W/ESPAÇO SALTAR', W - 18, 25);
    if (state !== 'hack') {
      ctx.fillStyle = '#b5c2aa'; ctx.textAlign = 'center'; ctx.font = '6px monospace';
      ctx.fillText(activeTower===3?'VENTO LATERAL — CONTRA-ESTERCE COM A/D':activeTower===4?'APOIOS MÓVEIS — ESPERE A PLATAFORMA SE APROXIMAR':'SUBA PELOS SUPORTES E EVITE AS DESCARGAS', W / 2, H - 8);
      if (climber.feet < 108 && climber.x > 390) hint('E  ACESSAR TERMINAL', W / 2, 39, time);
    }
  }
  function drawHack(time) {
    ctx.fillStyle = '#071012ce'; ctx.fillRect(0, 0, W, H);
    panel(67, 43, 346, 205, '#142324', '#81d4b1');
    ctx.textAlign = 'center'; ctx.fillStyle = '#9ddfc1'; ctx.font = '8px monospace';
    if (hackMode === 'question') {
      const question = networkQuestions[activeTower][hackStep];
      ctx.fillText('DIAGNÓSTICO · CONEXÃO DE REDES', W / 2, 62);
      ctx.fillStyle = '#82968b'; ctx.font = '6px monospace'; ctx.fillText(`PERGUNTA ${hackStep + 1} / ${networkQuestions[activeTower].length}`, W / 2, 76);
      ctx.fillStyle = '#e3e9db'; ctx.font = '7px monospace'; ctx.fillText(question.q, W / 2, 96);
      question.a.forEach((answer, i) => {
        const x = 107, y = 108 + i * 32;
        ctx.fillStyle = '#202f2e'; ctx.fillRect(x, y, 266, 26); ctx.strokeStyle = '#536d62'; ctx.strokeRect(x + .5, y + .5, 265, 25);
        ctx.fillStyle = '#d5b576'; ctx.font = '7px monospace'; ctx.textAlign = 'left'; ctx.fillText(`${i + 1}.`, x + 10, y + 16);
        ctx.fillStyle = '#dce5d8'; ctx.fillText(answer, x + 29, y + 16);
      });
      ctx.fillStyle = '#8fa59b'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('RESPONDA COM 1, 2, 3 OU TOQUE NA OPÇÃO', W / 2, 216);
    } else if (hackMode === 'connect') {
      const ys = [124,159,194], sourceNames = ['UPLINK','WAN','LAN'], portNames = ['BACKBONE','INTERNET','REDE LOCAL'];
      ctx.fillText('LIGUE OS CABOS ÀS PORTAS DA REDE', W / 2, 62);
      ctx.fillStyle = '#87998f'; ctx.font = '6px monospace'; ctx.fillText('SELECIONE O CABO À ESQUERDA E A PORTA À DIREITA', W / 2, 78);
      for (let i = 0; i < 3; i++) {
        const y = ys[i];
        ctx.fillStyle = cableConnected[i] ? '#264b3d' : connectSelected === i ? '#594b2d' : '#202c2c'; ctx.fillRect(89,y-12,118,24);
        ctx.fillStyle = '#151d1e'; ctx.fillRect(273,y-12,118,24);
        ctx.strokeStyle = cableConnected[i] ? '#86d5a9' : '#52645b'; ctx.strokeRect(89.5,y-11.5,117,23); ctx.strokeRect(273.5,y-11.5,117,23);
        ctx.fillStyle = cableColors[i]; ctx.fillRect(98,y-2,20,4); ctx.fillStyle = '#dce5d8'; ctx.font = '6px monospace'; ctx.textAlign = 'left'; ctx.fillText(sourceNames[i],124,y+2);
        ctx.fillStyle = '#dce5d8'; ctx.textAlign = 'center'; ctx.fillText(portNames[i],332,y+2);
        if (cableConnected[i]) {
          ctx.strokeStyle = cableColors[i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(207,y); ctx.lineTo(235,y); ctx.lineTo(250,ys[cableMatch[i]]); ctx.lineTo(273,ys[cableMatch[i]]); ctx.stroke();
          ctx.fillStyle = '#a4e4b6'; ctx.fillText('✓',247,ys[cableMatch[i]]-6);
        } else {
          ctx.strokeStyle = cableColors[i]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(208,y); ctx.lineTo(230,y); ctx.moveTo(251,y); ctx.lineTo(272,y); ctx.stroke();
        }
      }
      ctx.fillStyle = '#8fa59b'; ctx.font = '6px monospace'; ctx.textAlign = 'center'; ctx.fillText('TOQUE CABO E PORTA · TECLADO: NÚMERO DO CABO, DEPOIS DA PORTA', W / 2, 216);
    } else if (hackMode === 'cut') {
      const names = ['AMARELO','AZUL','VERMELHO'];
      ctx.fillText('ISOLAR CURTO-CIRCUITO', W / 2, 62);
      ctx.fillStyle = '#e2d5b4'; ctx.font = '7px monospace'; ctx.fillText(`SENSOR: CURTO NA LINHA ${cableCutAnswer + 1} · ${names[cableCutAnswer]}`, W / 2, 86);
      ctx.fillStyle = '#899b91'; ctx.font = '6px monospace'; ctx.fillText('CORTE APENAS O CABO DANIFICADO', W / 2, 103);
      for (let i=0;i<3;i++) {
        const x=103+i*91, y=136;
        ctx.fillStyle='#1c2928'; ctx.fillRect(x,y,80,58); ctx.strokeStyle='#536b61'; ctx.strokeRect(x+.5,y+.5,79,57);
        ctx.fillStyle=cableColors[i]; ctx.fillRect(x+12,y+25,56,7); ctx.fillStyle='#171e1e'; ctx.fillRect(x+33,y+23,14,11);
        ctx.fillStyle='#dce5d8'; ctx.font='6px monospace'; ctx.textAlign='center'; ctx.fillText(`${i+1} · ${names[i]}`,x+40,y+50);
        if(i===cableCutAnswer){ ctx.fillStyle='#f4c477'; ctx.fillRect(x+37,y+19,6,3); }
      }
      ctx.fillStyle='#8fa59b'; ctx.font='6px monospace'; ctx.fillText('TOQUE NO CABO OU PRESSIONE 1, 2 OU 3', W/2,216);
    } else if (hackMode === 'repair') {
      ctx.fillText('EMENDAR CABO ROMPIDO', W / 2, 62);
      ctx.fillStyle='#e2d5b4'; ctx.font='6px monospace'; ctx.fillText('A LINHA DE DADOS PRECISA DE UM CONDUTOR E ISOLAÇÃO', W/2,82);
      ctx.strokeStyle='#74b7ad'; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(112,119); ctx.lineTo(213,119); ctx.moveTo(268,119); ctx.lineTo(369,119); ctx.stroke();
      ctx.fillStyle='#df7257'; ctx.fillRect(211,112,5,14); ctx.fillRect(265,112,5,14);
      for(let i=0;i<3;i++){
        const x=103+i*91,y=143; ctx.fillStyle='#1c2928'; ctx.fillRect(x,y,80,52); ctx.strokeStyle='#536b61'; ctx.strokeRect(x+.5,y+.5,79,51);
        if(i===0){ctx.fillStyle='#242b29';ctx.fillRect(x+15,y+22,50,8);ctx.fillStyle='#85877d';ctx.fillRect(x+19,y+24,42,4);}
        else if(i===1){ctx.fillStyle='#a86f48';ctx.fillRect(x+14,y+21,52,10);ctx.fillStyle='#e0b570';ctx.fillRect(x+19,y+18,4,16);ctx.fillRect(x+57,y+18,4,16);ctx.fillStyle='#d6c08d';ctx.fillRect(x+24,y+24,32,4);}
        else{ctx.fillStyle='#277e88';ctx.fillRect(x+14,y+20,52,12);ctx.fillStyle='#7bc5bc';for(let k=0;k<5;k++)ctx.fillRect(x+20+k*9,y+23,4,6);}
        ctx.fillStyle='#dce5d8';ctx.font='5px monospace';ctx.textAlign='center';ctx.fillText(['FITA','EMENDA DE COBRE','PONTE ÓPTICA'][i],x+40,y+45);
      }
      ctx.fillStyle='#8fa59b';ctx.font='6px monospace';ctx.fillText('ESCOLHA A PEÇA E TOQUE PARA REPARAR',W/2,216);
    } else if (hackMode === 'sequence') {
      ctx.fillText('SEQUÊNCIA DE RELÉS',W/2,62);
      ctx.fillStyle='#d5ded2';ctx.font='6px monospace';ctx.fillText('REPRODUZA A ORDEM DE PULSOS ANOTADA NO PAINEL',W/2,83);
      ctx.fillStyle='#e3b64f';ctx.fillRect(111,111,258,31);
      ctx.fillStyle='#202a28';ctx.font='9px monospace';ctx.fillText('1  →  3  →  2  →  3',W/2,131);
      for(let i=0;i<3;i++){const x=124+i*91;ctx.fillStyle=i===sequenceIndex%3?'#263f37':'#1c2928';ctx.fillRect(x,163,68,41);ctx.strokeStyle=i===sequenceIndex%3?'#a9e2b7':'#536b61';ctx.strokeRect(x+.5,163.5,67,40);ctx.fillStyle=cableColors[i];ctx.fillRect(x+28,174,12,12);ctx.fillStyle='#e8e4d5';ctx.font='7px monospace';ctx.fillText(`${i+1}`,x+34,198);}
      ctx.fillStyle='#8fa59b';ctx.font='6px monospace';ctx.fillText(`ENTRADAS CORRETAS ${sequenceIndex}/4 · ERRO REINICIA`,W/2,216);
    } else {
      ctx.fillText('SINCRONIZAR PULSO DE REDE',W/2,62);
      ctx.fillStyle='#d5ded2';ctx.font='6px monospace';ctx.fillText(`ALVO DO SENSOR: RELÉ ${pulseTarget+1} · APERTE NA JANELA VERDE`,W/2,84);
      ctx.fillStyle='#1c2928';ctx.fillRect(108,113,264,24);ctx.fillStyle='#a4bf75';ctx.fillRect(219,113,42,24);
      const needle=110+((pulseClock*105)%260);ctx.fillStyle='#e37558';ctx.fillRect(needle,107,4,36);
      for(let i=0;i<3;i++){const x=124+i*91;ctx.fillStyle=i===pulseTarget?'#3b4831':'#1c2928';ctx.fillRect(x,163,68,41);ctx.strokeStyle=i===pulseTarget?'#c8d995':'#536b61';ctx.strokeRect(x+.5,163.5,67,40);ctx.fillStyle=cableColors[i];ctx.fillRect(x+28,174,12,12);ctx.fillStyle='#e8e4d5';ctx.font='7px monospace';ctx.fillText(`${i+1}`,x+34,198);}
      ctx.fillStyle='#8fa59b';ctx.font='6px monospace';ctx.fillText('APERTE O NÚMERO DO RELÉ ALVO QUANDO A BARRA CRUZAR A ZONA VERDE',W/2,216);
    }
    ctx.fillStyle = '#e2a070'; ctx.fillText(`TEMPO  ${Math.max(0, hackTime).toFixed(1)}s`, W / 2, 238);
  }
  function updateClimb(dt) {
    climbTime += dt; hazardCooldown = Math.max(0, hazardCooldown - dt); climber.invulnerable = Math.max(0, climber.invulnerable - dt);
    if (state === 'hack') {
      hackTime -= dt; pulseClock += dt;
      if (hackTime <= 0) { state = 'climb'; hackStep = 0; hackTime = 36; setToast('TEMPO ESGOTADO — REINICIE O DIAGNÓSTICO'); }
      return;
    }
    const left = keys.has('a') || keys.has('arrowleft'); const right = keys.has('d') || keys.has('arrowright');
    climber.x += ((right ? 1 : 0) - (left ? 1 : 0)) * 82 * dt;
    climber.x = Math.max(8, Math.min(470, climber.x));
    const previousFeet = climber.feet;
    climber.vy += 480 * dt; climber.feet += climber.vy * dt; climber.grounded = false;
    platforms.forEach((p,i) => { if(p.baseX===undefined)p.baseX=p.x; p.x=activeTower===4?p.baseX+Math.sin(climbTime*1.35+i*.8)*17:p.baseX; });
    if(activeTower===3) climber.x += Math.sin(climbTime*2.7)*13*dt;
    for (let i = platforms.length - 1; i >= 0; i--) {
      const p = platforms[i];
      if (climber.vy >= 0 && previousFeet <= p.y && climber.feet >= p.y && climber.x > p.x - 4 && climber.x < p.x + p.w + 4) {
        climber.feet = p.y; climber.vy = 0; climber.grounded = true;
        if (i > climbCheckpoint) { climbCheckpoint = i; setToast('PONTO DE APOIO ALCANÇADO', 1); }
        break;
      }
    }
    if (climber.feet > 248) {
      climber.feet = 245; climber.vy = 0; climber.grounded = true;
    }
    // A moving security drone and timed electric sweeps punish careless jumps.
    const droneX = 110 + Math.sin(climbTime * .8) * 115, droneY = 137 + Math.sin(climbTime * 1.6) * 13;
    const beamX = 66 + ((climbTime * (activeTower >= 3 ? 105 : 78)) % 354), secondBeam = 430 - ((climbTime * (activeTower === 4 ? 82 : 54)) % 300);
    const droneHit = Math.abs(climber.x - droneX) < 14 && Math.abs((climber.feet - 12) - droneY) < 12;
    const beamHit = Math.abs(climber.feet - 179) < 8 && climber.x > beamX - 4 && climber.x < beamX + 40;
    const beamHit2 = Math.abs(climber.feet - 118) < 8 && climber.x > secondBeam - 4 && climber.x < secondBeam + 32;
    if ((droneHit || beamHit || beamHit2) && hazardCooldown <= 0 && climber.invulnerable <= 0) {
      climbLives--; climber.invulnerable = 1.05; hazardCooldown = .75;
      if (climbLives <= 0) { climbLives = 2; climbCheckpoint = Math.max(0, climbCheckpoint - 1); climber.x = Math.max(25, platforms[climbCheckpoint].x + 12); climber.feet = platforms[climbCheckpoint].y; setToast('SOBRECARGA — RECUO AO APOIO ANTERIOR'); }
      else setToast('DESCARGA ELÉTRICA — CUIDADO COM OS ARCOS');
    }
  }

  function finishFrame(time, dt) {
    ctx.fillStyle = '#090f12'; ctx.fillRect(0, 0, W, H);
    if (state === 'title') { drawWorld(time, dt); }
    else if (state === 'drive') drawWorld(time, dt);
    else if (state === 'explore') drawExplore(time);
    else if (state === 'chase') drawChase(time);
    else if (state === 'grapple') drawGrappleView(time);
    else if (state === 'climb' || state === 'hack') drawClimber(time, dt);
    else if (state === 'ending') drawEnding(time);
    if (flash > 0) { ctx.fillStyle = `rgba(203,255,224,${Math.min(.55, flash * .45)})`; ctx.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 1.4); }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toast.classList.remove('visible'); }
    syncGrappleButton();
  }
  function drawEnding(time) {
    drawIsoMap(time); drawIsoDepthObjects(time, false);
    drawAtmosphere(time, 'world');
    ctx.fillStyle = '#081013c9'; ctx.fillRect(0, 0, W, H);
    panel(63, 48, 354, 177, '#142325', '#8ad7b5');
    ctx.fillStyle = '#8ad7b5'; ctx.textAlign = 'center'; ctx.font = '8px monospace'; ctx.fillText('SINAL RESTABELECIDO', W / 2, 77);
    ctx.fillStyle = '#e8e9d8'; ctx.font = '23px monospace'; ctx.fillText('VOCÊ NÃO ESTÁ SÓ.', W / 2, 116);
    ctx.fillStyle = '#b4c4b5'; ctx.font = '8px monospace'; ctx.fillText('Uma frequência cruza a noite. Depois outra.', W / 2, 145);
    ctx.fillText('O mundo começa a responder.', W / 2, 160);
    ctx.fillStyle = '#d8b477'; ctx.fillText('ENTER  ·  VOLTAR AO INÍCIO', W / 2, 197);
    for (let i = 0; i < 16; i++) { const x = 125 + i * 15; ctx.fillStyle = Math.sin(time * 2 + i) > 0 ? '#72cbaa' : '#263635'; ctx.fillRect(x, 176 + Math.sin(time * 3 + i) * 3, 5, 2); }
  }

  function frame(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min(.045, (now - lastTime) / 1000); lastTime = now;
    gameTime += dt;
    if (bikeInspectOpen && (state !== 'drive' || mounted || distance(player,bike)>120)) bikeInspectOpen=false;
    updateMachines(gameTime);
    hunger = Math.max(0, hunger - dt * .035); thirst = Math.max(0, thirst - dt * .06);
    if (state === 'explore') {
      const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      const nextX = Math.max(58, Math.min(408, explorer.x + dx * 82 * dt)), nextY = Math.max(95, Math.min(280, explorer.y + dy * 64 * dt));
      const hitsWall = (x,y) => interiorWalls.some(w => x+7>w.x && x-7<w.x+w.w && y+7>w.y && y-7<w.y+w.h);
      if (!hitsWall(nextX, explorer.y)) explorer.x = nextX;
      if (!hitsWall(explorer.x, nextY)) explorer.y = nextY;
      exploreStep += dt; explorer.invulnerable = Math.max(0, explorer.invulnerable - dt);
      const hazard = interiorHazards.find(h => Math.hypot(explorer.x - h.x, explorer.y - h.y) < (h.kind === 'gap' ? 18 : 16));
      if (hazard && explorer.invulnerable <= 0) {
        explorer.hp--; explorer.invulnerable = 1.3; explorer.x = 240; explorer.y = 145;
        setToast(hazard.kind === 'weak' ? 'O PISO CEDEU — DESVIE DAS PLACAS FENDIDAS' : hazard.kind === 'gap' ? 'SEM CHÃO! VOCÊ VOLTOU AO ÚLTIMO APOIO' : 'TETO DESABOU — PROCURE UM ABRIGO');
        if (explorer.hp <= 0) { state = 'drive'; player.x = worldReturn.x; player.y = worldReturn.y; mounted = false; explorer.hp = 3; setToast('VOCÊ ESCAPOU DA CONSTRUÇÃO POR POUCO.'); }
      }
    }
    if (state === 'drive' && !mounted) {
      const p = 98 * dt * (.55 + .45 * Math.min(hunger, thirst) / 100);
      const dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      if (dx || dy) {
        moveWorldEntity(player, dx * p, dy * p, 7); player.angle = Math.atan2(dx, -dy); walkCycle += dt * 12;
      }
      if (active() && Math.hypot(player.x - active().x, player.y - active().y) > 205 && !mounted) { /* the machine remains safely out of reach on foot */ }
      updateObjective();
    } else if (state === 'drive' && mounted) {
      const throttle = keys.has('w') || keys.has('arrowup');
      const reverse = keys.has('s') || keys.has('arrowdown');
      const turn = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      bikeCrashCooldown = Math.max(0,bikeCrashCooldown-dt);
      bikeWearClock += dt;
      if (Math.abs(bike.speed) > 12) {
        const wear = dt * .00055;
        Object.keys(bikeParts).forEach(part => bikeParts[part] = Math.max(0,bikeParts[part]-wear));
        bikeLife = Math.max(0,bikeLife-dt*.00038);
      }
      const motorFactor = .38 + .62 * bikeParts.motor / 100;
      if (throttle && fuel > 0 && bikeLife > 0) bike.speed += 190 * motorFactor * dt;
      else if (reverse && bikeLife > 0) bike.speed += (bike.speed > 0 ? -300 : -105 * motorFactor) * dt;
      else bike.speed += (bike.speed > 0 ? -75 : 75) * dt;
      const maxForward=150*(.65+.35*Math.min(hunger,thirst)/100)*(.62+.38*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100);
      bike.speed=Math.max(-48,Math.min(maxForward,bike.speed));
      if ((throttle || reverse) && Math.abs(bike.speed)>0) fuel=Math.max(0,fuel-dt*(reverse?.045:.11)*(1+(100-bikeParts.motor)/38));
      bike.angle += turn * dt * (.7 + Math.abs(bike.speed) / 115) * (.2 + .8*bikeParts.handlebar/100) * (.5 + .5*Math.min(bikeParts.frontTire,bikeParts.rearTire)/100) * (bike.speed<0?-1:1);
      const moved = moveWorldEntity(bike, Math.sin(bike.angle) * bike.speed * dt, -Math.cos(bike.angle) * bike.speed * dt, 12);
      const tower = active();
      if (tower && distance(bike, tower) < 155) { bike.speed *= .25; startChase(); }
      else if (!moved) {
        bike.speed *= .38;
        if (bike.speed > 24 && bikeCrashCooldown <= 0) { bikeLife=Math.max(0,bikeLife-8); const damaged=['frontTire','handlebar','rearTire'][Math.floor(Math.random()*3)]; bikeParts[damaged]=Math.max(0,bikeParts[damaged]-18); bikeCrashCooldown=1.1; setToast('IMPACTE! A MOTO E UMA PEÇA FORAM DANIFICADAS.'); }
      }
      if (bikeLife <= 0) { bike.speed=0; if (mounted) { mounted=false; player.x=bike.x+Math.cos(bike.angle)*18; player.y=bike.y+Math.sin(bike.angle)*18; setToast('MOTO QUEBROU — USE E AO LADO DELA COM UM KIT.'); } }
      totalRide += Math.abs(bike.speed) * dt; bike.wheel += Math.abs(bike.speed) * dt / 9;
      player.x = bike.x; player.y = bike.y; player.angle = bike.angle;
      updateObjective();
    } else if (state === 'chase' || state === 'grapple') updateChase(dt);
    else if (state === 'climb' || state === 'hack') updateClimb(dt);
    finishFrame(gameTime, dt);
    requestAnimationFrame(frame);
  }

  function drawTowerScene() { /* tower art is rendered from the top-down world and climbing scene */ }
  setObjective('Chegue à primeira máquina de moto.', 0);
  requestAnimationFrame(frame);
})();
