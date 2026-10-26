/* Mapeamento facial da Dra. Brenda: a cada resposta entra mais uma camada do planejamento.
   Malha do rosto: rosto-dados.js (MediaPipe, Apache 2.0). Roda ao vivo com three.js e GSAP.
   Se algo falhar, a página segue sem o rosto e o questionário funciona igual. */
import * as THREE from 'three';
import { gsap } from 'gsap';
import { V, F } from './rosto-dados.js';

const palco = document.getElementById('palco');
const caixa = document.getElementById('palco-rosto');
const hudCamada = document.getElementById('hud-camada');
const hudProf = document.getElementById('hud-prof');
const regua = document.getElementById('regua');
const marcador = document.getElementById('regua-marcador');
const caixaRotulos = document.getElementById('palco-rotulos');
const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)');
gsap.ticker.lagSmoothing(0);

const N = V.length / 3;
const ativo = () => palco.dataset.mundo === 'rosto';

/* ---------- Referências do Face Mesh (mesma numeração dos 468 landmarks) ---------- */
const MEIO = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 2, 0, 17, 18, 200, 199, 175, 152];
const PONTE = [168, 6, 197, 195, 5, 4, 1];
const OLHO_D = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const OLHO_E = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const SOBR = [[46, 53, 52, 65, 55], [70, 63, 105, 66, 107], [276, 283, 282, 295, 285], [300, 293, 334, 296, 336]];
const LABIO_EXT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LABIO_INT = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
const MANDIBULA = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234];

const y = i => V[i * 3 + 1];
const Y_GLABELA = y(9), Y_SUBNASAL = y(2), Y_MENTO = y(152);
const Y_TRIQUIO = Y_GLABELA + (Y_GLABELA - Y_SUBNASAL);   // onde estaria a linha do cabelo num rosto com terços iguais
const ALTURA = Y_TRIQUIO - Y_MENTO;

/* Camadas do planejamento: nome, enquadramento e o que acende */
const CAMADAS = [
  { nome: 'Mapeamento facial', vista: 'frente', foco: 1.2, zoom: 1 },
  { nome: 'Linha média', vista: 'frente', foco: 1.2, zoom: 1 },
  { nome: 'Terços faciais', vista: 'frente', foco: 1.2, zoom: 1 },
  { nome: 'Quintos faciais', vista: 'frente', foco: 2.4, zoom: 0.9 },
  { nome: 'Olhos e sobrancelhas', vista: 'frente', foco: 3.4, zoom: 0.6 },
  { nome: 'Nariz', vista: 'tres', foco: 0.6, zoom: 0.62 },
  { nome: 'Ângulo nasolabial', vista: 'perfil', foco: -1.8, zoom: 0.5 },
  { nome: 'Lábios', vista: 'frente', foco: -4.4, zoom: 0.48 },
  { nome: 'Maçãs do rosto', vista: 'tres', foco: 0.6, zoom: 0.8 },
  { nome: 'Contorno mandibular', vista: 'tres', foco: -5.2, zoom: 0.8 },
  { nome: 'Mento', vista: 'perfil', foco: -7.6, zoom: 0.55 },
  { nome: 'Perfil', vista: 'perfil', foco: -1.5, zoom: 0.95 },
  { nome: 'Planejamento completo', vista: 'tres', foco: 1.2, zoom: 1.05 }
];

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  caixa.appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  const luzChave = new THREE.DirectionalLight(0xfff4ea, 2.4);
  luzChave.position.set(-12, 16, 22);
  const luzRecorte = new THREE.DirectionalLight(0xffd9c8, 1.4);
  luzRecorte.position.set(18, 6, -10);
  cena.add(new THREE.AmbientLight(0xffffff, 0.35), luzChave, luzRecorte);

  const rosto = new THREE.Group();
  cena.add(rosto);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
  geo.setIndex(F);
  geo.computeVertexNormals();
  const normal = geo.attributes.normal;
  /* ponto levemente para fora da pele, para a linha não sumir dentro da superfície */
  const sobre = (i, d = 0.1) => new THREE.Vector3(V[i * 3] + normal.getX(i) * d, V[i * 3 + 1] + normal.getY(i) * d, V[i * 3 + 2] + normal.getZ(i) * d);

  /* Pele translúcida, como porcelana, e a malha bem fina por cima */
  const matPele = new THREE.MeshStandardMaterial({ color: 0xf1e4d8, roughness: 0.5, metalness: 0, transparent: true, opacity: 0 });
  rosto.add(new THREE.Mesh(geo, matPele));
  const matMalha = new THREE.LineBasicMaterial({ color: 0xf3ece5, transparent: true, opacity: 0, depthWrite: false });
  rosto.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), matMalha));

  /* Pontos do escaneamento: acendem por região, conforme a camada */
  const destaque = new Float32Array(N);
  const geoPontos = new THREE.BufferGeometry();
  const posPontos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const p = sobre(i, 0.06); posPontos.set([p.x, p.y, p.z], i * 3); }
  geoPontos.setAttribute('position', new THREE.BufferAttribute(posPontos, 3));
  geoPontos.setAttribute('destaque', new THREE.BufferAttribute(destaque, 1));
  const uPontos = {
    tamanho: { value: 2.2 * renderer.getPixelRatio() },
    cor: { value: new THREE.Color(0xe9d8c8) },
    corDestaque: { value: new THREE.Color(0xffffff) },
    opacidade: { value: 1 },
    varredura: { value: 20 }
  };
  const matPontos = new THREE.ShaderMaterial({
    uniforms: uPontos, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float destaque; uniform float tamanho; uniform float varredura; varying float vD; varying float vV;
      void main() {
        vD = destaque;
        vV = smoothstep(varredura - 1.2, varredura, position.y);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = tamanho * (1.0 + destaque * 0.8) * (40.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 cor; uniform vec3 corDestaque; uniform float opacidade; varying float vD; varying float vV;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.3, d) * opacidade * vV * (0.5 + 0.5 * vD);
        gl_FragColor = vec4(mix(cor, corDestaque, vD), a);
      }`
  });
  rosto.add(new THREE.Points(geoPontos, matPontos));

  /* ---------- Linhas do planejamento ---------- */
  function linha(pts, tracejada, fechar) {
    const g = new THREE.BufferGeometry().setFromPoints(fechar ? [...pts, pts[0]] : pts);
    const m = tracejada
      ? new THREE.LineDashedMaterial({ color: 0xf7efe8, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0, depthWrite: false })
      : new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const l = new THREE.Line(g, m);
    if (tracejada) l.computeLineDistances();
    l.renderOrder = 5;
    return l;
  }
  const naPele = (lista, fechar) => linha(lista.map(i => sobre(i)), false, fechar);
  const Z = 6.4;   // plano das linhas de guia, à frente do rosto
  const horizontal = (yy, meia = 9.5, z = Z) => linha([new THREE.Vector3(-meia, yy, z), new THREE.Vector3(meia, yy, z)], true);
  const vertical = (x, y1, y2, z = Z) => linha([new THREE.Vector3(x, y1, z), new THREE.Vector3(x, y2, z)], true);

  const meio = MEIO.filter(i => Math.abs(V[i * 3]) < 0.01);
  const grupos = CAMADAS.map(() => new THREE.Group());
  grupos[1].add(naPele(meio), vertical(0, Y_TRIQUIO, Y_GLABELA + 0.4, 4.6), vertical(0, Y_MENTO - 0.2, Y_MENTO - 1.4, 4.3));
  grupos[2].add(horizontal(Y_TRIQUIO), horizontal(Y_GLABELA), horizontal(Y_SUBNASAL), horizontal(Y_MENTO));
  grupos[3].add(...[234, 33, 133, 362, 263, 454].map(i => vertical(V[i * 3], 6.2, -1.2)));
  grupos[4].add(naPele(OLHO_D, true), naPele(OLHO_E, true), ...SOBR.map(s => naPele(s)));
  grupos[5].add(naPele(PONTE), linha([sobre(2).add(new THREE.Vector3(-2, 0, -0.6)), sobre(2).add(new THREE.Vector3(2, 0, -0.6))], true));
  grupos[6].add(linha([sobre(1, 0.2), sobre(2, 0.2), sobre(0, 0.2)], false));
  grupos[7].add(naPele(LABIO_EXT, true), naPele(LABIO_INT, true));
  for (const i of [116, 345]) {
    const c = sobre(i, 0.4), pts = [];
    for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * 1.3, c.y + Math.sin(a) * 1.0, c.z + Math.cos(a) * (i === 116 ? -0.6 : 0.6))); }
    grupos[8].add(linha(pts, true));
  }
  grupos[9].add(naPele(MANDIBULA));
  const pogonio = [...Array(N).keys()].filter(i => y(i) < -7).reduce((a, b) => (V[b * 3 + 2] > V[a * 3 + 2] ? b : a));
  grupos[10].add(linha([sobre(pogonio, 0.2).add(new THREE.Vector3(0, 2.2, 0)), sobre(pogonio, 0.2).add(new THREE.Vector3(0, -2, 0))], true));
  const ponta = sobre(1, 0.2), queixo = sobre(pogonio, 0.2), dirE = queixo.clone().sub(ponta).normalize();
  grupos[11].add(linha([ponta.clone().sub(dirE.clone().multiplyScalar(2)), queixo.clone().add(dirE.clone().multiplyScalar(2))], true));
  for (const g of grupos) rosto.add(g);

  /* Pontos que acendem em cada camada */
  const regiao = fn => { const s = new Set(); for (let i = 0; i < N; i++) if (fn(V[i * 3], y(i), V[i * 3 + 2])) s.add(i); return s; };
  const ACENDE = [
    new Set(),
    new Set(meio),
    regiao((x, yy) => Math.abs(yy - Y_GLABELA) < 0.5 || Math.abs(yy - Y_SUBNASAL) < 0.4 || yy < Y_MENTO + 0.6),
    new Set([234, 33, 133, 362, 263, 454]),
    new Set([...OLHO_D, ...OLHO_E, ...SOBR.flat()]),
    regiao((x, yy, z) => Math.abs(x) < 2.2 && yy > -2.4 && yy < 3.3 && z > 4.6),
    new Set([1, 2, 0]),
    new Set([...LABIO_EXT, ...LABIO_INT]),
    regiao((x, yy, z) => Math.abs(x) > 3.6 && Math.abs(x) < 7 && yy > -1.6 && yy < 2 && z > 0),
    new Set(MANDIBULA),
    regiao((x, yy) => yy < -7.2 && Math.abs(x) < 3),
    new Set([1, pogonio, 0, 17]),
    new Set()
  ];

  const ROTULOS = [
    { txt: 'Terços faciais', p: new THREE.Vector3(9.6, (Y_GLABELA + Y_SUBNASAL) / 2, Z), esq: false },
    { txt: 'Linha média', p: new THREE.Vector3(0, Y_GLABELA + 1.6, 5.3), esq: true },
    { txt: 'Olhos', p: sobre(33, 0.3), esq: true },
    { txt: 'Lábios', p: sobre(291, 0.3), esq: false },
    { txt: 'Contorno', p: sobre(172, 0.3), esq: true },
    { txt: 'Perfil', p: ponta.clone(), esq: false }
  ].map(r => {
    const el = document.createElement('span');
    el.className = 'rotulo rotulo-rosto' + (r.esq ? ' esq' : '');
    el.textContent = r.txt;
    caixaRotulos.appendChild(el);
    return { el, esq: r.esq, v: r.p };
  });

  /* ---------- Estado animado ---------- */
  const cam = { tx: 0, ty: 1.2, tz: 1.5, r: 60, az: 0, pol: Math.PI / 2 };
  const brilho = { pele: 0, malha: 0 };
  let estado = null, camadaAtual = -1, ocioso = false, largura = 1, altura = 1, revisao = false;
  const VISTA = { frente: 0, tres: 0.62, perfil: 1.42 };
  const MIRA_Z = { frente: 1.5, tres: 3.6, perfil: 5.2 };   // de lado, a câmera mira a frente do rosto, não o centro da cabeça

  function distancia(alt) {
    const tg = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    return Math.max((alt / 2) / tg, (alt * 0.62 / 2) / (tg * camera.aspect));
  }
  function camadaDe(e) {
    if (e.k === 'review') return { k: CAMADAS.length - 1, frac: 0 };
    if (e.k !== 'q') return { k: CAMADAS.length - 1, frac: 0 };
    if (e.i <= 1 || e.total <= 3) return { k: 0, frac: 0 };
    const f = (e.i - 1) * (CAMADAS.length - 1) / (e.total - 2);
    return { k: Math.min(CAMADAS.length - 1, Math.floor(f)), frac: f - Math.floor(f) };
  }
  function alvoDe(e) {
    const { k, frac } = camadaDe(e), c = CAMADAS[k];
    /* folga em cima para o nome da camada no monitor não cobrir a testa */
    const alt = (ALTURA + 8) * c.zoom;
    return { k, c, cam: { tx: 0, ty: c.foco + 1.1 * c.zoom, tz: MIRA_Z[c.vista], r: distancia(alt), az: VISTA[c.vista] + frac * 0.12 - 0.06, pol: Math.PI / 2 - 0.04 } };
  }

  function aplicarRegua() {
    regua.style.setProperty('--mm', ALTURA.toFixed(2));
    regua.style.setProperty('--t1', ((Y_TRIQUIO - Y_GLABELA) / ALTURA * 100).toFixed(2) + '%');
    regua.style.setProperty('--t2', ((Y_TRIQUIO - Y_SUBNASAL) / ALTURA * 100).toFixed(2) + '%');
  }
  function mostrarCamadas(k, dur) {
    grupos.forEach((g, j) => {
      const alvo = revisao || k === CAMADAS.length - 1 ? (j === 0 ? 0 : 0.75) : j === k ? 1 : j < k ? 0.22 : 0;
      g.children.forEach(l => gsap.to(l.material, { opacity: alvo, duration: dur, ease: 'power2.out', overwrite: true }));
    });
    const novo = new Float32Array(N);
    const fontes = revisao || k === CAMADAS.length - 1 ? ACENDE.slice(1, -1) : [ACENDE[k]];
    for (const s of fontes) for (const i of s) novo[i] = 1;
    const antigo = Float32Array.from(destaque), t = { v: 0 };
    gsap.to(t, {
      v: 1, duration: dur, ease: 'power2.out', overwrite: true,
      onUpdate: () => { for (let i = 0; i < N; i++) destaque[i] = antigo[i] + (novo[i] - antigo[i]) * t.v; geoPontos.attributes.destaque.needsUpdate = true; }
    });
    if (dur === 0) { destaque.set(novo); geoPontos.attributes.destaque.needsUpdate = true; }
  }

  function ir(e, imediato) {
    estado = e;
    const alvo = alvoDe(e), dur = imediato || reduzir.matches ? 0 : 1.1;
    revisao = e.k === 'review';
    ocioso = e.k !== 'q' && e.k !== 'review' && !reduzir.matches;
    if (!ativo()) return;
    aplicarRegua();
    const nome = e.k === 'review' ? 'Planejamento completo' : e.k === 'q' ? alvo.c.nome : (e.k === 'done' ? 'Planejamento concluído' : 'Planejamento facial');
    if (hudCamada.textContent !== nome) {
      gsap.killTweensOf(hudCamada);
      if (dur > 0) gsap.timeline().to(hudCamada, { opacity: 0, duration: 0.15 }).add(() => { hudCamada.textContent = nome; }).to(hudCamada, { opacity: 1, duration: 0.3 });
      else { hudCamada.textContent = nome; hudCamada.style.opacity = 1; }
    }
    hudProf.textContent = e.k === 'q' ? 'Camada ' + (alvo.k + 1) + ' de ' + CAMADAS.length + ' do planejamento' : e.k === 'review' ? 'Todas as camadas' : 'BS Method, planejamento facial';
    marcador.style.top = ((Y_TRIQUIO - alvo.c.foco) / ALTURA * 100).toFixed(2) + '%';
    if (alvo.k !== camadaAtual || imediato || revisao) mostrarCamadas(alvo.k, dur);
    camadaAtual = alvo.k;
    /* o escaneamento passa de cima para baixo na primeira vez que o rosto aparece */
    if (brilho.pele === 0) {
      uPontos.varredura.value = Y_TRIQUIO + 1;
      gsap.to(uPontos.varredura, { value: Y_MENTO - 2, duration: reduzir.matches ? 0 : 1.6, ease: 'power1.inOut' });
      gsap.to(brilho, { pele: 0.2, malha: 0.07, duration: reduzir.matches ? 0 : 1.6, delay: reduzir.matches ? 0 : 0.6 });
    }
    gsap.to(cam, { ...alvo.cam, duration: dur, ease: 'power3.inOut', overwrite: true });
    palco.classList.add('rosto-pronto');
  }

  const ponto = new THREE.Vector3();
  function posicionarRotulos() {
    for (const r of ROTULOS) {
      if (!revisao) continue;
      ponto.copy(r.v).applyMatrix4(rosto.matrixWorld).project(camera);
      const x = (ponto.x + 1) / 2 * largura, yy = (1 - ponto.y) / 2 * altura;
      r.el.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(${r.esq ? 'calc(-100% + 3px)' : '-3px'}, -50%)`;
    }
  }

  const relogio = new THREE.Clock();
  let tempo = 0;
  function quadro() {
    const dt = Math.min(relogio.getDelta(), 0.05);
    if (!ativo()) return;
    tempo += dt;
    /* parado, o rosto balança devagar de um lado para o outro (a malha é só a frente do rosto) */
    rosto.rotation.y = ocioso ? Math.sin(tempo * 0.45) * 0.55 : (reduzir.matches ? 0 : Math.sin(tempo * 0.6) * 0.03);
    matPele.opacity = brilho.pele;
    matMalha.opacity = brilho.malha;
    const s = Math.sin(cam.pol);
    camera.position.set(cam.tx + cam.r * s * Math.sin(cam.az), cam.ty + cam.r * Math.cos(cam.pol), cam.tz + cam.r * s * Math.cos(cam.az));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
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

  largura = Math.max(1, caixa.clientWidth);
  altura = Math.max(1, caixa.clientHeight);
  renderer.setSize(largura, altura, false);
  camera.aspect = largura / altura;
  camera.updateProjectionMatrix();
  renderer.setAnimationLoop(quadro);
  window.rosto = { ir: e => ir(e, false), ativar: e => ir(e, true) };
  if (window.__denteEstado) ir(window.__denteEstado, true);
} catch (erro) {
  console.warn('Rosto 3D indisponível; a página segue sem ele.', erro);
}
