/* Dente 3D da página de resposta: a cada resposta o exame desce um corte no molar.
   Roda ao vivo com three.js e GSAP (o motor de animação do HyperFrames). Se o 3D
   falhar, a página fica com o desenho estático e o questionário funciona igual. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { gsap } from 'gsap';

const palco = document.getElementById('palco');
const caixa = document.getElementById('palco-3d');
const hudCamada = document.getElementById('hud-camada');
const hudProf = document.getElementById('hud-prof');
const regua = document.getElementById('regua');
const marcador = document.getElementById('regua-marcador');
const flash = document.getElementById('palco-flash');
const caixaRotulos = document.getElementById('palco-rotulos');
const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Forma do molar inferior, em milímetros (y para cima, colo do dente em y = 0) ---------- */
const EXP = 2.8;            // superelipse: seção quase quadrada, como a de um molar
const Y_ARO = 6.0;          // altura das cristas marginais
const Y_BASE = -3.4;        // fim do tronco da raiz (teto da furca)
const Y_RAIZ = -1.2;        // onde as raízes começam, escondidas dentro do tronco
const COMP_RAIZ = 12.8;     // do início das raízes até o ápice
const Y_CANAL = -2.6;       // onde os canais, vindos do assoalho da câmara, entram no eixo das raízes
const FURCA = 1.1;          // quanto a borda do tronco sobe entre as raízes
const APICE = Y_RAIZ - COMP_RAIZ;
const CUSPIDES = [[0.5, 0.45], [-0.5, 0.45], [0.5, -0.45], [-0.5, -0.45]];
const DOIS_PI = Math.PI * 2;

const limitar = (v, a, b) => Math.min(Math.max(v, a), b);

function dir(t) {
  const c = Math.cos(t), s = Math.sin(t), p = 2 / EXP;
  return [Math.sign(c) * Math.abs(c) ** p, Math.sign(s) * Math.abs(s) ** p];
}
function bojo(y) { return Math.sin(Math.PI * limitar(y / Y_ARO, 0, 1) ** 0.75); }
/* Abaixo do colo o tronco afina até a furca, e as raízes saem de dentro dele */
function semiX(y) {
  if (y >= 0) { const v = Math.min(y, Y_ARO); return 4.5 + bojo(v) + 0.35 * v / Y_ARO; }
  return 3.9 + 0.6 * limitar((y - Y_BASE) / -Y_BASE, 0, 1) ** 0.65;
}
function semiZ(y) {
  if (y >= 0) { const v = Math.min(y, Y_ARO); return 4.35 + 0.9 * bojo(v) + 0.25 * v / Y_ARO; }
  return 2.3 + 2.05 * limitar((y - Y_BASE) / -Y_BASE, 0, 1) ** 0.65;
}
/* Altura da face oclusal em coordenadas normalizadas: quatro cúspides, fossa central e sulcos */
function oclusal(px, pz) {
  let h = Y_ARO;
  for (const [cx, cz] of CUSPIDES) h += 1.55 * Math.exp(-((px - cx) ** 2 + (pz - cz) ** 2) / 0.085);
  h -= 0.6 * Math.exp(-(px * px + pz * pz) / 0.05);
  h -= 0.25 * Math.exp(-(pz * pz) / 0.012) * Math.max(0, 1 - Math.abs(px));
  h -= 0.18 * Math.exp(-(px * px) / 0.012) * Math.max(0, 1 - Math.abs(pz));
  return h;
}
const esmalte = y => limitar(y / 1.6, 0, 1) * 1.25 + Math.max(0, y - 3.5) * 0.3;
const camara = y => 1.6 + 0.8 * Math.sin(Math.PI * (y + 1.6) / 4);
function raiz(lado, u) {
  const f = u > 0.9 ? Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) : 1;
  return {
    y: Y_RAIZ - COMP_RAIZ * u,
    cx: lado * (2.3 + 1.2 * u - 0.9 * u * u) + 0.6 * u * u,
    rx: (1.9 - 1.3 * u ** 1.3) * f,
    rz: (3.4 - 2.5 * u ** 1.2) * f,
    rc: Math.max(0.12, 0.6 - 0.42 * u) * f
  };
}
const colo = t => 0.55 * dir(t)[0] ** 2 - 0.25;   // linha do colo, mais alta nas faces proximais
const uDe = y => limitar((Y_RAIZ - y) / COMP_RAIZ, 0, 1);
const U_CANAL = uDe(Y_CANAL);
const U_BASE = uDe(Y_BASE);
/* Centro e raio do canal numa altura: do orifício no assoalho da câmara até o eixo da raiz */
function canal(lado, h) {
  if (h >= Y_CANAL) {
    const r = raiz(lado, U_CANAL), s = limitar((-1.6 - h) / (-1.6 - Y_CANAL), 0, 1);
    return { x: lado * 1.2 + (r.cx - lado * 1.2) * s, rc: 0.6 + (r.rc - 0.6) * s };
  }
  const r = raiz(lado, uDe(h));
  return { x: r.cx, rc: r.rc };
}

const COR = {
  esmalte: new THREE.Color('#F4F4F1'),
  raiz: new THREE.Color('#D8C4A0'),
  dentina: new THREE.Color('#E5D3B2'),
  cemento: new THREE.Color('#C9B189'),
  polpa: new THREE.Color('#A65B56')
};

function geometria(pos, cor, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* Coroa e tronco numa superfície só: paredes, face oclusal e o teto da furca embaixo */
function malhaCoroa() {
  const NT = 112, NV = 46, NO = 30, pos = [], cor = [], idx = [], c = new THREE.Color();
  const ponto = (x, y, z, t) => {
    pos.push(x, y, z);
    c.copy(COR.raiz).lerp(COR.esmalte, limitar((y - colo(t) + 0.15) / 0.3, 0, 1));
    cor.push(c.r, c.g, c.b);
  };
  let linhas = 0;
  for (let j = 0; j <= NV; j++, linhas++) {
    for (let i = 0; i < NT; i++) {
      const t = (i / NT) * DOIS_PI, [ux, uz] = dir(t), y = Y_BASE + (j / NV) * (oclusal(ux, uz) - Y_BASE);
      const x = semiX(y) * ux;
      /* entre as raízes a borda do tronco sobe em arco: a entrada da furca */
      const arco = FURCA * Math.exp(-((x / 1.4) ** 2)) * limitar(1 - (y - Y_BASE) / 1.5, 0, 1);
      ponto(x, y + arco, semiZ(y) * uz, t);
    }
  }
  for (let k = 1; k < NO; k++, linhas++) {
    const s = 1 - k / NO;
    for (let i = 0; i < NT; i++) {
      const t = (i / NT) * DOIS_PI, [ux, uz] = dir(t);
      ponto(s * semiX(Y_ARO) * ux, oclusal(s * ux, s * uz), s * semiZ(Y_ARO) * uz, t);
    }
  }
  for (let j = 0; j < linhas - 1; j++) {
    for (let i = 0; i < NT; i++) {
      const a = j * NT + i, b = j * NT + (i + 1) % NT, d = a + NT, e = b + NT;
      idx.push(a, d, b, b, d, e);
    }
  }
  const topo = pos.length / 3;
  ponto(0, oclusal(0, 0), 0, 0);
  const ult = (linhas - 1) * NT;
  for (let i = 0; i < NT; i++) idx.push(ult + i, topo, ult + (i + 1) % NT);
  const fundo = pos.length / 3;
  ponto(0, Y_BASE + FURCA + 0.3, 0, 0);
  for (let i = 0; i < NT; i++) idx.push(fundo, i, (i + 1) % NT);
  return geometria(pos, cor, idx);
}

function malhaRaiz(lado) {
  const NT = 56, NU = 64, pos = [], cor = [], idx = [];
  for (let j = 0; j <= NU; j++) {
    const r = raiz(lado, j / NU);
    for (let i = 0; i < NT; i++) {
      const t = (i / NT) * DOIS_PI;
      pos.push(r.cx + r.rx * Math.cos(t), r.y, r.rz * Math.sin(t));
      cor.push(COR.raiz.r, COR.raiz.g, COR.raiz.b);
    }
  }
  for (let j = 0; j < NU; j++) {
    for (let i = 0; i < NT; i++) {
      const a = j * NT + i, b = j * NT + (i + 1) % NT, d = a + NT, e = b + NT;
      idx.push(a, b, d, b, e, d);
    }
  }
  return geometria(pos, cor, idx);
}

/* ---------- Cortes axiais: tampas desenhadas na altura do corte, com as mesmas medidas da malha ---------- */
function leque(n, cor, ordem) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 3), 3));
  const nr = new Float32Array((n + 1) * 3);
  for (let i = 0; i <= n; i++) nr[i * 3 + 1] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + (i + 1) % n, 1 + i);
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color: cor, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -ordem, polygonOffsetUnits: -ordem * 2
  }));
  m.renderOrder = ordem;
  m.frustumCulled = false;
  m.userData.n = n;
  m.visible = false;
  return m;
}
function laco(n) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const l = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  l.renderOrder = 9;
  l.frustumCulled = false;
  l.userData.n = n;
  l.visible = false;
  return l;
}
function moldar(obj, cx, cz, a, b, y, quadrada) {
  const n = obj.userData.n, p = obj.geometry.attributes.position, c = obj.isMesh ? 1 : 0;
  if (c) p.setXYZ(0, cx, y, cz);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * DOIS_PI, [ux, uz] = quadrada ? dir(t) : [Math.cos(t), Math.sin(t)];
    p.setXYZ(i + c, cx + a * ux, y, cz + b * uz);
  }
  p.needsUpdate = true;
  obj.visible = true;
}

/* ---------- Corte sagital do fim do questionário: o desenho clássico do dente ---------- */
function caminhoCoroa(dentro) {
  const pts = [];
  const topoE = dentro ? oclusal(-0.92, 0) - 1.5 : oclusal(-1, 0);
  const topoD = dentro ? oclusal(0.92, 0) - 1.5 : oclusal(1, 0);
  const x = y => semiX(y) - (dentro ? esmalte(y) : 0);
  for (let k = 0; k <= 16; k++) { const y = 0.3 + (topoE - 0.3) * k / 16; pts.push([-x(y), y]); }
  for (let k = 1; k < 40; k++) {
    const px = -1 + 2 * k / 40;
    pts.push(dentro ? [px * (semiX(Y_ARO) - 1.3), oclusal(px * 0.92, 0) - 1.5] : [px * semiX(Y_ARO), oclusal(px, 0)]);
  }
  for (let k = 16; k >= 0; k--) { const y = 0.3 + (topoD - 0.3) * k / 16; pts.push([x(y), y]); }
  return pts;
}
function caminhoInferior() {
  /* lateral do tronco até a furca, valendo a raiz quando ela já passou da parede do tronco */
  const lateral = (lado, y) => {
    let x = semiX(y);
    if (y <= Y_RAIZ) { const r = raiz(lado, uDe(y)); x = Math.max(x, lado * r.cx + r.rx); }
    return lado * x;
  };
  const pts = [], uRaiz = k => U_BASE + (1 - U_BASE) * k / 40;
  for (let k = 0; k <= 16; k++) { const y = 0.3 + (Y_BASE - 0.3) * k / 16; pts.push([lateral(1, y), y]); }
  for (let k = 1; k <= 40; k++) { const r = raiz(1, uRaiz(k)); pts.push([r.cx + r.rx, r.y]); }
  for (let k = 40; k >= 0; k--) { const r = raiz(1, uRaiz(k)); pts.push([r.cx - r.rx, r.y]); }
  const rd = raiz(1, U_BASE), rm = raiz(-1, U_BASE), x0 = rd.cx - rd.rx, x1 = rm.cx + rm.rx;
  for (let k = 1; k < 10; k++) { const s = k / 10; pts.push([x0 + (x1 - x0) * s, Y_BASE + Math.sin(Math.PI * s) * (FURCA + 0.3)]); }
  for (let k = 0; k <= 40; k++) { const r = raiz(-1, uRaiz(k)); pts.push([r.cx + r.rx, r.y]); }
  for (let k = 40; k >= 1; k--) { const r = raiz(-1, uRaiz(k)); pts.push([r.cx - r.rx, r.y]); }
  for (let k = 16; k >= 0; k--) { const y = 0.3 + (Y_BASE - 0.3) * k / 16; pts.push([lateral(-1, y), y]); }
  return pts;
}
function caminhoPolpa() {
  const pts = [], U = 0.97, uCanal = s => U_CANAL + (U - U_CANAL) * s;
  for (let k = 0; k <= 30; k++) { const r = raiz(-1, uCanal(1 - k / 30)); pts.push([r.cx - r.rc, r.y]); }
  for (let k = 0; k <= 12; k++) { const y = -1.6 + 4 * k / 12; pts.push([-camara(y), y]); }
  pts.push([-1.35, 3.4], [-1.05, 2.7], [0, 2.35], [1.05, 2.7], [1.35, 3.4]);
  for (let k = 12; k >= 0; k--) { const y = -1.6 + 4 * k / 12; pts.push([camara(y), y]); }
  for (let k = 0; k <= 30; k++) { const r = raiz(1, uCanal(k / 30)); pts.push([r.cx + r.rc, r.y]); }
  for (let k = 30; k >= 0; k--) { const r = raiz(1, uCanal(k / 30)); pts.push([r.cx - r.rc, r.y]); }
  pts.push([0.9, -1.45], [0, -1.3], [-0.9, -1.45]);
  for (let k = 0; k <= 30; k++) { const r = raiz(-1, uCanal(k / 30)); pts.push([r.cx + r.rc, r.y]); }
  return pts;
}
function forma(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}
function placa(pts, cor, z, ordem) {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(forma(pts)), new THREE.MeshStandardMaterial({
    color: cor, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -ordem, polygonOffsetUnits: -ordem * 2
  }));
  m.position.z = z;
  m.renderOrder = ordem;
  return m;
}

/* ---------- Roteiro do exame: um corte por pergunta, do esmalte ao ápice ---------- */
const CORTES = [null, 4.6, 3.0, 1.9, 0.8, -0.25, -1.4, -4.2, -6.0, -7.8, -9.6, -11.4, -13.2];
const NOMES = ['Superfície do esmalte', 'Esmalte', 'Cornos da polpa', 'Câmara pulpar', 'Câmara pulpar', 'Colo do dente',
  'Tronco da raiz', 'Raízes e canais', 'Canal radicular', 'Canal radicular', 'Terço médio da raiz', 'Terço apical', 'Ápice'];
const ENTRADA_CORTE = 4.95;   // primeira altura em que o corte é uma seção cheia (abaixo da fossa central)
const mm = v => v.toFixed(1).replace('.', ',') + ' mm';
/* Em aparelho lento cada quadro demora; sem isto o GSAP desacelera as transições em vez de terminá-las no tempo */
gsap.ticker.lagSmoothing(0);

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  caixa.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environmentIntensity = 0.75;
  const luzChave = new THREE.DirectionalLight(0xffffff, 2.2);
  luzChave.position.set(-30, 45, 35);
  const luzRecorte = new THREE.DirectionalLight(0xdfe7ea, 1.5);
  luzRecorte.position.set(30, 12, -40);
  cena.add(luzChave, luzRecorte);

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  const planoAxial = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
  const planoSagital = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000);
  const planoFantasma = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1000);   // guarda só o que fica acima do corte
  const planos = [planoAxial, planoSagital];

  const grupo = new THREE.Group();
  cena.add(grupo);
  const geoCoroa = malhaCoroa();
  geoCoroa.computeBoundingBox();
  const TOPO = geoCoroa.boundingBox.max.y;
  const COMPRIMENTO = TOPO - APICE;
  const matCoroa = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, side: THREE.DoubleSide, clippingPlanes: planos });
  const matRaiz = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, clearcoat: 0.12, side: THREE.DoubleSide, clippingPlanes: planos });
  const geoRaizes = [malhaRaiz(-1), malhaRaiz(1)];
  grupo.add(new THREE.Mesh(geoCoroa, matCoroa), new THREE.Mesh(geoRaizes[0], matRaiz), new THREE.Mesh(geoRaizes[1], matRaiz));

  /* O que já foi cortado continua como uma sombra translúcida, como numa radiografia,
     para mostrar em que altura do dente o corte está */
  const matFantasma = new THREE.MeshBasicMaterial({
    color: 0x9fb0b6, transparent: true, opacity: 0.09, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, clippingPlanes: [planoFantasma]
  });
  const fantasma = new THREE.Group();
  fantasma.add(new THREE.Mesh(geoCoroa, matFantasma), new THREE.Mesh(geoRaizes[0], matFantasma), new THREE.Mesh(geoRaizes[1], matFantasma));
  fantasma.children.forEach(m => { m.renderOrder = 20; });
  fantasma.visible = false;
  grupo.add(fantasma);

  const capas = new THREE.Group();
  grupo.add(capas);
  const capExt = leque(120, COR.esmalte, 1), capDent = leque(120, COR.dentina, 2), capPolpa = leque(120, COR.polpa, 3);
  const cornos = [0, 1, 2, 3].map(() => leque(32, COR.polpa, 3));
  const raizExt = [leque(64, COR.cemento, 1), leque(64, COR.cemento, 1)];
  const raizDent = [leque(64, COR.dentina, 2), leque(64, COR.dentina, 2)];
  const canais = [leque(40, COR.polpa, 3), leque(40, COR.polpa, 3)];
  const linhaExt = laco(120), linhaRaiz = [laco(64), laco(64)];
  capas.add(capExt, capDent, capPolpa, ...cornos, ...raizExt, ...raizDent, ...canais, linhaExt, ...linhaRaiz);
  const linhas = [linhaExt, ...linhaRaiz];

  const sagital = new THREE.Group();
  sagital.visible = false;
  sagital.add(
    placa(caminhoCoroa(false), COR.esmalte, 0.02, 1),
    placa([...caminhoCoroa(true), ...caminhoInferior()], COR.dentina, 0.04, 2),
    placa(caminhoPolpa(), COR.polpa, 0.06, 3)
  );
  const contornoSag = [...caminhoCoroa(false), ...caminhoInferior()].flatMap(([x, y]) => [x, y, 0.08]);
  const gContorno = new THREE.BufferGeometry();
  gContorno.setAttribute('position', new THREE.Float32BufferAttribute(contornoSag, 3));
  sagital.add(new THREE.LineLoop(gContorno, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 })));
  cena.add(sagital);


  const ROTULOS = [
    { txt: 'Esmalte', p: [-4.2, 5.2, 0.1], esq: true },
    { txt: 'Dentina', p: [-3.2, 1.5, 0.1], esq: true },
    { txt: 'Polpa', p: [0.6, 0.8, 0.1], esq: false },
    { txt: 'Canal', p: [raiz(1, 0.55).cx, raiz(1, 0.55).y, 0.1], esq: false },
    { txt: 'Ápice', p: [raiz(-1, 1).cx, APICE + 0.3, 0.1], esq: true }
  ].map(r => {
    const el = document.createElement('span');
    el.className = 'rotulo' + (r.esq ? ' esq' : '');
    el.textContent = r.txt;
    caixaRotulos.appendChild(el);
    return { el, esq: r.esq, v: new THREE.Vector3(...r.p) };
  });

  regua.style.setProperty('--mm', COMPRIMENTO.toFixed(2));
  regua.style.setProperty('--coroa', (TOPO / COMPRIMENTO * 100).toFixed(2) + '%');

  /* ---------- Estado animado ---------- */
  const cam = { tx: 0, ty: -3, tz: 0, r: 60, pol: 1.36, az: 0.55 };
  const corte = { ativo: false, h: ENTRADA_CORTE, sagital: false };
  const brilho = { v: 0.42 };
  const rot = { y: 0.6 };
  const prof = { v: 0 };
  let estado = null, ocioso = false, largura = 1, altura = 1;

  function distancia(alt, larg) {
    const tg = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max((alt / 2) / tg, (larg / 2) / (tg * camera.aspect));
  }
  function enquadrar(alt, larg, ty, pol, az, desvio) {
    const r = distancia(alt, larg);
    const d = 2 * r * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * desvio;
    return { tx: d * Math.cos(az), ty, tz: -d * Math.sin(az), r, pol, az };
  }
  /* A primeira pergunta mostra a superfície; da segunda à última o corte desce sem parar, do esmalte ao ápice */
  function profundidade(e) {
    if (e.i <= 0 || e.total <= 2) return { p: 0, h: null, nome: NOMES[0] };
    const f = 1 + (e.i - 1) * (CORTES.length - 2) / (e.total - 2);
    const a = Math.floor(f), b = Math.min(a + 1, CORTES.length - 1), s = f - a;
    return { p: f, h: CORTES[a] + (CORTES[b] - CORTES[a]) * s, nome: NOMES[Math.round(f)] };
  }
  function alvoDe(e) {
    const meio = (TOPO + APICE) / 2, largo = camera.aspect > 1;
    if (e.k === 'review') {
      return { cam: enquadrar(COMPRIMENTO + 7, 30, meio + 0.6, 1.47, 0, 0), corte: 'sagital', rot: 0, nome: 'Exame completo', legenda: 'Corte sagital' };
    }
    if (e.k !== 'q') {
      /* no celular o dente desce e vai para a esquerda, longe do texto do monitor e da régua */
      return { cam: enquadrar(COMPRIMENTO + 12, 15, meio + (largo ? 2.2 : 0.8), 1.36, 0.55, largo ? 0.15 : 0.07), corte: 'nenhum', rot: null,
        nome: e.k === 'done' ? 'Exame concluído' : 'Vista geral', legenda: 'Molar inferior, ' + mm(COMPRIMENTO) };
    }
    const { p, h, nome } = profundidade(e), rotacao = 0.35 + p * 0.21;
    if (h === null) return { cam: enquadrar(21, 23, TOPO - 1.6, 0.62, 0.5, 0), corte: 'nenhum', rot: rotacao, nome, prof: 0 };
    const tam = 25 - p * 0.45;
    return { cam: enquadrar(tam, tam, h + tam * 0.12, 1.06, 0.5, 0), corte: h, rot: rotacao, nome, prof: TOPO - h };
  }
  const perto = (atual, alvo) => alvo + Math.round((atual - alvo) / DOIS_PI) * DOIS_PI;
  const pulsar = forte => gsap.to(brilho, { v: forte ? 1 : 0.42, duration: forte ? 0.2 : 0.8, overwrite: true });

  function aplicarCorte(alvo, dur) {
    gsap.killTweensOf(corte);
    if (alvo.corte === 'sagital') {
      corte.ativo = false;
      corte.sagital = true;
      gsap.killTweensOf(rot);
      rot.y = perto(rot.y, 0);
      return;
    }
    corte.sagital = false;
    if (alvo.corte === 'nenhum') {
      if (corte.ativo && dur > 0) gsap.to(corte, { h: ENTRADA_CORTE, duration: dur * 0.6, ease: 'power2.in', onComplete: () => { corte.ativo = false; } });
      else corte.ativo = false;
      return;
    }
    if (!corte.ativo) { corte.ativo = true; corte.h = ENTRADA_CORTE; }
    pulsar(true);
    gsap.to(corte, { h: alvo.corte, duration: dur, ease: 'power2.inOut', onComplete: () => pulsar(false) });
  }

  function trocarHud(alvo, dur) {
    gsap.killTweensOf([hudCamada, prof]);
    if (dur > 0 && hudCamada.textContent !== alvo.nome) {
      gsap.timeline()
        .to(hudCamada, { opacity: 0, duration: 0.15 })
        .add(() => { hudCamada.textContent = alvo.nome; })
        .to(hudCamada, { opacity: 1, duration: 0.3 });
    } else {
      hudCamada.textContent = alvo.nome;
      hudCamada.style.opacity = 1;
    }
    if (alvo.prof === undefined) {
      hudProf.textContent = alvo.legenda;
      return;
    }
    marcador.style.top = (alvo.prof / COMPRIMENTO * 100).toFixed(2) + '%';
    gsap.to(prof, { v: alvo.prof, duration: dur, ease: 'power2.inOut', onUpdate: () => { hudProf.textContent = mm(prof.v) + ' de profundidade'; } });
    if (dur === 0) hudProf.textContent = mm(alvo.prof) + ' de profundidade';
  }

  function ir(e, imediato) {
    const anterior = estado;
    estado = e;
    const mesmo = anterior && anterior.k === e.k && anterior.i === e.i;
    const alvo = alvoDe(e);
    const dur = imediato || reduzir.matches || mesmo ? 0 : 1.15;
    palco.dataset.estado = e.k;
    trocarHud(alvo, dur);
    ocioso = e.k !== 'q' && e.k !== 'review' && !reduzir.matches;
    const trocaDePlano = corte.sagital !== (alvo.corte === 'sagital');
    if (trocaDePlano && dur > 0) {
      /* a troca do corte axial para o sagital fica escondida num clarão, como o disparo de um raio X */
      gsap.timeline()
        .to(flash, { opacity: 0.85, duration: 0.14, ease: 'power1.in' })
        .add(() => aplicarCorte(alvo, 0))
        .to(flash, { opacity: 0, duration: 0.6, ease: 'power2.out' });
    } else if (!mesmo) {
      aplicarCorte(alvo, dur);
    }
    if (alvo.rot !== null && alvo.corte !== 'sagital') {
      gsap.to(rot, { y: perto(rot.y, alvo.rot), duration: dur, ease: 'power3.inOut', overwrite: true });
    }
    gsap.to(cam, { ...alvo.cam, duration: dur, ease: 'power3.inOut', overwrite: true });
  }

  function atualizarCapas() {
    for (const o of capas.children) o.visible = false;
    if (!corte.ativo) return;
    const h = corte.h;
    if (h >= Y_BASE) {
      /* coroa ou tronco: superelipse; abaixo do início das raízes, a seção é a união do tronco com elas */
      const a = semiX(h), b = semiZ(h), e = h >= 0 ? Math.max(esmalte(h), 0.22) : 0.22;
      capExt.material.color.copy(h >= 0 ? COR.esmalte : COR.cemento);
      moldar(capExt, 0, 0, a, b, h, true);
      moldar(linhaExt, 0, 0, a, b, h + 0.01, true);
      moldar(capDent, 0, 0, a - e, b - e, h, true);
      if (h < Y_RAIZ) {
        linhaExt.visible = false;   // o contorno do tronco sozinho não descreve a união com as raízes
        [-1, 1].forEach((lado, k) => {
          const r = raiz(lado, uDe(h));
          moldar(raizExt[k], r.cx, 0, r.rx, r.rz, h, false);
          moldar(raizDent[k], r.cx, 0, Math.max(r.rx - 0.22, 0.05), Math.max(r.rz - 0.22, 0.05), h, false);
        });
      }
      if (h >= -1.6 && h <= 2.4) {
        const pa = camara(h);
        moldar(capPolpa, 0, 0, pa, pa * 0.86, h, true);
      } else if (h > 2.4 && h < 3.4) {
        const r = 0.55 * Math.sqrt(Math.max(0, 1 - (h - 2.4) ** 2));
        [[1.25, 1.05], [-1.25, 1.05], [1.25, -1.05], [-1.25, -1.05]].forEach(([x, z], k) => moldar(cornos[k], x, z, r, r, h, false));
      } else if (h < -1.6) {
        [-1, 1].forEach((lado, k) => {
          const c = canal(lado, h);
          moldar(canais[k], c.x, 0, c.rc, c.rc * 1.5, h, false);
        });
      }
    } else {
      const u = uDe(h);
      [-1, 1].forEach((lado, k) => {
        const r = raiz(lado, u);
        if (r.rx <= 0.01) return;
        moldar(raizExt[k], r.cx, 0, r.rx, r.rz, h, false);
        moldar(linhaRaiz[k], r.cx, 0, r.rx, r.rz, h + 0.01, false);
        moldar(raizDent[k], r.cx, 0, Math.max(r.rx - 0.22, 0.05), Math.max(r.rz - 0.22, 0.05), h, false);
        moldar(canais[k], r.cx, 0, r.rc, Math.min(r.rc * 1.6, r.rz * 0.6), h, false);
      });
    }
    for (const l of linhas) l.material.opacity = 0.25 + 0.55 * brilho.v;
  }

  function posicionarCamera() {
    const s = Math.sin(cam.pol);
    camera.position.set(cam.tx + cam.r * s * Math.sin(cam.az), cam.ty + cam.r * Math.cos(cam.pol), cam.tz + cam.r * s * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }
  const ponto = new THREE.Vector3();
  function posicionarRotulos() {
    if (!corte.sagital) return;
    for (const r of ROTULOS) {
      ponto.copy(r.v).project(camera);
      const x = (ponto.x + 1) / 2 * largura, y = (1 - ponto.y) / 2 * altura;
      r.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${r.esq ? 'calc(-100% + 3px)' : '-3px'}, -50%)`;
    }
  }

  const relogio = new THREE.Clock();
  let tempo = 0;
  function quadro() {
    const dt = Math.min(relogio.getDelta(), 0.05);
    tempo += dt;
    if (ocioso) rot.y += dt * 0.32;
    const balanco = reduzir.matches || ocioso || corte.sagital ? 0 : Math.sin(tempo * 0.7) * 0.05;
    grupo.rotation.y = rot.y + balanco;
    planoAxial.constant = corte.ativo ? corte.h : 1000;
    planoSagital.constant = corte.sagital ? 0 : 1000;
    planoFantasma.constant = -corte.h;
    fantasma.visible = corte.ativo;
    matFantasma.opacity = 0.07 + 0.05 * brilho.v;
    sagital.visible = corte.sagital;
    atualizarCapas();
    posicionarCamera();
    renderer.render(cena, camera);
    posicionarRotulos();
  }

  new ResizeObserver(() => {
    largura = Math.max(1, caixa.clientWidth);
    altura = Math.max(1, caixa.clientHeight);
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    if (estado) { gsap.killTweensOf(cam); Object.assign(cam, alvoDe(estado).cam); }
  }).observe(caixa);

  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : quadro));
  renderer.domElement.addEventListener('webglcontextlost', () => palco.classList.remove('pronto'));

  largura = Math.max(1, caixa.clientWidth);
  altura = Math.max(1, caixa.clientHeight);
  renderer.setSize(largura, altura, false);
  camera.aspect = largura / altura;
  camera.updateProjectionMatrix();
  ir(window.__denteEstado || { k: 'welcome', total: 13 }, true);
  renderer.setAnimationLoop(quadro);
  palco.classList.add('pronto');
  window.dente = { ir: e => ir(e, false) };
} catch (erro) {
  console.warn('Dente 3D indisponível; a página segue com o desenho estático.', erro);
}
