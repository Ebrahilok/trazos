/* global fabric, jspdf */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORE = 'trazo-projects-v3';
const PAGE = { portrait: [816, 1056], landscape: [1056, 816] };
const extraProps = ['locked', 'trazoType'];
let projects = [];
let currentProjectId = '';
let pageIndex = 0;
let zoom = .72;
let history = [];
let historyIndex = -1;
let restoring = false;
let saveTimer;
let glyphDraft = [];
let glyphDrawing = false;
let baseBrushWidth = 5;
let pinchState = null;
let pinchDiscardUntil = 0;
const touchPointers = new Map();
const MIN_ZOOM = .3;
const MAX_ZOOM = 2.5;
const COLOR_STORE = 'trazo-recent-colors-v1';
const presetColors = ['#183D38','#2E6F68','#2F5DA8','#4E3F8F','#7A3E84','#A33D54','#C6533F','#E47A45','#D29B2B','#F1C84B','#5E8C42','#2C8C75','#111827','#4B5563','#8B8178','#FFFFFF'];
let recentColors = [];
try { recentColors = JSON.parse(localStorage.getItem(COLOR_STORE) || '[]'); } catch { recentColors = []; }

const starterProject = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  name: 'Mi primera tarea', orientation: 'portrait', paperStyle: 'ruled',
  pages: [null], glyphs: {}, coverTemplate: null, updatedAt: Date.now()
});

try { projects = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { projects = []; }
if (!projects.length) projects = [starterProject()];
currentProjectId = projects[0].id;
const currentProject = () => projects.find((item) => item.id === currentProjectId) || projects[0];

const canvas = new fabric.Canvas('pageCanvas', {
  preserveObjectStacking: true, selection: true, fireRightClick: true,
  controlsAboveOverlay: true, stopContextMenu: true
});
canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
canvas.freeDrawingBrush.width = 5;
canvas.freeDrawingBrush.color = '#183d38';
canvas.upperCanvasEl.addEventListener('pointerdown', (event) => { if (canvas.isDrawingMode && event.pointerType === 'pen' && event.pressure > 0) canvas.freeDrawingBrush.width = baseBrushWidth * (.55 + event.pressure * 1.15); });
canvas.upperCanvasEl.addEventListener('pointermove', (event) => { if (canvas.isDrawingMode && event.pointerType === 'pen' && event.pressure > 0) canvas.freeDrawingBrush.width = baseBrushWidth * (.55 + event.pressure * 1.15); });

function touchCenter(points) { return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }; }
function touchDistance(points) { return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); }
function beginPinch() {
  const points = [...touchPointers.values()].slice(0, 2); if (points.length < 2) return;
  const stage = $('#pageStage'), rect = stage.getBoundingClientRect(), center = touchCenter(points);
  pinchState = { startDistance: Math.max(1, touchDistance(points)), startZoom: zoom, pageX: (stage.scrollLeft + center.x - rect.left) / zoom, pageY: (stage.scrollTop + center.y - rect.top) / zoom, wasDrawing: canvas.isDrawingMode, wasSelection: canvas.selection };
  canvas.isDrawingMode = false; canvas.selection = false; canvas.skipTargetFind = true; canvas.discardActiveObject(); canvas.requestRenderAll(); stage.classList.add('pinching');
}
function finishPinch() {
  if (!pinchState || touchPointers.size) return;
  const state = pinchState; pinchState = null; pinchDiscardUntil = performance.now() + 350;
  canvas.skipTargetFind = false; canvas.selection = state.wasSelection; canvas.isDrawingMode = state.wasDrawing; canvas.freeDrawingBrush.width = baseBrushWidth;
  $('#pageStage').classList.remove('pinching'); canvas.requestRenderAll();
}
const pageStage = $('#pageStage');
pageStage.addEventListener('pointerdown', (event) => {
  if (event.pointerType !== 'touch') return; touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touchPointers.size === 2) { event.preventDefault(); event.stopImmediatePropagation(); beginPinch(); }
}, { capture: true, passive: false });
pageStage.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'touch' || !touchPointers.has(event.pointerId)) return;
  touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (!pinchState) return;
  event.preventDefault(); event.stopImmediatePropagation(); const points = [...touchPointers.values()].slice(0, 2); if (points.length < 2) return;
  const stage = $('#pageStage'), rect = stage.getBoundingClientRect(), center = touchCenter(points);
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchState.startZoom * touchDistance(points) / pinchState.startDistance)); applyZoom();
  stage.scrollLeft = pinchState.pageX * zoom - (center.x - rect.left); stage.scrollTop = pinchState.pageY * zoom - (center.y - rect.top);
}, { capture: true, passive: false });
function releaseTouch(event) {
  if (event.pointerType !== 'touch') return; const wasPinching = Boolean(pinchState); touchPointers.delete(event.pointerId);
  if (wasPinching) { event.preventDefault(); finishPinch(); }
}
pageStage.addEventListener('pointerup', releaseTouch, { capture: true, passive: false });
pageStage.addEventListener('pointercancel', releaseTouch, { capture: true, passive: false });

function toast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('show');
  clearTimeout(element._timer); element._timer = setTimeout(() => element.classList.remove('show'), 1900);
}

function normalizeHex(value) {
  const raw = String(value || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((part) => part + part).join('').toUpperCase()}`;
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}
function hexToHsl(hex) {
  const color = normalizeHex(hex) || '#183D38'; const red = parseInt(color.slice(1, 3), 16) / 255, green = parseInt(color.slice(3, 5), 16) / 255, blue = parseInt(color.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue); let hue = 0, saturation = 0; const lightness = (max + min) / 2;
  if (max !== min) { const delta = max - min; saturation = lightness > .5 ? delta / (2 - max - min) : delta / (max + min); if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0); else if (max === green) hue = (blue - red) / delta + 2; else hue = (red - green) / delta + 4; hue *= 60; }
  return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}
function hslToHex(hue, saturation, lightness) {
  const h = ((Number(hue) % 360) + 360) % 360, s = Number(saturation) / 100, l = Number(lightness) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s, x = chroma * (1 - Math.abs((h / 60) % 2 - 1)), match = l - chroma / 2; let rgb;
  if (h < 60) rgb = [chroma, x, 0]; else if (h < 120) rgb = [x, chroma, 0]; else if (h < 180) rgb = [0, chroma, x]; else if (h < 240) rgb = [0, x, chroma]; else if (h < 300) rgb = [x, 0, chroma]; else rgb = [chroma, 0, x];
  return `#${rgb.map((part) => Math.round((part + match) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
function syncColorControls(value) {
  const color = normalizeHex(value); if (!color) return;
  $('#objectColor').value = color; $('#colorHex').value = color; $('#colorSwatch').style.background = color; $('#colorPreview').style.background = color;
  const hsl = hexToHsl(color); $('#colorHue').value = hsl.h; $('#colorSaturation').value = hsl.s; $('#colorLightness').value = hsl.l;
  $$('#colorPresets button,#recentColors button').forEach((button) => button.classList.toggle('selected', button.dataset.color === color));
}
function applyObjectColor(value) {
  const color = normalizeHex(value); if (!color) return false; syncColorControls(color); canvas.freeDrawingBrush.color = color;
  const object = selected(); if (object && typeof object.fill === 'string') { object.set('fill', color); if (object.stroke) object.set('stroke', color); canvas.requestRenderAll(); scheduleSave(); }
  drawGlyphPad(); return true;
}
function rememberColor(value) {
  const color = normalizeHex(value); if (!color) return; recentColors = [color, ...recentColors.filter((item) => item !== color)].slice(0, 8); localStorage.setItem(COLOR_STORE, JSON.stringify(recentColors)); renderColorChoices();
}
function renderColorChoices() {
  $('#colorPresets').innerHTML = presetColors.map((color) => `<button type="button" data-color="${color}" style="--swatch:${color}" aria-label="Color ${color}"></button>`).join('');
  $('#recentColors').innerHTML = recentColors.length ? recentColors.map((color) => `<button type="button" data-color="${color}" style="--swatch:${color}" aria-label="Color reciente ${color}"></button>`).join('') : '<small class="muted">Aquí aparecerán los colores que elijas.</small>';
  syncColorControls($('#objectColor').value);
}
function openColorPicker() { renderColorChoices(); $('#colorOverlay').hidden = false; $('#closeColorPicker').focus(); }
function closeColorPicker(commit = false) { if (commit) rememberColor($('#objectColor').value); $('#colorOverlay').hidden = true; $('#colorPickerButton').focus(); }

function updateProjectSelect() {
  $('#projectSelect').innerHTML = projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join('');
  $('#projectSelect').value = currentProjectId;
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }

function patternFor(style) {
  if (style === 'plain') return '#fffefa';
  const tile = document.createElement('canvas'); tile.width = style === 'grid' ? 32 : 64; tile.height = 32;
  const context = tile.getContext('2d'); context.fillStyle = '#fffefa'; context.fillRect(0, 0, tile.width, tile.height);
  context.strokeStyle = '#dce5e2'; context.lineWidth = 1;
  if (style === 'grid') { context.beginPath(); context.moveTo(0, 31.5); context.lineTo(32, 31.5); context.moveTo(31.5, 0); context.lineTo(31.5, 32); context.stroke(); }
  else { context.beginPath(); context.moveTo(0, 31.5); context.lineTo(64, 31.5); context.stroke(); }
  return new fabric.Pattern({ source: tile, repeat: 'repeat' });
}

function addMarginGuide(style) {
  canvas.getObjects().filter((object) => object.trazoType === 'page-guide').forEach((object) => canvas.remove(object));
  if (style !== 'margin') return;
  const guide = new fabric.Line([78, 0, 78, canvas.height], { stroke: '#e7aaa0', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: false, trazoType: 'page-guide' });
  canvas.add(guide); canvas.sendObjectToBack(guide);
}

function setPageDimensions() {
  const [width, height] = PAGE[currentProject().orientation];
  canvas.setDimensions({ width, height });
  $('#orientation').value = currentProject().orientation;
  $('#paperStyle').value = currentProject().paperStyle;
  applyZoom();
}

function applyZoom() {
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  const shell = $('#canvasShell');
  shell.style.width = `${canvas.width * zoom}px`; shell.style.height = `${canvas.height * zoom}px`;
  const container = shell.querySelector('.canvas-container');
  if (container) { container.style.transform = `scale(${zoom})`; container.style.transformOrigin = 'top left'; }
  $('#zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}

function serializePage() { return canvas.toJSON(extraProps); }

function saveCurrentPage() {
  const project = currentProject();
  if (!project) return;
  project.pages[pageIndex] = serializePage(); project.updatedAt = Date.now();
}

function saveAll() {
  saveCurrentPage();
  localStorage.setItem(STORE, JSON.stringify(projects));
  $('#saveState').textContent = 'Guardado';
}

function scheduleSave(pushHistory = true) {
  if (restoring) return;
  $('#saveState').textContent = 'Guardando…'; clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveAll(); if (pushHistory) recordHistory(); }, 260);
}

function recordHistory() {
  const json = JSON.stringify(serializePage());
  if (history[historyIndex] === json) return;
  history = history.slice(0, historyIndex + 1); history.push(json);
  if (history.length > 40) history.shift(); historyIndex = history.length - 1;
}

async function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  restoring = true; historyIndex = index;
  await canvas.loadFromJSON(JSON.parse(history[index])); applyPaper(); canvas.renderAll(); restoring = false; saveAll();
}

function applyPaper() {
  canvas.backgroundColor = patternFor(currentProject().paperStyle); addMarginGuide(currentProject().paperStyle); canvas.requestRenderAll();
}

async function loadPage(index) {
  saveCurrentPage(); pageIndex = Math.max(0, Math.min(index, currentProject().pages.length - 1));
  setPageDimensions(); restoring = true; canvas.clear();
  const page = currentProject().pages[pageIndex];
  if (page) await canvas.loadFromJSON(page);
  applyPaper(); canvas.renderAll(); restoring = false; history = []; historyIndex = -1; recordHistory(); updatePageLabel();
}

function updatePageLabel() {
  $('#pageLabel').textContent = `Página ${pageIndex + 1} de ${currentProject().pages.length}`;
  $('#prevPage').disabled = pageIndex === 0; $('#nextPage').disabled = pageIndex === currentProject().pages.length - 1;
}

async function openProject(id) {
  saveAll(); currentProjectId = id; pageIndex = 0; updateProjectSelect(); await loadPage(0);
}

function createProject(name) {
  const project = starterProject(); project.name = name || `Tarea ${projects.length + 1}`;
  projects.unshift(project); currentProjectId = project.id; updateProjectSelect(); loadPage(0); saveAll();
}

function switchTool(tool) {
  canvas.isDrawingMode = tool === 'draw'; canvas.selection = tool !== 'draw';
  $$('.toolrail button').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
  $$('.panel section').forEach((section) => section.classList.toggle('active', section.dataset.panel === tool));
  if (tool === 'image') $('#imageFile').click();
  if (window.innerWidth <= 820 && tool !== 'select' && tool !== 'image') $('#panel').classList.add('open');
  const hints = { draw: 'Dibuja con el lápiz o el dedo. La presión modifica el grosor cuando está disponible.', select: 'Toca un elemento para moverlo, girarlo o cambiar su tamaño.' };
  $('#toolHint').textContent = hints[tool] || 'Configura la herramienta en el panel lateral.';
}

function selected() { return canvas.getActiveObject(); }
function unlockState(object, locked) {
  object.set({ locked, lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
}

function addObject(object, center = true) {
  if (center) canvas.centerObject(object); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); scheduleSave();
}

function addText(text, handwritten = false) {
  const value = text.trim(); if (!value) return toast('Escribe algo primero.');
  const size = Number($('#textSize').value || 28);
  const object = new fabric.Textbox(value, { width: Math.min(620, canvas.width - 130), fontSize: size, fill: $('#objectColor').value, fontFamily: handwritten ? 'Segoe Print, Comic Sans MS, cursive' : 'Arial, sans-serif', lineHeight: handwritten ? 1.35 : 1.25, textAlign: $('#textAlign').value, trazoType: handwritten ? 'hand-text' : 'text', editable: true });
  object.set({ left: (canvas.width - object.width) / 2, top: 120 }); addObject(object, false);
}

const symbolCategories = {
  'Formas': ['○','●','□','■','△','▲','◇','◆','☆','★','⬭','▱'],
  'Flechas': ['→','←','↑','↓','↔','↕','⇒','⇐','⇑','⇓','↗','↘','↙','↖'],
  'Matemáticas': ['+','−','×','÷','=','≠','≈','≤','≥','±','√','∞','π','∑','∫','∆','∠','°','%','½','¼','¾'],
  'Ciencias': ['⚛','⚗','⌁','Ω','α','β','γ','λ','μ','ρ','σ','θ','φ','ψ','⊕','⊙','♀','♂'],
  'Organización': ['✓','✕','!','?','•','◦','①','②','③','④','⑤','☐','☑','⚑','⌂','✎']
};
let activeSymbolCategory = 'Formas';
function renderSymbols() {
  $('#symbolTabs').innerHTML = Object.keys(symbolCategories).map((category) => `<button class="${category === activeSymbolCategory ? 'active' : ''}" data-category="${category}">${category}</button>`).join('');
  const query = $('#symbolSearch').value.toLowerCase();
  const values = symbolCategories[activeSymbolCategory].filter((symbol) => symbol.toLowerCase().includes(query));
  $('#symbolGrid').innerHTML = values.map((symbol) => `<button data-symbol="${symbol}">${symbol}</button>`).join('');
}

function insertSymbol(symbol) {
  const object = new fabric.IText(symbol, { fontSize: 74, fill: $('#objectColor').value, fontFamily: 'Arial Unicode MS, Segoe UI Symbol, sans-serif', trazoType: 'symbol' }); addObject(object);
}

function readImage(file) {
  const reader = new FileReader(); reader.onload = async () => {
    const image = await fabric.FabricImage.fromURL(reader.result);
    image.scaleToWidth(Math.min(430, canvas.width * .55)); image.set({ trazoType: 'image' }); addObject(image); toast('Imagen añadida.');
  }; reader.readAsDataURL(file);
}

function coverObjects(fields, style) {
  const ink = style === 'school' ? '#245d72' : '#183d38';
  const objects = [];
  if (style === 'school') objects.push(new fabric.Rect({ left: 55, top: 55, width: canvas.width - 110, height: canvas.height - 110, fill: 'transparent', stroke: '#d6785c', strokeWidth: 5, rx: 18, ry: 18, selectable: false, trazoType: 'cover-decoration' }));
  if (style === 'formal') objects.push(new fabric.Line([80, 220, canvas.width - 80, 220], { stroke: ink, strokeWidth: 3, selectable: false, trazoType: 'cover-decoration' }));
  const title = new fabric.Textbox(fields.title || 'Trabajo', { left: 90, top: 250, width: canvas.width - 180, fontSize: style === 'minimal' ? 42 : 50, fill: ink, fontFamily: 'Georgia, serif', fontWeight: 'bold', textAlign: 'center', trazoType: 'cover-text' }); objects.push(title);
  const lines = [`${fields.student || 'Nombre del alumno'}`, `${fields.subject || 'Materia'}`, `Profesor: ${fields.teacher || 'Nombre del profesor'}`, fields.date || new Date().toLocaleDateString('es-MX')];
  lines.forEach((line, index) => objects.push(new fabric.Textbox(line, { left: 130, top: 500 + index * 70, width: canvas.width - 260, fontSize: 25, fill: ink, fontFamily: 'Arial, sans-serif', textAlign: 'center', trazoType: 'cover-text' })));
  return objects;
}

function applyCover() {
  const fields = { title: $('#coverTitle').value, student: $('#coverStudent').value, subject: $('#coverSubject').value, teacher: $('#coverTeacher').value, date: $('#coverDate').value };
  currentProject().coverTemplate = { ...fields, style: $('#coverStyle').value };
  canvas.getObjects().forEach((object) => canvas.remove(object)); coverObjects(fields, $('#coverStyle').value).forEach((object) => canvas.add(object)); applyPaper(); canvas.requestRenderAll(); scheduleSave(); toast('Portada aplicada.');
}

function addPage(auto = false) {
  saveCurrentPage(); currentProject().pages.push(null); pageIndex = currentProject().pages.length - 1; loadPage(pageIndex); scheduleSave(false); if (auto) toast('Se creó una página nueva automáticamente.');
}

async function resizePages(orientation, style) {
  saveCurrentPage(); currentProject().orientation = orientation; currentProject().paperStyle = style; await loadPage(pageIndex); scheduleSave(false); toast('Formato aplicado.');
}

function projectPayload() { saveCurrentPage(); return { type: 'trazo-project', version: 3, exportedAt: new Date().toISOString(), project: currentProject() }; }
function blobToBase64(blob) { return new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob); }); }

async function deliverBlob(blob, filename, share = false) {
  if (window.Android?.saveFile) { window.Android.saveFile(await blobToBase64(blob), filename, blob.type || 'application/octet-stream', share); return; }
  const file = new File([blob], filename, { type: blob.type });
  if (share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function exportEditable() {
  const blob = new Blob([JSON.stringify(projectPayload())], { type: 'application/x-trazo+json' }); await deliverBlob(blob, `${safeName(currentProject().name)}.trazo`); toast('Archivo editable guardado.');
}

async function makePdf(share = false) {
  saveCurrentPage(); $('#saveState').textContent = 'Creando PDF…';
  const project = currentProject(); const original = pageIndex; const orientation = project.orientation === 'landscape' ? 'landscape' : 'portrait';
  const pdf = new jspdf.jsPDF({ orientation, unit: 'pt', format: 'letter', compress: true });
  for (let index = 0; index < project.pages.length; index += 1) {
    await loadPage(index); canvas.discardActiveObject(); canvas.renderAll();
    if (index) pdf.addPage('letter', orientation);
    const data = canvas.toDataURL({ format: 'png', multiplier: 1.7 });
    const width = orientation === 'landscape' ? 792 : 612, height = orientation === 'landscape' ? 612 : 792;
    pdf.addImage(data, 'PNG', 0, 0, width, height, undefined, 'FAST');
  }
  await loadPage(original); const blob = pdf.output('blob'); await deliverBlob(blob, `${safeName(project.name)}.pdf`, share); $('#saveState').textContent = 'Guardado'; toast(share ? 'Elige WhatsApp, Drive u otra aplicación.' : 'PDF guardado.');
}

function safeName(name) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'tarea'; }

async function importEditable(file) {
  try { const payload = JSON.parse(await file.text()); if (payload.type !== 'trazo-project' || !payload.project) throw new Error(); const project = payload.project; project.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); project.name = `${project.name} (importada)`; projects.unshift(project); currentProjectId = project.id; pageIndex = 0; updateProjectSelect(); await loadPage(0); saveAll(); toast('Tarea importada.'); } catch { toast('El archivo .trazo no es válido.'); }
}

function drawGlyphPad() {
  const pad = $('#glyphPad'), context = pad.getContext('2d'); context.fillStyle = '#fffefa'; context.fillRect(0, 0, pad.width, pad.height); context.setLineDash([6, 8]); context.strokeStyle = '#d8d0c4'; context.lineWidth = 1; [90, 240, 315].forEach((y) => { context.beginPath(); context.moveTo(0, y); context.lineTo(pad.width, y); context.stroke(); }); context.setLineDash([]); context.strokeStyle = $('#objectColor').value; context.lineWidth = 8; context.lineCap = 'round'; context.lineJoin = 'round'; glyphDraft.forEach((stroke) => { context.beginPath(); stroke.forEach((point, index) => index ? context.lineTo(point.x * pad.width / 100, point.y * pad.height / 100) : context.moveTo(point.x * pad.width / 100, point.y * pad.height / 100)); context.stroke(); });
}

function glyphPoint(event) { const rect = $('#glyphPad').getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }; }
function glyphPreview(variant) { const lines = variant.map((stroke) => `<polyline points="${stroke.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`).join(''); return `<svg viewBox="0 0 100 100" aria-hidden="true">${lines}</svg>`; }
function updateGlyphStatus() { const character = [...$('#glyphCharacter').value.toLowerCase()].at(-1) || 'a'; $('#glyphCharacter').value = character; const variants = currentProject().glyphs[character] || []; const count = variants.length; $('#glyphCount').textContent = `${count}/10`; $('#glyphProgress').style.width = `${Math.min(100, count * 10)}%`; $('#glyphMessage').textContent = count >= 10 ? 'Lista para variar con naturalidad.' : `Faltan ${10 - count} muestras recomendadas.`; $('#glyphVariants').innerHTML = variants.map((variant, index) => `<button class="glyph-variant" data-delete-variant="${index}" title="Eliminar variante ${index + 1}"><b>#${index + 1}</b>${glyphPreview(variant)}<i>×</i></button>`).join(''); }

function saveGlyph() { if (!glyphDraft.some((stroke) => stroke.length > 1)) return toast('Dibuja la letra primero.'); const character = $('#glyphCharacter').value.toLowerCase(); (currentProject().glyphs[character] ||= []).push(glyphDraft); glyphDraft = []; drawGlyphPad(); updateGlyphStatus(); scheduleSave(false); }

function addHumanizedText(value) {
  if (!value.trim()) return toast('Escribe algo primero.');
  const group = []; let x = 0, y = 0; const size = 36, maxWidth = canvas.width - 150; const glyphs = currentProject().glyphs;
  [...value].forEach((character, index) => {
    if (character === '\n') { x = 0; y += size * 1.55; return; }
    if (character === ' ') { x += size * (.35 + Math.random() * .25); return; }
    if (x > maxWidth) { x = 0; y += size * 1.55; }
    const variants = glyphs[character.toLowerCase()]; let object;
    if (variants?.length) {
      const variant = variants[Math.floor(Math.random() * variants.length)];
      const points = variant.flat(); const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x)), minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
      const sourceWidth = Math.max(1, maxX - minX), sourceHeight = Math.max(1, maxY - minY); const variation = .985 + Math.random() * .03; let scale = size * .92 * variation / sourceHeight; scale = Math.min(scale, size * .76 / sourceWidth);
      const paths = variant.map((stroke) => new fabric.Polyline(stroke.map((point) => ({ x: point.x - minX, y: point.y - minY })), { fill: '', stroke: $('#objectColor').value, strokeWidth: 4.7 / scale, strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false }));
      const renderedWidth = sourceWidth * scale, renderedHeight = sourceHeight * scale;
      object = new fabric.Group(paths, { left: x, top: y + size - renderedHeight, scaleX: scale, scaleY: scale, selectable: false }); x += Math.max(size * .43, renderedWidth + size * .09);
    } else { object = new fabric.Text(character, { left: x, top: y, fontSize: size, fill: $('#objectColor').value, fontFamily: 'Segoe Print, Comic Sans MS, cursive', selectable: false }); x += object.width + size * .045; }
    const amount = Number($('#humanize').value) / 100; object.angle = (Math.random() - .5) * 1.6 * amount; object.top += (Math.random() - .5) * 2.2 * amount; group.push(object);
  });
  addObject(new fabric.Group(group, { left: 75, top: 120, trazoType: 'humanized-text' }), false);
}

canvas.on('object:added', () => scheduleSave()); canvas.on('object:removed', () => scheduleSave()); canvas.on('object:modified', (event) => {
  const object = event.target; if (!object || object.trazoType === 'page-guide') return scheduleSave();
  const bounds = object.getBoundingRect();
  if (bounds.top + bounds.height > canvas.height + 20) { canvas.remove(object); saveCurrentPage(); currentProject().pages.push(null); pageIndex = currentProject().pages.length - 1; loadPage(pageIndex).then(() => { object.set({ top: 70, left: Math.max(40, object.left) }); addObject(object, false); toast('El elemento pasó a una página nueva.'); }); } else scheduleSave();
});
canvas.on('path:created', (event) => { if (pinchState || performance.now() < pinchDiscardUntil) { canvas.remove(event.path); canvas.requestRenderAll(); return; } event.path.set({ trazoType: 'drawing' }); canvas.freeDrawingBrush.width = baseBrushWidth; scheduleSave(); });
canvas.on('selection:created', syncSelection); canvas.on('selection:updated', syncSelection);
function syncSelection() { const object = selected(); if (object?.fill && typeof object.fill === 'string') syncColorControls(object.fill); $('#lockObject').textContent = object?.locked ? 'Desbloquear' : 'Bloquear'; }

$$('.toolrail button').forEach((button) => button.onclick = () => switchTool(button.dataset.tool));
$('#panelClose').onclick = () => $('#panel').classList.remove('open');
$('#projectSelect').onchange = (event) => openProject(event.target.value);
$('#newProject').onclick = () => { const name = prompt('Nombre de la nueva tarea:'); if (name !== null) createProject(name.trim()); };
$('#duplicateProject').onclick = () => { saveCurrentPage(); const copy = JSON.parse(JSON.stringify(currentProject())); copy.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); copy.name += ' (copia)'; projects.unshift(copy); currentProjectId = copy.id; updateProjectSelect(); loadPage(0); saveAll(); };
$('#deleteProject').onclick = () => { if (projects.length === 1) return toast('Debe quedar al menos una tarea.'); if (!confirm(`¿Eliminar “${currentProject().name}”?`)) return; projects = projects.filter((project) => project.id !== currentProjectId); currentProjectId = projects[0].id; openProject(currentProjectId); };
$('#colorPickerButton').onclick = openColorPicker;
$('#closeColorPicker').onclick = () => closeColorPicker(false); $('#useColor').onclick = () => closeColorPicker(true);
$('#colorOverlay').onclick = (event) => { if (event.target === $('#colorOverlay')) closeColorPicker(true); };
$('#objectColor').oninput = (event) => applyObjectColor(event.target.value); $('#objectColor').onchange = (event) => { applyObjectColor(event.target.value); rememberColor(event.target.value); };
$('#colorHex').oninput = (event) => { if (normalizeHex(event.target.value)) applyObjectColor(event.target.value); }; $('#colorHex').onchange = (event) => { if (!applyObjectColor(event.target.value)) syncColorControls($('#objectColor').value); };
['colorHue','colorSaturation','colorLightness'].forEach((id) => { $(`#${id}`).oninput = () => applyObjectColor(hslToHex($('#colorHue').value, $('#colorSaturation').value, $('#colorLightness').value)); $(`#${id}`).onchange = () => rememberColor($('#objectColor').value); });
function chooseSwatch(event) { const button = event.target.closest('[data-color]'); if (!button) return; applyObjectColor(button.dataset.color); rememberColor(button.dataset.color); }
$('#colorPresets').onclick = chooseSwatch; $('#recentColors').onclick = chooseSwatch;
$('#brushWidth').oninput = (event) => { baseBrushWidth = Number(event.target.value); canvas.freeDrawingBrush.width = baseBrushWidth; $('#brushOut').textContent = event.target.value; };
$('#undo').onclick = () => restoreHistory(historyIndex - 1); $('#redo').onclick = () => restoreHistory(historyIndex + 1);
$('#removeObject').onclick = () => { const object = selected(); if (object) canvas.remove(object); };
$('#duplicateObject').onclick = async () => { const object = selected(); if (!object) return; const clone = await object.clone(extraProps); clone.set({ left: object.left + 24, top: object.top + 24 }); addObject(clone, false); };
$('#lockObject').onclick = () => { const object = selected(); if (!object) return; unlockState(object, !object.locked); canvas.discardActiveObject(); canvas.requestRenderAll(); scheduleSave(); };
$('#frontObject').onclick = () => { const object = selected(); if (object) { canvas.bringObjectToFront(object); scheduleSave(); } };
$('#backObject').onclick = () => { const object = selected(); if (object) { canvas.sendObjectToBack(object); addMarginGuide(currentProject().paperStyle); scheduleSave(); } };
$('#addText').onclick = () => addText($('#textInput').value); $('#addHandText').onclick = () => addHumanizedText($('#handTextInput').value);
$('#pencilMode').onclick = () => switchTool('draw'); $('#eraserMode').onclick = () => { switchTool('select'); toast('Selecciona el dibujo y toca Eliminar.'); }; $('#finishDrawing').onclick = () => switchTool('select');
$('#symbolTabs').onclick = (event) => { const button = event.target.closest('[data-category]'); if (button) { activeSymbolCategory = button.dataset.category; renderSymbols(); } };
$('#symbolGrid').onclick = (event) => { const button = event.target.closest('[data-symbol]'); if (button) insertSymbol(button.dataset.symbol); };
$('#symbolSearch').oninput = renderSymbols; $('#chooseImage').onclick = () => $('#imageFile').click(); $('#imageFile').onchange = (event) => { if (event.target.files[0]) readImage(event.target.files[0]); event.target.value = ''; };
$('#makeCover').onclick = applyCover; $('#saveCoverTemplate').onclick = () => { currentProject().coverTemplate = { title: $('#coverTitle').value, student: $('#coverStudent').value, subject: $('#coverSubject').value, teacher: $('#coverTeacher').value, date: $('#coverDate').value, style: $('#coverStyle').value }; scheduleSave(false); toast('Plantilla guardada para esta tarea.'); };
$('#applyPageStyle').onclick = () => resizePages($('#orientation').value, $('#paperStyle').value);
$('#prevPage').onclick = () => loadPage(pageIndex - 1); $('#nextPage').onclick = () => loadPage(pageIndex + 1); $('#addPage').onclick = () => addPage(); $('#deletePage').onclick = () => { if (currentProject().pages.length === 1) return toast('Debe quedar una página.'); if (!confirm('¿Eliminar esta página?')) return; currentProject().pages.splice(pageIndex, 1); pageIndex = Math.min(pageIndex, currentProject().pages.length - 1); loadPage(pageIndex); scheduleSave(false); };
$('#zoomIn').onclick = () => { zoom = Math.min(MAX_ZOOM, zoom + (zoom >= 1 ? .2 : .1)); applyZoom(); }; $('#zoomOut').onclick = () => { zoom = Math.max(MIN_ZOOM, zoom - (zoom > 1 ? .2 : .1)); applyZoom(); };
$('#exportProject').onclick = exportEditable; $('#importProject').onclick = () => $('#projectFile').click(); $('#projectFile').onchange = (event) => { if (event.target.files[0]) importEditable(event.target.files[0]); event.target.value = ''; }; $('#exportPdf').onclick = () => makePdf(false); $('#sharePdf').onclick = () => makePdf(true);
const glyphPad = $('#glyphPad'); glyphPad.onpointerdown = (event) => { glyphDrawing = true; glyphPad.setPointerCapture(event.pointerId); glyphDraft.push([glyphPoint(event)]); drawGlyphPad(); }; glyphPad.onpointermove = (event) => { if (glyphDrawing) { glyphDraft.at(-1).push(glyphPoint(event)); drawGlyphPad(); } }; glyphPad.onpointerup = () => glyphDrawing = false; glyphPad.onpointercancel = () => glyphDrawing = false; $('#glyphUndo').onclick = () => { glyphDraft.pop(); drawGlyphPad(); }; $('#glyphClear').onclick = () => { glyphDraft = []; drawGlyphPad(); }; $('#glyphSave').onclick = saveGlyph; $('#glyphCharacter').oninput = updateGlyphStatus; $('#glyphVariants').onclick = (event) => { const button = event.target.closest('[data-delete-variant]'); if (!button) return; const character = $('#glyphCharacter').value.toLowerCase(); currentProject().glyphs[character].splice(Number(button.dataset.deleteVariant), 1); updateGlyphStatus(); scheduleSave(false); toast('Variante eliminada.'); };
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#colorOverlay').hidden) closeColorPicker(false); if ((event.ctrlKey || event.metaKey) && event.key === 'z') { event.preventDefault(); restoreHistory(event.shiftKey ? historyIndex + 1 : historyIndex - 1); } if ((event.key === 'Delete' || event.key === 'Backspace') && document.activeElement.tagName === 'BODY') { const object = selected(); if (object && !object.locked) canvas.remove(object); } });
window.addEventListener('resize', () => { if (window.innerWidth < 600) zoom = .43; else if (window.innerWidth < 900) zoom = .62; applyZoom(); });

$('#coverDate').valueAsDate = new Date(); updateProjectSelect(); renderSymbols(); renderColorChoices(); setPageDimensions(); loadPage(0); drawGlyphPad(); updateGlyphStatus();
