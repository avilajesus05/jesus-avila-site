const MATERIALS = {
  violet: { light: '#d2c6ed', mid: '#716483', base: '#3a3448', dark: '#1a1922', edge: '#d9c9f4' },
  silver: { light: '#e2dfe8', mid: '#8c8b96', base: '#45454e', dark: '#1b1c24', edge: '#eeebf6' },
  copper: { light: '#e9c6b1', mid: '#9a776b', base: '#554039', dark: '#231c20', edge: '#f4d4bd' },
};

function polygon(ctx, vertices) {
  ctx.beginPath();
  vertices.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function silhouette(ctx, body) {
  if (body.circleRadius > 0) {
    ctx.beginPath();
    ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
  } else polygon(ctx, body.vertices);
}

function extent(body) {
  if (body.circleRadius > 0) return body.circleRadius;
  return Math.max(...body.vertices.map(vertex => Math.hypot(vertex.x - body.position.x, vertex.y - body.position.y)));
}

function drawSphere(ctx, body, material, radius) {
  const { x, y } = body.position;
  const light = ctx.createRadialGradient(x - radius * .38, y - radius * .45, radius * .03, x + radius * .08, y + radius * .14, radius * 1.2);
  light.addColorStop(0, material.light);
  light.addColorStop(.18, material.mid);
  light.addColorStop(.55, material.base);
  light.addColorStop(.91, material.dark);
  light.addColorStop(1, material.mid);
  silhouette(ctx, body);
  ctx.fillStyle = light;
  ctx.fill();

  ctx.save();
  silhouette(ctx, body);
  ctx.clip();
  // A broad reflection rotates with the surface, making rolling perceptible.
  ctx.translate(x, y);
  ctx.rotate(body.angle * .65 - .45);
  const reflection = ctx.createLinearGradient(-radius, 0, radius, 0);
  reflection.addColorStop(0, 'rgba(255,255,255,0)');
  reflection.addColorStop(.29, 'rgba(255,255,255,0)');
  reflection.addColorStop(.39, 'rgba(255,255,255,.13)');
  reflection.addColorStop(.46, 'rgba(255,255,255,.035)');
  reflection.addColorStop(.57, 'rgba(255,255,255,0)');
  reflection.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = reflection;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

function drawFaceted(ctx, body, material, radius) {
  const { x, y } = body.position;
  const outer = body.vertices;
  const bevel = Math.min(4.6, radius * .13);
  const inner = outer.map(point => {
    const distance = Math.max(1, Math.hypot(point.x - x, point.y - y));
    const ratio = Math.max(.7, (distance - bevel) / distance);
    return { x: x + (point.x - x) * ratio, y: y + (point.y - y) * ratio };
  });
  const base = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
  base.addColorStop(0, material.light);
  base.addColorStop(.35, material.mid);
  base.addColorStop(.72, material.base);
  base.addColorStop(1, material.dark);
  polygon(ctx, outer);
  ctx.fillStyle = base;
  ctx.fill();

  // Bevels stay entirely inside the physical collision silhouette.
  outer.forEach((point, index) => {
    const next = (index + 1) % outer.length;
    const midpoint = { x: (point.x + outer[next].x) / 2 - x, y: (point.y + outer[next].y) / 2 - y };
    const length = Math.max(1, Math.hypot(midpoint.x, midpoint.y));
    const illumination = (-midpoint.x * .55 - midpoint.y * .83) / length;
    polygon(ctx, [point, outer[next], inner[next], inner[index]]);
    ctx.fillStyle = illumination > 0
      ? `rgba(248,238,255,${.06 + illumination * .34})`
      : `rgba(2,2,8,${.14 - illumination * .5})`;
    ctx.fill();
  });

  const face = ctx.createLinearGradient(x - radius * .7, y - radius, x + radius * .7, y + radius);
  face.addColorStop(0, material.mid);
  face.addColorStop(.4, material.base);
  face.addColorStop(1, material.dark);
  polygon(ctx, inner);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = .5;
  ctx.strokeStyle = 'rgba(233,220,247,.14)';
  ctx.stroke();

  ctx.save();
  polygon(ctx, inner);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(body.angle + .6);
  const reflection = ctx.createLinearGradient(-radius, 0, radius, 0);
  reflection.addColorStop(0, 'rgba(255,246,255,0)');
  reflection.addColorStop(.21, 'rgba(255,246,255,.025)');
  reflection.addColorStop(.46, 'rgba(255,246,255,.15)');
  reflection.addColorStop(.49, 'rgba(255,246,255,.015)');
  reflection.addColorStop(.84, 'rgba(255,246,255,0)');
  reflection.addColorStop(1, 'rgba(255,246,255,0)');
  ctx.fillStyle = reflection;
  ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);
  ctx.restore();
}

function drawBody(ctx, body, selected, hovered) {
  const material = MATERIALS[body.plugin?.tone] || MATERIALS.violet;
  const radius = extent(body);
  ctx.save();
  silhouette(ctx, body);
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 7;
  ctx.fillStyle = material.dark;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;

  if (body.circleRadius > 0) drawSphere(ctx, body, material, radius);
  else drawFaceted(ctx, body, material, radius);

  const rim = ctx.createLinearGradient(body.position.x - radius, body.position.y - radius, body.position.x + radius, body.position.y + radius);
  rim.addColorStop(0, material.edge);
  rim.addColorStop(.4, material.mid);
  rim.addColorStop(.67, material.dark);
  rim.addColorStop(1, material.mid);
  silhouette(ctx, body);
  ctx.lineWidth = .85;
  ctx.strokeStyle = rim;
  ctx.stroke();
  if (body === selected || body === hovered) {
    ctx.lineWidth = body === selected ? 1.5 : 1;
    ctx.strokeStyle = body === selected ? 'rgba(239,222,255,.8)' : 'rgba(239,222,255,.4)';
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScene(ctx, bodies, { width = 460, height = 300, floor = 258, selected = null, hovered = null } = {}) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  const baseline = ctx.createLinearGradient(35, floor, width - 35, floor);
  baseline.addColorStop(0, 'rgba(167,148,185,0)');
  baseline.addColorStop(.25, 'rgba(167,148,185,.14)');
  baseline.addColorStop(.75, 'rgba(167,148,185,.14)');
  baseline.addColorStop(1, 'rgba(167,148,185,0)');
  ctx.beginPath();
  ctx.moveTo(35, floor + .5);
  ctx.lineTo(width - 35, floor + .5);
  ctx.strokeStyle = baseline;
  ctx.lineWidth = .65;
  ctx.stroke();

  for (const body of bodies) {
    const radius = extent(body);
    const distance = Math.max(0, floor - body.position.y - radius);
    const spread = radius * (1 + Math.min(distance, 150) / 300);
    ctx.save();
    ctx.translate(body.position.x, floor + 1.5);
    ctx.scale(1, .13);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, spread);
    shadow.addColorStop(0, `rgba(0,0,0,${.42 / (1 + distance / 45)})`);
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-spread, -spread, spread * 2, spread * 2);
    ctx.restore();
  }

  // Match the picking order: the final body in the array is visually on top.
  for (const body of bodies) drawBody(ctx, body, selected, hovered);
  ctx.restore();
}
