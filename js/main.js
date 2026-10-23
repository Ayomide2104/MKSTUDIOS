const root = document.documentElement;
const hero = document.querySelector('.hero');
const sceneCanvas = document.querySelector('#glass-scene');
const intro = document.querySelector('#intro');
const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('#site-nav');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const controller = new AbortController();
const { signal } = controller;

let revealObserver;
let sectionObserver;
let lazySceneObserver;
let sceneCleanup;
let introTimer;
let parallaxFrame;
let pointerFrame;
let navigationFrame;
let disposed = false;
let latestPointer = { x: 0, y: 0 };
const pointerCleanups = [];

root.classList.add('js');

const copyrightYear = document.querySelector('#copyright-year');
if (copyrightYear) copyrightYear.textContent = String(new Date().getFullYear());

function setNavigation(open, restoreFocus = false) {
  if (!menuToggle || !siteNav) return;
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.querySelector('.menu-toggle__label').textContent = open ? 'Close' : 'Menu';
  siteNav.classList.toggle('is-open', open);
  siteNav.setAttribute('aria-hidden', String(!open));

  if (open) {
    if (navigationFrame !== undefined) cancelAnimationFrame(navigationFrame);
    navigationFrame = requestAnimationFrame(() => {
      navigationFrame = undefined;
      if (menuToggle.getAttribute('aria-expanded') === 'true') siteNav.querySelector('a')?.focus();
    });
  } else if (navigationFrame !== undefined) {
    cancelAnimationFrame(navigationFrame);
    navigationFrame = undefined;
  }
  if (!open && restoreFocus) menuToggle.focus();
}

if (menuToggle && siteNav) {
  const navLinks = [...siteNav.querySelectorAll('a[href^="#"]')];
  siteNav.setAttribute('aria-hidden', 'true');

  menuToggle.addEventListener('click', () => {
    setNavigation(menuToggle.getAttribute('aria-expanded') !== 'true');
  }, { signal });

  navLinks.forEach((link) => {
    link.addEventListener('click', () => setNavigation(false, true), { signal });
  });

  document.addEventListener('keydown', (event) => {
    if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setNavigation(false, true);
    } else if (event.key === 'Tab') {
      const focusables = [menuToggle, ...navLinks];
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === menuToggle) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        menuToggle.focus();
      }
    }
  }, { signal });

  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 761px)').matches && menuToggle.getAttribute('aria-expanded') === 'true') {
      setNavigation(false);
    }
  }, { passive: true, signal });
}

function revealPage() {
  if (introTimer !== undefined) window.clearTimeout(introTimer);
  intro?.classList.remove('is-active');
  intro?.classList.add('is-done');
  hero?.classList.add('is-revealed');
  try { window.sessionStorage.setItem('mkstudios-intro-seen', '1'); } catch { /* Storage may be disabled. */ }
}

function startIntroduction() {
  let alreadySeen = false;
  try { alreadySeen = window.sessionStorage.getItem('mkstudios-intro-seen') === '1'; } catch { /* Storage may be disabled. */ }
  if (!intro || motionPreference.matches || alreadySeen) {
    revealPage();
    return;
  }
  intro.classList.add('is-active');
  introTimer = window.setTimeout(revealPage, 1650);
  intro.querySelector('.intro__skip')?.addEventListener('click', revealPage, { once: true, signal });
}

function setupReveals() {
  const targets = [...document.querySelectorAll('.reveal')];
  if (!targets.length || motionPreference.matches || !('IntersectionObserver' in window)) {
    targets.forEach((element) => element.classList.add('is-visible'));
    root.classList.remove('motion-ready');
    return;
  }

  root.classList.add('motion-ready');
  try {
    revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((element, index) => {
      element.style.setProperty('--reveal-order', String(index % 4));
      revealObserver.observe(element);
    });
  } catch {
    revealObserver?.disconnect();
    targets.forEach((element) => element.classList.add('is-visible'));
    root.classList.remove('motion-ready');
  }
}

function setupActiveNavigation() {
  if (!siteNav || !('IntersectionObserver' in window)) return;
  const sections = [...siteNav.querySelectorAll('a[href^="#"]')]
    .map((link) => ({ link, section: document.querySelector(link.getAttribute('href')) }))
    .filter(({ section }) => section);
  const ratios = new Map(sections.map(({ section }) => [section, 0]));
  if (!sections.length) return;

  sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0));
    const current = [...ratios.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!current || current[1] === 0) return;
    sections.forEach(({ link, section }) => {
      if (section === current[0]) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }, { threshold: [0, 0.12, 0.3, 0.55], rootMargin: '-26% 0px -56% 0px' });

  sections.forEach(({ section }) => sectionObserver.observe(section));
}

function setupPointerInteractions() {
  if (motionPreference.matches || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const onPointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    latestPointer = {
      x: event.clientX / Math.max(1, window.innerWidth),
      y: event.clientY / Math.max(1, window.innerHeight),
    };
    if (pointerFrame !== undefined) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = undefined;
      hero?.style.setProperty('--light-x', `${(latestPointer.x * 100).toFixed(1)}%`);
      hero?.style.setProperty('--light-y', `${(latestPointer.y * 100).toFixed(1)}%`);
    });
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true, signal });

  document.querySelectorAll('.magnetic').forEach((element) => {
    const move = (event) => {
      if (event.pointerType !== 'mouse') return;
      const bounds = element.getBoundingClientRect();
      const dx = (event.clientX - bounds.left) / bounds.width - 0.5;
      const dy = (event.clientY - bounds.top) / bounds.height - 0.5;
      element.style.setProperty('--mag-x', `${(dx * 5).toFixed(1)}px`);
      element.style.setProperty('--mag-y', `${(dy * 4).toFixed(1)}px`);
    };
    const leave = () => {
      element.style.setProperty('--mag-x', '0px');
      element.style.setProperty('--mag-y', '0px');
    };
    element.addEventListener('pointermove', move, { passive: true, signal });
    element.addEventListener('pointerleave', leave, { passive: true, signal });
    pointerCleanups.push(() => {
      element.style.removeProperty('--mag-x');
      element.style.removeProperty('--mag-y');
    });
  });
}

function makeEnvironment(THREE) {
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = 1024;
  mapCanvas.height = 512;
  const context = mapCanvas.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, mapCanvas.height);
  sky.addColorStop(0, '#080a11');
  sky.addColorStop(0.42, '#1c2437');
  sky.addColorStop(0.59, '#080b12');
  sky.addColorStop(1, '#030407');
  context.fillStyle = sky;
  context.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

  const addGlow = (x, y, radius, tint, alpha) => {
    const glow = context.createRadialGradient(x, y, 1, x, y, radius);
    glow.addColorStop(0, `rgba(${tint}, ${alpha})`);
    glow.addColorStop(1, `rgba(${tint}, 0)`);
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };
  addGlow(520, 265, 280, '121, 151, 234', 0.43);
  addGlow(210, 235, 170, '172, 145, 220', 0.23);
  addGlow(830, 260, 190, '203, 170, 123', 0.15);

  const addSoftbox = (x, y, width, height, warm = false) => {
    context.save();
    context.shadowColor = warm ? 'rgba(229, 195, 151, .8)' : 'rgba(222, 233, 255, .9)';
    context.shadowBlur = 30;
    const fill = context.createLinearGradient(x, y, x + width, y + height);
    fill.addColorStop(0, warm ? 'rgba(225, 198, 158, .08)' : 'rgba(216, 229, 255, .1)');
    fill.addColorStop(0.5, warm ? 'rgba(244, 223, 188, .9)' : 'rgba(241, 246, 255, .95)');
    fill.addColorStop(1, warm ? 'rgba(231, 204, 163, .15)' : 'rgba(201, 218, 255, .1)');
    context.fillStyle = fill;
    context.fillRect(x, y, width, height);
    context.restore();
  };
  addSoftbox(90, 100, 38, 235);
  addSoftbox(365, 62, 26, 140);
  addSoftbox(681, 73, 46, 255);
  addSoftbox(910, 138, 19, 168, true);
  context.save();
  context.shadowColor = 'rgba(139, 166, 255, .75)';
  context.shadowBlur = 32;
  context.fillStyle = 'rgba(199, 215, 255, .48)';
  context.fillRect(0, 304, mapCanvas.width, 2);
  context.restore();

  const environment = new THREE.CanvasTexture(mapCanvas);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  environment.needsUpdate = true;
  return environment;
}

async function initializeGlassScene() {
  if (disposed || !hero || !sceneCanvas || motionPreference.matches) return;
  if (navigator.connection?.saveData && window.matchMedia('(max-width: 760px)').matches) return;

  let THREE;
  try {
    THREE = await import('three');
  } catch {
    return;
  }
  if (disposed || motionPreference.matches) return;

  let renderer;
  try {
    const compact = window.matchMedia('(max-width: 760px)').matches;
    renderer = new THREE.WebGLRenderer({
      canvas: sceneCanvas,
      alpha: false,
      antialias: !compact,
      powerPreference: 'low-power',
      depth: true,
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.15 : 1.55));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  } catch {
    return;
  }

  const scene = new THREE.Scene();
  const environment = makeEnvironment(THREE);
  scene.background = environment;
  scene.environment = environment;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const compact = window.matchMedia('(max-width: 760px)').matches;
  camera.position.set(compact ? 0 : 0, 0.12, compact ? 7.4 : 6.3);
  camera.lookAt(0, 0, 0);

  const sculptureGeometry = new THREE.TorusKnotGeometry(0.92, 0.235, compact ? 112 : 220, compact ? 14 : 24, 2, 3);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe0e6f3,
    metalness: 0.02,
    roughness: 0.055,
    transmission: 0.98,
    thickness: 1.55,
    ior: 1.47,
    clearcoat: 1,
    clearcoatRoughness: 0.055,
    envMapIntensity: 1.45,
    attenuationColor: new THREE.Color(0xa6b8eb),
    attenuationDistance: 3.6,
  });
  const sculpture = new THREE.Mesh(sculptureGeometry, glass);
  sculpture.position.set(compact ? 0.3 : 1.05, 0.05, 0);
  sculpture.scale.setScalar(compact ? 0.76 : 1.14);
  sculpture.rotation.set(0.32, -0.42, -0.28);
  scene.add(sculpture);

  const orbitGeometry = new THREE.TorusGeometry(1.47, 0.008, 8, compact ? 120 : 220);
  const orbitMaterial = new THREE.MeshStandardMaterial({ color: 0xc8d4ef, metalness: 0.86, roughness: 0.19, envMapIntensity: 1.7 });
  const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbit.position.copy(sculpture.position);
  orbit.scale.setScalar(compact ? 0.8 : 1.08);
  orbit.rotation.set(1.06, -0.36, 0.42);
  scene.add(orbit);

  const horizonGeometry = new THREE.PlaneGeometry(35, 35);
  const horizonMaterial = new THREE.MeshStandardMaterial({ color: 0x171b25, metalness: 0.68, roughness: 0.26, envMapIntensity: 0.85 });
  const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.set(0, -1.62, -1.2);
  scene.add(horizon);

  const keyLight = new THREE.DirectionalLight(0xe5edff, 2.2);
  keyLight.position.set(-2.5, 3.5, 4.5);
  scene.add(keyLight);
  const edgeLight = new THREE.PointLight(0x8da7ff, 26, 11, 2);
  edgeLight.position.set(3.2, 1.3, -1.4);
  scene.add(edgeLight);
  const warmLight = new THREE.PointLight(0xe0bd91, 8, 8, 2);
  warmLight.position.set(-3.4, 0.4, 1.1);
  scene.add(warmLight);

  let width = 0;
  let height = 0;
  const resize = () => {
    const bounds = hero.getBoundingClientRect();
    width = Math.max(1, Math.floor(bounds.width));
    height = Math.max(1, Math.floor(bounds.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  resize();

  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let sceneDisposed = false;
  const onScenePointerMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const bounds = hero.getBoundingClientRect();
    pointer.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointer.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
  };
  const onScenePointerLeave = () => { pointer.targetX = 0; pointer.targetY = 0; };
  hero.addEventListener('pointermove', onScenePointerMove, { passive: true, signal });
  hero.addEventListener('pointerleave', onScenePointerLeave, { passive: true, signal });

  const draw = (time) => {
    if (disposed || sceneDisposed || document.hidden || motionPreference.matches) return;
    const seconds = time * 0.001;
    pointer.x += (pointer.targetX - pointer.x) * 0.035;
    pointer.y += (pointer.targetY - pointer.y) * 0.035;
    sculpture.rotation.x = 0.32 + pointer.y * 0.18 + Math.sin(seconds * 0.3) * 0.045;
    sculpture.rotation.y = -0.42 + pointer.x * 0.24 + Math.sin(seconds * 0.22) * 0.055;
    sculpture.rotation.z = -0.28 + pointer.x * 0.045;
    orbit.rotation.y = 0.42 + pointer.x * 0.07;
    camera.position.x += (pointer.x * (compact ? 0.04 : 0.14) - camera.position.x) * 0.025;
    camera.position.y += ((0.12 - pointer.y * 0.08) - camera.position.y) * 0.025;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  };

  let sceneVisible = true;
  const updateLoop = () => {
    if (sceneDisposed) return;
    const shouldAnimate = sceneVisible && !document.hidden && !motionPreference.matches && !disposed;
    renderer.setAnimationLoop(shouldAnimate ? draw : null);
    if (!shouldAnimate && !disposed) renderer.render(scene, camera);
  };
  const visibilityObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(([entry]) => { sceneVisible = entry.isIntersecting; updateLoop(); }, { threshold: 0.01 })
    : null;
  visibilityObserver?.observe(hero);
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(hero);
  if (!resizeObserver) window.addEventListener('resize', resize, { passive: true, signal });
  document.addEventListener('visibilitychange', updateLoop, { signal });
  hero.classList.add('has-webgl');
  updateLoop();

  sceneCleanup = () => {
    if (sceneDisposed) return;
    sceneDisposed = true;
    renderer.setAnimationLoop(null);
    visibilityObserver?.disconnect();
    resizeObserver?.disconnect();
    sculptureGeometry.dispose();
    glass.dispose();
    orbitGeometry.dispose();
    orbitMaterial.dispose();
    horizonGeometry.dispose();
    horizonMaterial.dispose();
    environment.dispose();
    renderer.dispose();
    hero.classList.remove('has-webgl');
  };
  sceneCanvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    sceneCleanup?.();
  }, { signal });
}

function watchForHero() {
  if (motionPreference.matches || !hero || !sceneCanvas || disposed) return;
  if (!('IntersectionObserver' in window)) {
    void initializeGlassScene();
    return;
  }
  lazySceneObserver?.disconnect();
  lazySceneObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    lazySceneObserver.disconnect();
    void initializeGlassScene();
  }, { rootMargin: '120px 0px' });
  lazySceneObserver.observe(hero);
}

function updateParallax() {
  parallaxFrame = undefined;
  if (disposed || motionPreference.matches || !hero) return;
  const top = hero.getBoundingClientRect().top;
  const drift = Math.max(-18, Math.min(18, -top * 0.025));
  hero.style.setProperty('--scroll-drift', `${drift.toFixed(1)}px`);
}

function queueParallax() {
  if (parallaxFrame === undefined) parallaxFrame = requestAnimationFrame(updateParallax);
}

function handleMotionPreference() {
  if (!motionPreference.matches) return;
  revealPage();
  revealObserver?.disconnect();
  root.classList.remove('motion-ready');
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('is-visible'));
  if (parallaxFrame !== undefined) cancelAnimationFrame(parallaxFrame);
  if (pointerFrame !== undefined) cancelAnimationFrame(pointerFrame);
  if (navigationFrame !== undefined) cancelAnimationFrame(navigationFrame);
  window.removeEventListener('scroll', queueParallax);
  sceneCleanup?.();
  lazySceneObserver?.disconnect();
  hero?.style.removeProperty('--light-x');
  hero?.style.removeProperty('--light-y');
  hero?.style.removeProperty('--scroll-drift');
}

function cleanup() {
  disposed = true;
  if (introTimer !== undefined) window.clearTimeout(introTimer);
  if (parallaxFrame !== undefined) cancelAnimationFrame(parallaxFrame);
  if (pointerFrame !== undefined) cancelAnimationFrame(pointerFrame);
  controller.abort();
  revealObserver?.disconnect();
  sectionObserver?.disconnect();
  lazySceneObserver?.disconnect();
  sceneCleanup?.();
  window.removeEventListener('pagehide', cleanup);
  motionPreference.removeEventListener?.('change', handleMotionPreference);
  pointerCleanups.forEach((remove) => remove());
}

setupReveals();
setupActiveNavigation();
setupPointerInteractions();
startIntroduction();
watchForHero();
window.addEventListener('pagehide', cleanup, { once: true, signal });
motionPreference.addEventListener?.('change', handleMotionPreference, { signal });
window.addEventListener('scroll', queueParallax, { passive: true, signal });
queueParallax();
