/* global fabric, jspdf */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORE = 'trazo-projects-v3';
const FONT_STORE = 'trazo-font-library-v1';
const TEMPLATE_STORE = 'trazo-page-templates-v1';
const PAGE = { portrait: [816, 1056], landscape: [1056, 816] };
const extraProps = ['locked', 'trazoType', 'sourceText', 'humanizeAmount', 'originalWidth', 'originalHeight'];
let projects = [];
let sharedGlyphs = {};
let pageTemplates = [];
let currentProjectId = '';
let pageIndex = 0;
let zoom = .72;
let viewRotation = 0;
let activeTool = 'select';
let movingOverflowObject = false;
let history = [];
let historyIndex = -1;
let restoring = false;
let saveTimer;
let glyphDraft = [];
let glyphDrawing = false;
let baseBrushWidth = 5;
let brushMode = 'pencil';
let pinchState = null;
let pinchDiscardUntil = 0;
const touchPointers = new Map();
const MIN_ZOOM = .3;
const MAX_ZOOM = 2.5;
const COLOR_STORE = 'trazo-recent-colors-v1';
const presetColors = ['#183D38','#2E6F68','#2F5DA8','#4E3F8F','#7A3E84','#A33D54','#C6533F','#E47A45','#D29B2B','#F1C84B','#5E8C42','#2C8C75','#111827','#4B5563','#8B8178','#FFFFFF'];
let recentColors = [];
let storageWarningShown = false;
try { recentColors = JSON.parse(localStorage.getItem(COLOR_STORE) || '[]'); } catch { recentColors = []; }
try { sharedGlyphs = JSON.parse(localStorage.getItem(FONT_STORE) || '{}'); } catch { sharedGlyphs = {}; }
try { pageTemplates = JSON.parse(localStorage.getItem(TEMPLATE_STORE) || '[]'); } catch { pageTemplates = []; }

const starterProject = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  name: 'Mi primera tarea', orientation: 'portrait', paperStyle: 'ruled',
  pages: [null], glyphs: {}, coverTemplate: null, updatedAt: Date.now()
});

try { projects = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { projects = []; }
if (!projects.length) projects = [starterProject()];
if (!Object.keys(sharedGlyphs).length) {
  projects.forEach((project) => Object.entries(project.glyphs || {}).forEach(([character, variants]) => {
    (sharedGlyphs[character] ||= []).push(...variants);
    sharedGlyphs[character] = sharedGlyphs[character].slice(0, 30);
  }));
}
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
  const color = normalizeHex(value); if (!color) return false; syncColorControls(color); canvas.freeDrawingBrush.color = brushMode === 'highlighter' ? `${color}55` : color;
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

function templateId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function renderTemplateControls() {
  const covers = pageTemplates.filter((item) => item.type === 'cover');
  const pages = pageTemplates.filter((item) => item.type === 'page');
  $('#coverTemplateSelect').innerHTML = '<option value="">Elige una plantilla</option>' + covers.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  $('#pageTemplateSelect').innerHTML = '<option value="">Elige una plantilla</option>' + pages.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
}

function coverFields() {
  return { title: $('#coverTitle').value, student: $('#coverStudent').value, subject: $('#coverSubject').value, teacher: $('#coverTeacher').value, date: $('#coverDate').value, style: $('#coverStyle').value };
}

function fillCoverFields(fields) {
  $('#coverTitle').value = fields.title || ''; $('#coverStudent').value = fields.student || ''; $('#coverSubject').value = fields.subject || ''; $('#coverTeacher').value = fields.teacher || ''; $('#coverDate').value = fields.date || ''; $('#coverStyle').value = fields.style || 'formal';
}

function saveCoverTemplate() {
  const name = $('#coverTemplateName').value.trim() || $('#coverTitle').value.trim() || 'Mi portada';
  const existing = pageTemplates.find((item) => item.type === 'cover' && item.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.fields = coverFields(); else pageTemplates.push({ id: templateId(), type: 'cover', name, fields: coverFields() });
  renderTemplateControls(); const saved = pageTemplates.find((item) => item.type === 'cover' && item.name.toLowerCase() === name.toLowerCase()); $('#coverTemplateSelect').value = saved.id; scheduleSave(false); toast('Portada guardada para todas tus tareas.');
}

function loadCoverTemplate() {
  const template = pageTemplates.find((item) => item.id === $('#coverTemplateSelect').value && item.type === 'cover');
  if (!template) return toast('Elige una plantilla primero.'); fillCoverFields(template.fields); $('#coverTemplateName').value = template.name; toast('Plantilla cargada.');
}

function deleteTemplate(type, selectId) {
  const id = $(selectId).value; const template = pageTemplates.find((item) => item.id === id && item.type === type);
  if (!template) return toast('Elige una plantilla primero.');
  if (!confirm(`¿Eliminar la plantilla “${template.name}”?`)) return;
  pageTemplates = pageTemplates.filter((item) => item.id !== id); renderTemplateControls(); scheduleSave(false); toast('Plantilla eliminada.');
}

function savePageTemplate() {
  const name = $('#pageTemplateName').value.trim() || `Página ${pageTemplates.filter((item) => item.type === 'page').length + 1}`;
  saveCurrentPage(); const data = { page: JSON.parse(JSON.stringify(currentProject().pages[pageIndex])), orientation: currentProject().orientation, paperStyle: currentProject().paperStyle };
  const existing = pageTemplates.find((item) => item.type === 'page' && item.name.toLowerCase() === name.toLowerCase());
  if (existing) existing.data = data; else pageTemplates.push({ id: templateId(), type: 'page', name, data });
  renderTemplateControls(); const saved = pageTemplates.find((item) => item.type === 'page' && item.name.toLowerCase() === name.toLowerCase()); $('#pageTemplateSelect').value = saved.id; scheduleSave(false); toast('Página guardada como plantilla.');
}

async function insertPageTemplate() {
  const template = pageTemplates.find((item) => item.id === $('#pageTemplateSelect').value && item.type === 'page');
  if (!template) return toast('Elige una plantilla primero.');
  saveCurrentPage(); currentProject().pages.splice(pageIndex + 1, 0, JSON.parse(JSON.stringify(template.data.page))); pageIndex += 1; await loadPage(pageIndex, { saveBefore: false }); canvas.getObjects().filter((object) => object.trazoType !== 'page-guide').forEach(fitObjectInsidePage); canvas.requestRenderAll(); scheduleSave(false); toast('Plantilla insertada como página nueva.');
}

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
  const sideways = viewRotation === 90 || viewRotation === 270;
  shell.style.width = `${(sideways ? canvas.height : canvas.width) * zoom}px`; shell.style.height = `${(sideways ? canvas.width : canvas.height) * zoom}px`;
  const container = shell.querySelector('.canvas-container');
  if (container) {
    const transforms = { 0: `scale(${zoom})`, 90: `translate(${canvas.height * zoom}px,0) rotate(90deg) scale(${zoom})`, 180: `translate(${canvas.width * zoom}px,${canvas.height * zoom}px) rotate(180deg) scale(${zoom})`, 270: `translate(0,${canvas.width * zoom}px) rotate(270deg) scale(${zoom})` };
    container.style.transform = transforms[viewRotation]; container.style.transformOrigin = 'top left';
  }
  $('#zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
}

function syncInteractionMode() {
  const viewOnly = viewRotation !== 0; canvas.isDrawingMode = !viewOnly && activeTool === 'draw'; canvas.selection = !viewOnly && !['draw','erase'].includes(activeTool); canvas.skipTargetFind = viewOnly || activeTool === 'draw';
  $('#canvasShell').classList.toggle('view-rotated', viewOnly); $('#rotationLabel').textContent = `${viewRotation}°`;
}

function rotateView() {
  viewRotation = (viewRotation + 90) % 360; syncInteractionMode(); applyZoom();
  if (viewRotation) toast(`Vista girada ${viewRotation}°. Vuelve a 0° para editar.`); else toast('Vista normal. Ya puedes editar.');
}

function serializePage() { return canvas.toJSON(extraProps); }

function saveCurrentPage() {
  const project = currentProject();
  if (!project) return;
  project.pages[pageIndex] = serializePage(); project.updatedAt = Date.now();
}

function openBackupDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('trazo-backup-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveBackup(snapshot) {
  try {
    const db = await openBackupDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put(snapshot, 'latest');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch { /* Local storage remains the fallback. */ }
}

async function restoreBackupIfNeeded() {
  if (localStorage.getItem(STORE)) return;
  try {
    const db = await openBackupDb(); const snapshot = await new Promise((resolve, reject) => {
      const request = db.transaction('snapshots', 'readonly').objectStore('snapshots').get('latest'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); db.close();
    if (!snapshot?.projects?.length) return;
    projects = snapshot.projects; sharedGlyphs = snapshot.sharedGlyphs || sharedGlyphs; pageTemplates = snapshot.pageTemplates || pageTemplates; currentProjectId = projects[0].id; pageIndex = 0; updateProjectSelect(); renderTemplateControls(); await loadPage(0, { saveBefore: false }); updateGlyphStatus(); toast('Se recuperó la copia automática.');
  } catch { /* No backup is available. */ }
}

function saveAll() {
  saveCurrentPage();
  const snapshot = { projects, sharedGlyphs, pageTemplates, savedAt: Date.now() };
  try {
    localStorage.setItem(STORE, JSON.stringify(projects));
    localStorage.setItem(FONT_STORE, JSON.stringify(sharedGlyphs));
    localStorage.setItem(TEMPLATE_STORE, JSON.stringify(pageTemplates));
  } catch {
    if (!storageWarningShown) toast('La copia local está llena. Guarda un archivo .trazo de respaldo.');
    storageWarningShown = true;
  }
  void saveBackup(snapshot);
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

async function loadPage(index, options = {}) {
  if (options.saveBefore !== false) saveCurrentPage(); pageIndex = Math.max(0, Math.min(index, currentProject().pages.length - 1));
  setPageDimensions(); restoring = true; canvas.clear();
  const page = currentProject().pages[pageIndex];
  if (page) await canvas.loadFromJSON(page);
  applyPaper(); canvas.renderAll(); restoring = false; history = []; historyIndex = -1; recordHistory(); updatePageLabel();
}

function updatePageLabel() {
  $('#pageLabel').textContent = `Página ${pageIndex + 1} de ${currentProject().pages.length}`;
  $('#prevPage').disabled = pageIndex === 0; $('#nextPage').disabled = pageIndex === currentProject().pages.length - 1;
  $('#movePageLeft').disabled = pageIndex === 0; $('#movePageRight').disabled = pageIndex === currentProject().pages.length - 1;
}

async function openProject(id) {
  saveAll(); currentProjectId = id; pageIndex = 0; updateProjectSelect(); await loadPage(0, { saveBefore: false }); updateGlyphStatus();
}

async function createProject(name) {
  saveAll();
  const project = starterProject(); project.name = name || `Tarea ${projects.length + 1}`;
  projects.unshift(project); currentProjectId = project.id; pageIndex = 0; updateProjectSelect(); await loadPage(0, { saveBefore: false }); saveAll(); updateGlyphStatus();
}

function switchTool(tool) {
  activeTool = tool; syncInteractionMode();
  $$('.toolrail button').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
  $$('.panel section').forEach((section) => section.classList.toggle('active', section.dataset.panel === tool));
  if (tool === 'image') $('#imageFile').click();
  if (window.innerWidth <= 820 && tool !== 'select' && tool !== 'image') $('#panel').classList.add('open');
  const hints = { draw: 'Dibuja con el lápiz o el dedo. La presión modifica el grosor cuando está disponible.', select: 'Toca un elemento para moverlo, girarlo o cambiar su tamaño.' };
  $('#toolHint').textContent = viewRotation ? 'La hoja está girada sólo para verla. Vuelve a 0° para editar.' : (hints[tool] || 'Configura la herramienta en el panel lateral.');
}

function setDrawingMode(mode) {
  brushMode = mode; baseBrushWidth = mode === 'highlighter' ? Math.max(14, Number($('#brushWidth').value)) : Number($('#brushWidth').value);
  canvas.freeDrawingBrush.width = baseBrushWidth; canvas.freeDrawingBrush.color = mode === 'highlighter' ? `${normalizeHex($('#objectColor').value)}55` : $('#objectColor').value;
  $('#pencilMode').classList.toggle('active', mode === 'pencil'); $('#highlighterMode').classList.toggle('active', mode === 'highlighter'); $('#eraserMode').classList.remove('active'); switchTool('draw');
}

function selected() { return canvas.getActiveObject(); }
function unlockState(object, locked) {
  object.set({ locked, lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, hasControls: !locked });
}

function addObject(object, center = true) {
  if (center) canvas.centerObject(object); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); scheduleSave();
}

async function addText(text, handwritten = false) {
  const value = text.trim(); if (!value) return toast('Escribe algo primero.');
  const size = Number($('#textSize').value || 28);
  const left = pageLeftMargin(), width = canvas.width - left - 55, options = { width, fontSize: size, fill: $('#objectColor').value, fontFamily: handwritten ? 'Segoe Print, Comic Sans MS, cursive' : 'Arial, sans-serif', lineHeight: handwritten ? paperLineHeight() / size : 1.25, textAlign: $('#textAlign').value, trazoType: handwritten ? 'hand-text' : 'text', editable: true };
  let top = nextWritingTop(); if (top > canvas.height - size * 3 - 55) { await addPage(); top = 64; }
  const chunks = []; let chunk = ''; let available = canvas.height - top - 55;
  for (const token of value.split(/(\s+)/)) {
    const candidate = chunk + token; const probe = new fabric.Textbox(candidate, options);
    if (chunk && probe.height > available) { chunks.push(chunk.trimEnd()); chunk = token.trimStart(); available = canvas.height - 64 - 55; }
    else chunk = candidate;
  }
  if (chunk.trim()) chunks.push(chunk.trimEnd());
  for (let index = 0; index < chunks.length; index += 1) {
    if (index) { await addPage(); top = 64; }
    const object = new fabric.Textbox(chunks[index], options); object.set({ left, top: snapToPaperLine(top) }); addObject(object, false);
  }
  toast(chunks.length > 1 ? `Texto distribuido en ${chunks.length} páginas.` : 'Texto añadido.');
}

function paperLineHeight() { return ['ruled','margin','grid'].includes(currentProject().paperStyle) ? 32 : 46; }
function pageLeftMargin() { return currentProject().paperStyle === 'margin' ? 94 : 58; }
function snapToPaperLine(top) { const line = paperLineHeight(); return ['ruled','margin','grid'].includes(currentProject().paperStyle) ? Math.max(32, Math.round(top / line) * line) : Math.max(45, top); }
function fitObjectInsidePage(object) {
  const left = pageLeftMargin(), right = 55, bottom = 55; let bounds = object.getBoundingRect();
  if (bounds.width > canvas.width - left - right) { const ratio = (canvas.width - left - right) / bounds.width; object.scaleX *= ratio; object.scaleY *= ratio; object.setCoords(); bounds = object.getBoundingRect(); }
  if (bounds.height > canvas.height - 100 - bottom) { const ratio = (canvas.height - 100 - bottom) / bounds.height; object.scaleX *= ratio; object.scaleY *= ratio; object.setCoords(); bounds = object.getBoundingRect(); }
  object.set({ left: Math.min(Math.max(left, object.left), canvas.width - right - bounds.width), top: snapToPaperLine(Math.min(Math.max(32, object.top), canvas.height - bottom - bounds.height)) }); object.setCoords();
}

function addAnnotation() {
  const text = $('#noteInput').value.trim(); if (!text) return toast('Escribe la anotación primero.');
  const styles = { yellow: ['#FFF0A8','#7A5A00'], blue: ['#DDEEFF','#245D72'], pink: ['#F9DDE2','#8A3B4D'], plain: ['#FFFEFA','#183D38'] }, [fill, ink] = styles[$('#noteStyle').value] || styles.yellow;
  const width = Math.min(330, canvas.width - pageLeftMargin() - 70); const box = new fabric.Rect({ width, height: 138, rx: 12, ry: 12, fill, stroke: ink, strokeWidth: 1.5, shadow: 'rgba(35,45,42,.12) 0 5px 12px' });
  const label = new fabric.Textbox(text, { left: 15, top: 14, width: width - 30, fontSize: 21, lineHeight: 1.25, fill: ink, fontFamily: 'Segoe Print, Comic Sans MS, cursive' });
  box.set('height', Math.max(138, label.height + 28));
  const note = new fabric.Group([box, label], { left: pageLeftMargin(), top: snapToPaperLine(96), trazoType: 'annotation' }); fitObjectInsidePage(note); addObject(note, false); $('#noteInput').value = '';
}

const symbolCategories = {
  'Formas': ['○','●','□','■','△','▲','◇','◆','☆','★','⬭','▱'],
  'Flechas': ['→','←','↑','↓','↔','↕','⇒','⇐','⇑','⇓','↗','↘','↙','↖'],
  'Matemáticas': ['+','−','×','÷','=','≠','≈','≤','≥','±','√','∞','π','∑','∫','∆','∠','°','%','½','¼','¾'],
  'Ciencias': ['⚛','⚗','⌁','Ω','α','β','γ','λ','μ','ρ','σ','θ','φ','ψ','⊕','⊙','♀','♂'],
  'Organización': ['✓','✕','!','?','•','◦','①','②','③','④','⑤','☐','☑','⚑','⌂','✎']
};
let activeSymbolCategory = 'Formas';
const symbolKeywords = {
  '○':'circulo círculo contorno', '●':'circulo círculo punto lleno', '□':'cuadro cuadrado caja', '■':'cuadro cuadrado lleno', '△':'triangulo triángulo', '▲':'triangulo triángulo lleno',
  '→':'flecha derecha', '←':'flecha izquierda', '↑':'flecha arriba', '↓':'flecha abajo', '↔':'flecha doble horizontal', '↕':'flecha doble vertical',
  '✓':'palomita correcto verificar', '✕':'equis incorrecto', '☐':'casilla', '☑':'casilla marcada', '⚛':'atomo átomo ciencia', '⚗':'laboratorio ciencia', '∞':'infinito', 'π':'pi matematicas matemáticas'
};
function renderSymbols() {
  $('#symbolTabs').innerHTML = Object.keys(symbolCategories).map((category) => `<button class="${category === activeSymbolCategory ? 'active' : ''}" data-category="${category}">${category}</button>`).join('');
  const query = $('#symbolSearch').value.trim().toLowerCase();
  const pool = query ? Object.entries(symbolCategories).flatMap(([category, symbols]) => symbols.map((symbol) => ({ symbol, category }))) : symbolCategories[activeSymbolCategory].map((symbol) => ({ symbol, category: activeSymbolCategory }));
  const values = pool.filter(({ symbol, category }) => !query || `${symbol} ${category} ${symbolKeywords[symbol] || ''}`.toLowerCase().includes(query)).map(({ symbol }) => symbol);
  $('#symbolGrid').innerHTML = values.map((symbol) => `<button data-symbol="${symbol}">${symbol}</button>`).join('');
}

function insertSymbol(symbol) {
  const object = new fabric.IText(symbol, { fontSize: 74, fill: $('#objectColor').value, fontFamily: 'Arial Unicode MS, Segoe UI Symbol, sans-serif', trazoType: 'symbol' }); addObject(object);
}

function insertDiagram(type) {
  const color = $('#objectColor').value; let object;
  if (type === 'box') object = new fabric.Rect({ width: 260, height: 130, rx: 12, ry: 12, fill: '#fffefa', stroke: color, strokeWidth: 4, trazoType: 'diagram' });
  else if (type === 'circle') object = new fabric.Ellipse({ rx: 120, ry: 70, fill: '#fffefa', stroke: color, strokeWidth: 4, trazoType: 'diagram' });
  else if (type === 'line') object = new fabric.Line([0, 0, 260, 0], { stroke: color, strokeWidth: 5, strokeLineCap: 'round', trazoType: 'diagram' });
  else {
    const line = new fabric.Line([0, 30, 235, 30], { stroke: color, strokeWidth: 5, strokeLineCap: 'round', selectable: false });
    const head = new fabric.Triangle({ left: 245, top: 30, width: 27, height: 32, fill: color, angle: 90, originX: 'center', originY: 'center', selectable: false });
    object = new fabric.Group([line, head], { trazoType: 'diagram' });
  }
  addObject(object);
}

function readImage(file) {
  const reader = new FileReader(); reader.onload = async () => {
    const image = await fabric.FabricImage.fromURL(reader.result);
    image.set({ trazoType: 'image', originalWidth: image.width, originalHeight: image.height }); image.scaleToWidth(Math.min(430, canvas.width * .55)); addObject(image); toast('Imagen añadida.');
  }; reader.readAsDataURL(file);
}

function cropSelectedImage(square) {
  const image = selected(); if (!image || image.trazoType !== 'image') return toast('Selecciona una imagen primero.');
  const originalWidth = image.originalWidth || image._element?.naturalWidth || image.width; const originalHeight = image.originalHeight || image._element?.naturalHeight || image.height;
  image.set({ originalWidth, originalHeight });
  if (square) { const side = Math.min(originalWidth, originalHeight); image.set({ cropX: (originalWidth - side) / 2, cropY: (originalHeight - side) / 2, width: side, height: side }); }
  else image.set({ cropX: 0, cropY: 0, width: originalWidth, height: originalHeight });
  image.setCoords(); canvas.requestRenderAll(); scheduleSave(); toast(square ? 'Recorte cuadrado aplicado.' : 'Imagen restaurada.');
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

async function addPage(auto = false) {
  saveCurrentPage(); currentProject().pages.push(null); pageIndex = currentProject().pages.length - 1; await loadPage(pageIndex, { saveBefore: false }); scheduleSave(false); if (auto) toast('Se creó una página nueva automáticamente.');
}

async function duplicatePage() {
  saveCurrentPage(); const copy = JSON.parse(JSON.stringify(currentProject().pages[pageIndex])); currentProject().pages.splice(pageIndex + 1, 0, copy); pageIndex += 1; await loadPage(pageIndex, { saveBefore: false }); scheduleSave(false); toast('Página duplicada.');
}

async function movePage(direction) {
  const target = pageIndex + direction; if (target < 0 || target >= currentProject().pages.length) return;
  saveCurrentPage(); [currentProject().pages[pageIndex], currentProject().pages[target]] = [currentProject().pages[target], currentProject().pages[pageIndex]]; pageIndex = target; await loadPage(pageIndex, { saveBefore: false }); scheduleSave(false); toast('Página reordenada.');
}

async function resizePages(orientation, style) {
  saveCurrentPage(); currentProject().orientation = orientation; currentProject().paperStyle = style; await loadPage(pageIndex, { saveBefore: false }); scheduleSave(false); toast('Formato aplicado.');
}

function projectPayload() { saveCurrentPage(); return { type: 'trazo-project', version: 4, exportedAt: new Date().toISOString(), project: currentProject(), fontLibrary: sharedGlyphs, templates: pageTemplates }; }
function blobToBase64(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { if (typeof reader.result !== 'string') return reject(new Error('No se pudo leer el archivo')); resolve(reader.result.split(',')[1]); }; reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }

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
  saveCurrentPage(); const project = currentProject(); const original = pageIndex; const orientation = project.orientation === 'landscape' ? 'landscape' : 'portrait';
  try {
    const pdf = new jspdf.jsPDF({ orientation, unit: 'pt', format: 'letter', compress: true }); const multiplier = project.pages.length > 12 ? 1.25 : 1.7;
    for (let index = 0; index < project.pages.length; index += 1) {
      $('#saveState').textContent = `PDF ${index + 1}/${project.pages.length}`; await loadPage(index); canvas.discardActiveObject(); canvas.renderAll();
      if (index) pdf.addPage('letter', orientation);
      const data = canvas.toDataURL({ format: 'png', multiplier }); const width = orientation === 'landscape' ? 792 : 612, height = orientation === 'landscape' ? 612 : 792;
      pdf.addImage(data, 'PNG', 0, 0, width, height, undefined, 'FAST'); await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const blob = pdf.output('blob'); await deliverBlob(blob, `${safeName(project.name)}.pdf`, share); toast(share ? 'Elige WhatsApp, Drive u otra aplicación.' : 'PDF guardado.');
  } catch { toast('No se pudo crear el PDF. Reduce las imágenes o exporta menos páginas.'); }
  finally { await loadPage(original); $('#saveState').textContent = 'Guardado'; }
}

function safeName(name) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'tarea'; }

async function importEditable(file) {
  try { const payload = JSON.parse(await file.text()); if (payload.type !== 'trazo-project' || !payload.project) throw new Error(); saveAll(); const project = payload.project; project.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); project.name = `${project.name} (importada)`; Object.entries(payload.fontLibrary || project.glyphs || {}).forEach(([character, variants]) => { (sharedGlyphs[character] ||= []).push(...variants); sharedGlyphs[character] = sharedGlyphs[character].slice(-30); }); (payload.templates || []).forEach((template) => { if (!pageTemplates.some((item) => item.type === template.type && item.name === template.name)) pageTemplates.push({ ...template, id: templateId() }); }); projects.unshift(project); currentProjectId = project.id; pageIndex = 0; updateProjectSelect(); renderTemplateControls(); await loadPage(0, { saveBefore: false }); saveAll(); updateGlyphStatus(); toast('Tarea, fuente y plantillas importadas.'); } catch { toast('El archivo .trazo no es válido.'); }
}

function drawGlyphPad() {
  const pad = $('#glyphPad'), context = pad.getContext('2d'); context.fillStyle = '#fffefa'; context.fillRect(0, 0, pad.width, pad.height); context.setLineDash([6, 8]); context.strokeStyle = '#d8d0c4'; context.lineWidth = 1; [90, 240, 315].forEach((y) => { context.beginPath(); context.moveTo(0, y); context.lineTo(pad.width, y); context.stroke(); }); context.setLineDash([]); context.strokeStyle = $('#objectColor').value; context.lineWidth = 8; context.lineCap = 'round'; context.lineJoin = 'round'; glyphDraft.forEach((stroke) => { context.beginPath(); stroke.forEach((point, index) => index ? context.lineTo(point.x * pad.width / 100, point.y * pad.height / 100) : context.moveTo(point.x * pad.width / 100, point.y * pad.height / 100)); context.stroke(); });
}

function glyphPoint(event) { const rect = $('#glyphPad').getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }; }
function glyphPreview(variant) { const lines = variant.map((stroke) => `<polyline points="${stroke.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`).join(''); return `<svg viewBox="0 0 100 100" aria-hidden="true">${lines}</svg>`; }
function glyphCharacter() { return [...$('#glyphCharacter').value].at(-1) || 'a'; }
function variantStrokes(variant) { return Array.isArray(variant) ? variant : (variant?.strokes || []); }
function updateGlyphStatus() { const character = glyphCharacter(); $('#glyphCharacter').value = character; const variants = sharedGlyphs[character] || []; const count = variants.length; $('#glyphCount').textContent = `${count}/10`; $('#glyphProgress').style.width = `${Math.min(100, count * 10)}%`; $('#glyphMessage').textContent = count >= 10 ? 'Lista y disponible en todas tus tareas.' : `Faltan ${10 - count} muestras recomendadas.`; $('#glyphVariants').innerHTML = variants.map((variant, index) => `<button class="glyph-variant" data-delete-variant="${index}" title="Eliminar variante ${index + 1}"><b>#${index + 1}</b>${glyphPreview(variantStrokes(variant))}<i>×</i></button>`).join(''); }

function saveGlyph() { if (!glyphDraft.some((stroke) => stroke.length > 1)) return toast('Dibuja la letra primero.'); const character = glyphCharacter(); (sharedGlyphs[character] ||= []).push({ strokes: glyphDraft, createdAt: Date.now() }); glyphDraft = []; drawGlyphPad(); updateGlyphStatus(); scheduleSave(false); }

function accentFor(character) {
  const parts = character.normalize('NFD');
  if (parts.length < 2) return null;
  const mark = [...parts].slice(1).find((part) => ['\u0301','\u0300','\u0303','\u0308'].includes(part));
  return mark ? { base: parts[0], mark } : null;
}

function makeAccent(mark, width, size, color) {
  const common = { stroke: color, strokeWidth: Math.max(1.6, size * .075), strokeLineCap: 'round', selectable: false, evented: false };
  if (mark === '\u0301') return new fabric.Line([width * .43, size * .14, width * .66, 0], common);
  if (mark === '\u0300') return new fabric.Line([width * .34, 0, width * .57, size * .14], common);
  if (mark === '\u0308') return new fabric.Group([
    new fabric.Circle({ left: width * .30, top: size * .04, radius: size * .045, fill: color, selectable: false }),
    new fabric.Circle({ left: width * .62, top: size * .04, radius: size * .045, fill: color, selectable: false })
  ], { selectable: false, evented: false });
  return new fabric.Path(`M ${width * .24} ${size * .10} Q ${width * .40} 0 ${width * .52} ${size * .08} T ${width * .78} ${size * .06}`, { ...common, fill: '' });
}

function makeHumanizedCharacter(character, size, glyphs, amount) {
  const exactVariants = glyphs[character]; const composedAccent = exactVariants?.length ? null : accentFor(character); const variants = exactVariants || (composedAccent ? glyphs[composedAccent.base] : null); let object, advance;
  if (variants?.length) {
    const variant = variantStrokes(variants[Math.floor(Math.random() * variants.length)]); const points = variant.flat();
    const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x)), minY = Math.min(...points.map((point) => point.y)), maxY = Math.max(...points.map((point) => point.y));
    const sourceWidth = Math.max(1, maxX - minX), sourceHeight = Math.max(1, maxY - minY); const variation = 1 + (Math.random() - .5) * .026 * amount; let scale = size * .86 * variation / sourceHeight; scale = Math.min(scale, size * .74 / sourceWidth);
    if (/[.,;:·]/.test(character)) scale = Math.min(scale, size * .16 / sourceHeight, size * .18 / sourceWidth);
    if (/[-–—_]/.test(character)) scale = Math.min(scale, size * .42 / sourceWidth, size * .13 / sourceHeight);
    const paths = variant.map((stroke) => new fabric.Polyline(stroke.map((point) => ({ x: point.x - minX, y: point.y - minY })), { fill: '', stroke: $('#objectColor').value, strokeWidth: 4.7 / scale, strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false }));
    const renderedWidth = sourceWidth * scale, renderedHeight = sourceHeight * scale;
    const base = new fabric.Group(paths, { left: 0, top: composedAccent ? size * .17 : 0, scaleX: scale, scaleY: scale, selectable: false, evented: false });
    object = composedAccent ? new fabric.Group([base, makeAccent(composedAccent.mark, renderedWidth, size, $('#objectColor').value)], { left: 0, top: size - renderedHeight - size * .17, selectable: false }) : base;
    if (!composedAccent) object.set({ left: 0, top: /[.,;:·]/.test(character) ? size * .78 : (/[-–—_]/.test(character) ? size * .48 : size - renderedHeight) });
    advance = /[.,;:·]/.test(character) ? size * .24 : Math.max(size * .40, renderedWidth + size * .075);
  } else {
    object = new fabric.Text(character, { left: 0, top: 0, fontSize: size, fill: $('#objectColor').value, fontFamily: 'Segoe Print, Comic Sans MS, cursive', selectable: false }); advance = object.width + size * .045;
  }
  object.angle = (Math.random() - .5) * 1.25 * amount; object.top += (Math.random() - .5) * 1.5 * amount; return { object, advance };
}

function nextWritingTop() {
  const bottoms = canvas.getObjects().filter((object) => object.trazoType !== 'page-guide').map((object) => { const bounds = object.getBoundingRect(); return bounds.top + bounds.height; });
  return snapToPaperLine(Math.max(64, (bottoms.length ? Math.max(...bottoms) : 54) + paperLineHeight()));
}

async function addHumanizedText(value) {
  if (!value.trim()) return toast('Escribe algo primero.');
  const lineHeight = paperLineHeight(), size = lineHeight * .76, left = pageLeftMargin(), maxWidth = canvas.width - left - 55, glyphs = sharedGlyphs, amount = Number($('#humanize').value) / 100;
  let startTop = nextWritingTop(); if (startTop > canvas.height - lineHeight * 2 - 55) { saveCurrentPage(); currentProject().pages.push(null); pageIndex = currentProject().pages.length - 1; await loadPage(pageIndex, { saveBefore: false }); startTop = 64; }
  const pages = [[]]; let page = 0, row = 0, x = 0;
  const capacity = (pageNumber) => Math.max(1, Math.floor((canvas.height - (pageNumber ? 64 : startTop) - 55) / lineHeight));
  const newLine = () => { x = 0; row += 1; if (row >= capacity(page)) { page += 1; row = 0; pages[page] = []; } };
  const tokens = value.replace(/\r/g, '').split(/(\s+)/);
  tokens.forEach((token) => {
    if (!token) return;
    if (/^\s+$/.test(token)) { [...token].forEach((character) => { if (character === '\n') newLine(); else if (x) x += size * (.37 + (Math.random() - .5) * .08 * amount); }); return; }
    const letters = [...token].map((character) => makeHumanizedCharacter(character, size, glyphs, amount)); const wordWidth = letters.reduce((sum, letter) => sum + letter.advance, 0);
    if (x && x + wordWidth > maxWidth) newLine();
    letters.forEach(({ object, advance }) => { if (x && x + advance > maxWidth) newLine(); object.set({ left: x, top: row * lineHeight + object.top }); pages[page].push(object); x += advance; });
  });
  for (let index = 0; index < pages.length; index += 1) {
    if (index) { saveCurrentPage(); currentProject().pages.push(null); pageIndex = currentProject().pages.length - 1; await loadPage(pageIndex, { saveBefore: false }); }
    if (!pages[index].length) continue;
    const group = new fabric.Group(pages[index], { left, top: index ? 64 : startTop, trazoType: 'humanized-text', sourceText: value, humanizeAmount: amount }); canvas.add(group); canvas.setActiveObject(group); canvas.requestRenderAll(); saveCurrentPage();
  }
  scheduleSave(); toast(pages.length > 1 ? `Texto acomodado en ${pages.length} páginas.` : 'Texto alineado a los renglones y al margen.');
}

canvas.on('object:added', () => scheduleSave()); canvas.on('object:removed', () => scheduleSave()); canvas.on('object:modified', (event) => {
  const object = event.target; if (!object || object.trazoType === 'page-guide' || movingOverflowObject) return scheduleSave();
  const alignable = ['humanized-text','hand-text','text','annotation'].includes(object.trazoType); if (alignable) fitObjectInsidePage(object);
  const bounds = object.getBoundingRect();
  if (bounds.top + bounds.height > canvas.height + 20) {
    movingOverflowObject = true; canvas.remove(object); saveCurrentPage(); currentProject().pages.push(null); pageIndex = currentProject().pages.length - 1;
    void loadPage(pageIndex, { saveBefore: false }).then(() => { object.set({ top: 64, left: pageLeftMargin() }); fitObjectInsidePage(object); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); saveCurrentPage(); toast('El elemento pasó a una sola página nueva.'); }).catch(() => toast('No se pudo mover el elemento a otra página.')).finally(() => { movingOverflowObject = false; });
  } else scheduleSave();
});
canvas.on('path:created', (event) => { if (pinchState || performance.now() < pinchDiscardUntil) { canvas.remove(event.path); canvas.requestRenderAll(); return; } event.path.set({ trazoType: 'drawing' }); canvas.freeDrawingBrush.width = baseBrushWidth; scheduleSave(); });
canvas.on('mouse:down', (event) => {
  if (activeTool !== 'erase' || !event.target) return;
  if (event.target.trazoType === 'drawing') { canvas.remove(event.target); canvas.discardActiveObject(); canvas.requestRenderAll(); scheduleSave(); toast('Trazo borrado.'); }
  else toast('El borrador de trazo sólo elimina dibujos.');
});
canvas.on('selection:created', syncSelection); canvas.on('selection:updated', syncSelection);
function syncSelection() { const object = selected(); if (object?.fill && typeof object.fill === 'string') syncColorControls(object.fill); $('#lockObject').textContent = object?.locked ? 'Desbloquear' : 'Bloquear'; }

$$('.toolrail button').forEach((button) => button.onclick = () => switchTool(button.dataset.tool));
$('#panelClose').onclick = () => $('#panel').classList.remove('open');
$('#projectSelect').onchange = (event) => { void openProject(event.target.value); };
$('#newProject').onclick = async () => { const name = prompt('Nombre de la nueva tarea:'); if (name !== null) await createProject(name.trim()); };
$('#duplicateProject').onclick = async () => { saveAll(); const copy = JSON.parse(JSON.stringify(currentProject())); copy.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); copy.name += ' (copia)'; projects.unshift(copy); currentProjectId = copy.id; pageIndex = 0; updateProjectSelect(); await loadPage(0, { saveBefore: false }); saveAll(); updateGlyphStatus(); };
$('#deleteProject').onclick = async () => { if (projects.length === 1) return toast('Debe quedar al menos una tarea.'); if (!confirm(`¿Eliminar “${currentProject().name}”?`)) return; saveAll(); projects = projects.filter((project) => project.id !== currentProjectId); currentProjectId = projects[0].id; pageIndex = 0; updateProjectSelect(); await loadPage(0, { saveBefore: false }); saveAll(); updateGlyphStatus(); };
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
$('#addText').onclick = () => { void addText($('#textInput').value); }; $('#addHandText').onclick = () => { void addHumanizedText($('#handTextInput').value); };
$('#addNote').onclick = addAnnotation;
$('#pencilMode').onclick = () => setDrawingMode('pencil'); $('#highlighterMode').onclick = () => setDrawingMode('highlighter'); $('#eraserMode').onclick = () => { activeTool = 'erase'; brushMode = 'eraser'; syncInteractionMode(); $('#pencilMode').classList.remove('active'); $('#highlighterMode').classList.remove('active'); $('#eraserMode').classList.add('active'); toast('Toca un trazo para borrarlo.'); }; $('#finishDrawing').onclick = () => switchTool('select');
$('#symbolTabs').onclick = (event) => { const button = event.target.closest('[data-category]'); if (button) { activeSymbolCategory = button.dataset.category; renderSymbols(); } };
$('#symbolGrid').onclick = (event) => { const button = event.target.closest('[data-symbol]'); if (button) insertSymbol(button.dataset.symbol); };
$$('[data-diagram]').forEach((button) => button.onclick = () => insertDiagram(button.dataset.diagram));
$('#symbolSearch').oninput = renderSymbols; $('#chooseImage').onclick = () => $('#imageFile').click(); $('#imageFile').onchange = (event) => { if (event.target.files[0]) readImage(event.target.files[0]); event.target.value = ''; };
$('#cropImageSquare').onclick = () => cropSelectedImage(true); $('#restoreImageCrop').onclick = () => cropSelectedImage(false);
$('#makeCover').onclick = applyCover; $('#saveCoverTemplate').onclick = saveCoverTemplate; $('#loadCoverTemplate').onclick = loadCoverTemplate; $('#deleteCoverTemplate').onclick = () => deleteTemplate('cover', '#coverTemplateSelect');
$('#applyPageStyle').onclick = () => { void resizePages($('#orientation').value, $('#paperStyle').value); };
$('#savePageTemplate').onclick = savePageTemplate; $('#insertPageTemplate').onclick = () => { void insertPageTemplate(); }; $('#deletePageTemplate').onclick = () => deleteTemplate('page', '#pageTemplateSelect');
$('#rotateView').onclick = rotateView;
$('#prevPage').onclick = () => { void loadPage(pageIndex - 1); }; $('#nextPage').onclick = () => { void loadPage(pageIndex + 1); }; $('#addPage').onclick = () => { void addPage(); }; $('#duplicatePage').onclick = () => { void duplicatePage(); }; $('#movePageLeft').onclick = () => { void movePage(-1); }; $('#movePageRight').onclick = () => { void movePage(1); }; $('#deletePage').onclick = async () => { if (currentProject().pages.length === 1) return toast('Debe quedar una página.'); if (!confirm('¿Eliminar esta página?')) return; currentProject().pages.splice(pageIndex, 1); pageIndex = Math.min(pageIndex, currentProject().pages.length - 1); await loadPage(pageIndex, { saveBefore: false }); scheduleSave(false); };
$('#zoomIn').onclick = () => { zoom = Math.min(MAX_ZOOM, zoom + (zoom >= 1 ? .2 : .1)); applyZoom(); }; $('#zoomOut').onclick = () => { zoom = Math.max(MIN_ZOOM, zoom - (zoom > 1 ? .2 : .1)); applyZoom(); };
$('#exportProject').onclick = () => { void exportEditable(); }; $('#importProject').onclick = () => $('#projectFile').click(); $('#projectFile').onchange = (event) => { if (event.target.files[0]) void importEditable(event.target.files[0]); event.target.value = ''; }; $('#exportPdf').onclick = () => { void makePdf(false); }; $('#sharePdf').onclick = () => { void makePdf(true); };
const glyphPad = $('#glyphPad'); glyphPad.onpointerdown = (event) => { glyphDrawing = true; glyphPad.setPointerCapture(event.pointerId); glyphDraft.push([glyphPoint(event)]); drawGlyphPad(); }; glyphPad.onpointermove = (event) => { if (glyphDrawing) { glyphDraft.at(-1).push(glyphPoint(event)); drawGlyphPad(); } }; glyphPad.onpointerup = () => glyphDrawing = false; glyphPad.onpointercancel = () => glyphDrawing = false; $('#glyphUndo').onclick = () => { glyphDraft.pop(); drawGlyphPad(); }; $('#glyphClear').onclick = () => { glyphDraft = []; drawGlyphPad(); }; $('#glyphSave').onclick = saveGlyph; $('#glyphCharacter').oninput = updateGlyphStatus; $('#glyphVariants').onclick = (event) => { const button = event.target.closest('[data-delete-variant]'); if (!button) return; const character = glyphCharacter(); sharedGlyphs[character].splice(Number(button.dataset.deleteVariant), 1); updateGlyphStatus(); scheduleSave(false); toast('Variante eliminada.'); };
window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#colorOverlay').hidden) closeColorPicker(false); if ((event.ctrlKey || event.metaKey) && event.key === 'z') { event.preventDefault(); void restoreHistory(event.shiftKey ? historyIndex + 1 : historyIndex - 1); } if ((event.key === 'Delete' || event.key === 'Backspace') && document.activeElement.tagName === 'BODY') { const object = selected(); if (object && !object.locked) canvas.remove(object); } });
window.addEventListener('resize', () => { if (window.innerWidth < 600) zoom = .43; else if (window.innerWidth < 900) zoom = .62; applyZoom(); });

$('#coverDate').valueAsDate = new Date(); updateProjectSelect(); renderSymbols(); renderColorChoices(); renderTemplateControls(); setPageDimensions(); void loadPage(0); void restoreBackupIfNeeded(); drawGlyphPad(); updateGlyphStatus();
