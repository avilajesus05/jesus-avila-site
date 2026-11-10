import { drawScene } from './shape-renderer.js';

const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping } = window.Matter;
const canvas = document.querySelector('#shapes');
const surface = document.querySelector('.sculpture');
const ctx = canvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const WORLD = { width: 460, height: 300, floor: 258, left: 24, right: 436, top: 8 };
const STEP = 1000 / 120;
const MAX_SPEED = 19;
const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8, constraintIterations: 4 });
engine.gravity.y = .95;
const common = { restitution: .48, friction: .3, frictionStatic: .65, frictionAir: .009, sleepThreshold: 55, slop: .03 };
const shapes = [
  Bodies.circle(103, 74, 30, { ...common, label: 'Esfera', plugin: { kind: 'circle', tone: 'violet' } }),
  Bodies.rectangle(178, 128, 57, 57, { ...common, angle: .19, chamfer: { radius: 3 }, label: 'Cuadrado', plugin: { kind: 'square', tone: 'silver' } }),
  Bodies.polygon(265, 63, 3, 39, { ...common, angle: -.2, chamfer: { radius: 2 }, label: 'Triángulo', plugin: { kind: 'triangle', tone: 'copper' } }),
  Bodies.polygon(342, 118, 6, 33, { ...common, angle: .26, chamfer: { radius: 2 }, label: 'Hexágono', plugin: { kind: 'hexagon', tone: 'violet' } }),
  Bodies.rectangle(181, 42, 36, 36, { ...common, angle: Math.PI / 4, chamfer: { radius: 2 }, label: 'Rombo', plugin: { kind: 'diamond', tone: 'copper' } }),
  Bodies.circle(266, 162, 21, { ...common, label: 'Esfera pequeña', plugin: { kind: 'circle', tone: 'silver' } }),
];
const startingPoses = shapes.map(body => ({ ...body.position, angle: body.angle }));
const wall = { isStatic: true, friction: .5, restitution: .2 };
Composite.add(engine.world, [
  ...shapes,
  Bodies.rectangle(230, WORLD.floor + 60, 700, 120, wall),
  Bodies.rectangle(WORLD.left - 60, 150, 120, 600, wall),
  Bodies.rectangle(WORLD.right + 60, 150, 120, 600, wall),
  Bodies.rectangle(230, WORLD.top - 60, 700, 120, wall),
]);

let frame = 0, previous = 0, accumulator = 0, hovered = null, drag = null, generation = 0;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function render() {
  drawScene(ctx, shapes, { ...WORLD, selected: drag?.body ?? null, hovered });
}

function resize() {
  const rect = surface.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / WORLD.width, 0, 0, canvas.height / WORLD.height, 0, 0);
  // Keep the same logical world and body poses through responsive resizing.
  render();
}

function keepContained(body) {
  let dx = 0, dy = 0;
  if (body.bounds.min.x < WORLD.left) dx = WORLD.left - body.bounds.min.x;
  else if (body.bounds.max.x > WORLD.right) dx = WORLD.right - body.bounds.max.x;
  if (body.bounds.min.y < WORLD.top) dy = WORLD.top - body.bounds.min.y;
  else if (body.bounds.max.y > WORLD.floor) dy = WORLD.floor - body.bounds.max.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    Body.translate(body, { x: dx, y: dy });
    Body.setVelocity(body, { x: dx ? -body.velocity.x * .25 : body.velocity.x, y: dy ? -body.velocity.y * .25 : body.velocity.y });
  }
}

function advance() {
  for (const body of shapes) {
    const speed = Body.getSpeed(body);
    if (speed > MAX_SPEED) Body.setVelocity(body, { x: body.velocity.x / speed * MAX_SPEED, y: body.velocity.y / speed * MAX_SPEED });
    if (Math.abs(body.angularVelocity) > .32) Body.setAngularVelocity(body, Math.sign(body.angularVelocity) * .32);
  }
  Engine.update(engine, STEP);
  for (const body of shapes) keepContained(body);
}

function settle() {
  for (const body of shapes) Sleeping.set(body, false);
  for (let i = 0; i < 420; i++) advance();
  for (const body of shapes) { Body.setVelocity(body, { x: 0, y: 0 }); Body.setAngularVelocity(body, 0); Sleeping.set(body, true); }
}

function tick(now) {
  frame = 0;
  if (document.hidden || motion.matches) return;
  accumulator += previous ? Math.min(now - previous, 50) : STEP;
  previous = now;
  while (accumulator >= STEP) { advance(); accumulator -= STEP; }
  render();
  if (drag || shapes.some(body => !body.isSleeping)) frame = requestAnimationFrame(tick);
  else { previous = 0; accumulator = 0; }
}

function schedule() {
  if (!frame && !document.hidden && !motion.matches) {
    previous = 0; accumulator = 0;
    frame = requestAnimationFrame(tick);
  }
}

function position(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width * WORLD.width, WORLD.left + 2, WORLD.right - 2),
    y: clamp((event.clientY - rect.top) / rect.height * WORLD.height, WORLD.top + 2, WORLD.floor - 2),
  };
}

function hit(point) {
  return Query.point(shapes, point).at(-1) ?? null;
}

function remember(point, time) {
  drag.samples.push({ ...point, time });
  drag.samples = drag.samples.filter(sample => time - sample.time < 100).slice(-6);
}

surface.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || drag) return;
  const point = position(event), body = hit(point);
  if (!body) return;
  event.preventDefault();
  surface.focus({ preventScroll: true });
  Sleeping.set(body, false);
  const offset = { x: point.x - body.position.x, y: point.y - body.position.y };
  const joint = motion.matches ? null : Constraint.create({
    pointA: point, bodyB: body, pointB: offset, length: 0, stiffness: .28, damping: .14,
  });
  if (joint) Composite.add(engine.world, joint);
  drag = { body, joint, offset, pointerId: event.pointerId, samples: [] };
  remember(point, event.timeStamp);
  surface.setPointerCapture(event.pointerId);
  surface.dataset.dragging = 'true';
  hovered = body;
  schedule(); render();
});

surface.addEventListener('pointermove', event => {
  if (drag && event.pointerId !== drag.pointerId) return;
  const point = position(event);
  if (drag) {
    remember(point, event.timeStamp);
    if (drag.joint) drag.joint.pointA = point;
    else {
      // Reduced-motion dragging is direct, without a trailing spring animation.
      Body.setPosition(drag.body, { x: point.x - drag.offset.x, y: point.y - drag.offset.y });
      Body.setVelocity(drag.body, { x: 0, y: 0 });
      Body.setAngularVelocity(drag.body, 0);
      keepContained(drag.body);
      render();
    }
  } else {
    const next = hit(point);
    if (hovered !== next) { hovered = next; surface.dataset.hover = String(!!hovered); render(); }
  }
});

function release(event, throwBody = false) {
  if (!drag || (event?.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
  const finished = drag;
  drag = null;
  if (finished.joint) Composite.remove(engine.world, finished.joint);
  surface.dataset.dragging = 'false';
  if (surface.hasPointerCapture(finished.pointerId)) surface.releasePointerCapture(finished.pointerId);
  if (throwBody && !motion.matches) {
    const samples = finished.samples;
    const first = samples[0], last = samples.at(-1);
    const recent = last && event.timeStamp - last.time < 100;
    let vx = 0, vy = 0;
    if (recent && samples.length > 1) {
      const dt = Math.max(16, last.time - first.time);
      vx = (last.x - first.x) / dt * (1000 / 60);
      vy = (last.y - first.y) / dt * (1000 / 60);
      const factor = Math.min(1, MAX_SPEED / Math.max(1, Math.hypot(vx, vy)));
      vx *= factor; vy *= factor;
    }
    Body.setVelocity(finished.body, { x: vx, y: vy });
  }
  Sleeping.set(finished.body, false);
  if (motion.matches) settle();
  else schedule();
  render();
}

surface.addEventListener('pointerup', event => release(event, true));
surface.addEventListener('pointercancel', event => release(event));
surface.addEventListener('lostpointercapture', event => release(event));
surface.addEventListener('pointerleave', () => { if (!drag) { hovered = null; surface.dataset.hover = 'false'; render(); } });

surface.addEventListener('click', event => {
  if (event.detail !== 0 || drag) return;
  generation += 1;
  shapes.forEach((body, i) => {
    Sleeping.set(body, false);
    if (motion.matches) {
      const pose = startingPoses[(i + generation) % shapes.length];
      Body.setPosition(body, { x: pose.x, y: pose.y });
      Body.setAngle(body, pose.angle);
      Body.setVelocity(body, { x: 0, y: 0 });
    } else {
      Body.setVelocity(body, { x: Math.sin(i * 2.4 + generation) * 4, y: -6 - (i % 3) * 1.5 });
      Body.setAngularVelocity(body, (i % 2 ? 1 : -1) * .08);
    }
  });
  if (motion.matches) settle();
  else schedule();
  render();
});

window.addEventListener('blur', () => release());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { release(); cancelAnimationFrame(frame); frame = 0; previous = 0; accumulator = 0; }
  else schedule();
});
motion.addEventListener('change', () => {
  release(); cancelAnimationFrame(frame); frame = 0;
  if (motion.matches) settle();
  else schedule();
  render();
});
new ResizeObserver(resize).observe(surface);
if (motion.matches) settle();
resize(); schedule();
