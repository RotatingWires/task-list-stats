(() => {
'use strict';

const numberFmt = new Intl.NumberFormat();
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
let tooltip = null;
let tooltipCanvas = null;
let tooltipIndexValue = -1;

function prepareCanvas(canvas, minHeight = 220) {
  // canvas.width/canvas.height are backing-store dimensions. Setting them also
  // changes the corresponding HTML attributes, so never read the height
  // attribute again after the first render. On high-DPI displays that would
  // feed devicePixelRatio-scaled pixels back in as a CSS height and make the
  // chart grow on every redraw.
  let declaredHeight = Number(canvas.dataset.logicalHeight);
  if (!declaredHeight) {
    declaredHeight = Number(canvas.getAttribute('height')) || minHeight;
    canvas.dataset.logicalHeight = String(declaredHeight);
  }
  const mobile = window.matchMedia('(max-width: 780px)').matches;
  const cssHeight = mobile ? Math.max(220, declaredHeight) : Math.min(180, declaredHeight);
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = '100%';
  canvas.style.height = `${cssHeight}px`;
  const measured = Math.floor(canvas.getBoundingClientRect().width || canvas.parentElement.clientWidth || 280);
  const cssWidth = Math.max(260, measured);
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(cssHeight * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.font = 'bold 15px Tahoma, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  return { ctx, width: cssWidth, height: cssHeight };
}

function axes(ctx, width, height, maxValue, yLabel = 'Tasks', left = 78, bottom = 54, top = 32, right = 44, decimalTicks = false) {
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  ctx.strokeStyle = '#808080';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, height - bottom);
  ctx.lineTo(width - right, height - bottom);
  ctx.stroke();
  const max = Math.max(decimalTicks ? 0.1 : 1, maxValue);
  for (let i = 0; i <= 4; i++) {
    const y = top + plotH - (plotH * i / 4);
    const raw = max * i / 4;
    const value = decimalTicks ? oneDecimal.format(raw) : numberFmt.format(Math.round(raw));
    ctx.fillStyle = '#333';
    ctx.textAlign = 'right';
    ctx.fillText(value, left - 5, y);
    if (i > 0) {
      ctx.strokeStyle = '#e0e0e0';
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
    }
  }
  if (yLabel) {
    ctx.save();
    ctx.translate(13, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    let yFontSize = 16;
    const maxLabelSpan = Math.max(60, height - 16);
    do {
      ctx.font = `bold ${yFontSize}px Tahoma, Arial, sans-serif`;
      if (ctx.measureText(yLabel).width <= maxLabelSpan || yFontSize <= 10) break;
      yFontSize--;
    } while (true);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
  return { left, bottom, top, right, plotW, plotH, max };
}

function drawBarValue(ctx, text, x, y) {
  ctx.save();
  ctx.font = 'bold 14px Tahoma, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#111';
  ctx.fillText(text, x, Math.max(13, y - 4));
  ctx.restore();
}

function drawBarChart(canvas, labels, values, color = '#000080', decimal = false, yLabel = 'Tasks') {
  if (!canvas || canvas.closest('[hidden]')) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  if (!values.length) {
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', width / 2, height / 2);
    return;
  }
  const rawMax = Math.max(...values, decimal ? 0.1 : 1);
  const a = axes(ctx, width, height, rawMax * 1.14, yLabel, 78, 54, 32, 44, decimal);
  const n = values.length;
  const slot = a.plotW / n;
  const barW = Math.max(4, slot * .70);
  values.forEach((value, i) => {
    const h = a.plotH * (value / a.max);
    const x = a.left + i * slot + (slot - barW) / 2;
    const y = height - a.bottom - h;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, barW, h);
    drawBarValue(ctx, decimal ? oneDecimal.format(value) : numberFmt.format(value), x + barW / 2, y);
  });
  const step = Math.max(1, Math.ceil(n / 12));
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((label, i) => {
    if (i % step === 0 || i === n - 1) ctx.fillText(String(label), a.left + (i + .5) * slot, height - 19);
  });
  delete canvas._tooltipConfig;
}

function drawGroupedBarChart(canvas, labels, aValues, bValues, aColor, bColor, yLabel = 'Tasks') {
  if (!canvas || canvas.closest('[hidden]')) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  const rawMax = Math.max(1, ...aValues, ...bValues);
  const a = axes(ctx, width, height, rawMax * 1.16, yLabel);
  const n = labels.length;
  const slot = a.plotW / n;
  const hourChart = canvas.id === 'hourChart';
  const bw = Math.max(4, slot * (hourChart ? .38 : .34));
  for (let i = 0; i < n; i++) {
    const h1 = a.plotH * aValues[i] / a.max;
    const h2 = a.plotH * bValues[i] / a.max;
    const center = a.left + (i + .5) * slot;
    const y1 = height - a.bottom - h1;
    const y2 = height - a.bottom - h2;
    ctx.fillStyle = aColor;
    ctx.fillRect(center - bw, y1, bw, h1);
    ctx.fillStyle = bColor;
    ctx.fillRect(center, y2, bw, h2);
    const close = aValues[i] && bValues[i] && Math.abs(y1 - y2) < 16;
    if (aValues[i]) drawBarValue(ctx, numberFmt.format(aValues[i]), center - bw / 2, y1);
    if (bValues[i]) drawBarValue(ctx, numberFmt.format(bValues[i]), center + bw / 2, close ? y2 - 15 : y2);
  }
  const step = n >= 24 ? 2 : Math.max(1, Math.ceil(n / 12));
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((label, i) => {
    const showLabel = n >= 24 ? i % step === 0 : (i % step === 0 || i === n - 1);
    if (showLabel) ctx.fillText(String(label), a.left + (i + .5) * slot, height - 19);
  });
  delete canvas._tooltipConfig;
}

function getTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.className = 'chart-tap-tooltip';
  tooltip.hidden = true;
  document.body.append(tooltip);
  return tooltip;
}

function hideTooltip() {
  if (tooltip) tooltip.hidden = true;
  tooltipCanvas = null;
  tooltipIndexValue = -1;
}

function tooltipIndex(config, x) {
  const count = config.labels.length;
  if (count <= 1) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(((x - config.left) / config.plotW) * (count - 1))));
}

function showTooltip(canvas, event) {
  const config = canvas._tooltipConfig;
  if (!config || !config.labels?.length) return null;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  if (x < config.left - 10 || x > config.left + config.plotW + 10) {
    hideTooltip();
    return null;
  }
  const index = tooltipIndex(config, x);
  const tip = getTooltip();
  tip.textContent = [String(config.labels[index]), ...config.series.map(series => `${series.name}: ${numberFmt.format(series.values[index] ?? 0)}`)].join('\n');
  tip.hidden = false;
  tooltipCanvas = canvas;
  tooltipIndexValue = index;
  const margin = 10, width = tip.offsetWidth || 220, height = tip.offsetHeight || 60;
  const left = Math.max(margin, Math.min(window.innerWidth - width - margin, event.clientX - width / 2));
  let top = event.clientY + 12;
  if (top + height + margin > window.innerHeight) top = Math.max(margin, event.clientY - height - 12);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  return index;
}

function installLineTooltip(canvas) {
  if (!canvas || canvas._lineTooltipInstalled) return;
  canvas._lineTooltipInstalled = true;
  canvas.style.touchAction = 'manipulation';
  canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch') showTooltip(canvas, event);
  });
  canvas.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'touch') hideTooltip();
  });
  canvas.addEventListener('click', event => {
    const config = canvas._tooltipConfig;
    if (!config || !config.labels?.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const index = tooltipIndex(config, x);
    const touchLike = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    if (touchLike && tooltip && !tooltip.hidden && tooltipCanvas === canvas && tooltipIndexValue === index) {
      hideTooltip();
      return;
    }
    showTooltip(canvas, event);
  });
}

function drawLineChart(canvas, labels, values, color = '#000080', yLabel = 'Tasks', seriesName = 'Series') {
  drawMultiLineChart(canvas, labels, [{ name: seriesName, values, color }], yLabel);
}

function drawMultiLineChart(canvas, labels, series, yLabel = 'Tasks') {
  if (!canvas || canvas.closest('[hidden]')) return;
  const { ctx, width, height } = prepareCanvas(canvas, Number(canvas.dataset.logicalHeight) || Number(canvas.getAttribute('height')) || 220);
  const rawMax = Math.max(1, ...series.flatMap(s => s.values));
  const a = axes(ctx, width, height, rawMax * 1.08, yLabel);
  const n = labels.length;
  if (!n) {
    delete canvas._tooltipConfig;
    hideTooltip();
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.fillText('No data', width / 2, height / 2);
    return;
  }
  const xAt = i => a.left + (n === 1 ? a.plotW / 2 : a.plotW * i / (n - 1));
  for (const item of series) {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    item.values.forEach((value, i) => {
      const x = xAt(i), y = a.top + a.plotH - a.plotH * value / a.max;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  const step = Math.max(1, Math.ceil(n / 10));
  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((label, i) => {
    if (i % step === 0 || i === n - 1) ctx.fillText(String(label), xAt(i), height - 19);
  });
  canvas._tooltipConfig = { labels, series, left: a.left, plotW: a.plotW };
  installLineTooltip(canvas);
}

document.addEventListener('pointerdown', event => {
  if (!tooltip || tooltip.hidden) return;
  if (tooltip.contains(event.target)) return;
  const canvas = event.target.closest?.('canvas');
  if (canvas?._tooltipConfig) return;
  hideTooltip();
}, true);
window.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });

window.Charts = { drawBarChart, drawGroupedBarChart, drawLineChart, drawMultiLineChart };
})();
