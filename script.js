// --- CONSTANTS & PRESETS ---
const PRESET_LIBRARY = {
    asphalt: { id: 'ASPHALT', friction: '0.98', damping: '0', extType: 'NULL', wav: '', dirtAdditive: '0', vibeGain: '0', vibeLen: '0' },
    dirt_compact: { id: 'DIRT_COMPACT', friction: '0.70', damping: '0', extType: 'DIRT', wav: 'dirt.wav', dirtAdditive: '0.5', vibeGain: '0.05', vibeLen: '0.1' },
    gravel_firm: { id: 'GRAVEL_FIRM', friction: '0.75', damping: '0.01', extType: 'GRAVEL', modifier: 'REGULAR', preset: '1', wav: 'gravel.wav', dirtAdditive: '0.7', vibeGain: '0.1', vibeLen: '0.2' },
    gravel_med: { id: 'GRAVEL_REGULAR', friction: '0.65', damping: '0.02', extType: 'GRAVEL', modifier: 'REGULAR', preset: '2', wav: 'gravel.wav', dirtAdditive: '0.7', vibeGain: '0.15', vibeLen: '0.25' },
    gravel_loose: { id: 'GRAVEL_LOOSE', friction: '0.55', damping: '0.03', extType: 'GRAVEL', modifier: 'REGULAR', preset: '3', wav: 'gravel.wav', dirtAdditive: '0.7', vibeGain: '0.2', vibeLen: '0.3' },
    sand_regular: { id: 'SAND_REGULAR', friction: '0.50', damping: '0.02', extType: 'SAND', modifier: 'REGULAR', wav: 'sand.wav', dirtAdditive: '0.7', vibeGain: '0.1', vibeLen: '0.2' },
    sand_loose: { id: 'SAND_LOOSE', friction: '0.45', damping: '0.03', extType: 'SAND', modifier: 'LOOSE', wav: 'sand.wav', dirtAdditive: '0.7', vibeGain: '0.15', vibeLen: '0.25' },
    snow_regular: { id: 'SNOW_REGULAR', friction: '0.35', damping: '0.02', extType: 'SNOW', modifier: 'REGULAR', wav: 'snow.wav', dirtAdditive: '0.1', vibeGain: '0.05', vibeLen: '0.1' },
    snow_loose: { id: 'SNOW_LOOSE', friction: '0.25', damping: '0.03', extType: 'SNOW', modifier: 'LOOSE', wav: 'snow.wav', dirtAdditive: '0.2', vibeGain: '0.08', vibeLen: '0.15' },
    ice: { id: 'ICE', friction: '0.15', damping: '0.01', extType: 'ICE', modifier: 'REGULAR', wav: '', dirtAdditive: '0', vibeGain: '0.02', vibeLen: '0.05' }
};

// --- STATE ---
let allTracks = [];
let filteredTracks = [];
let selectedTrack = null;
let currentVariant = null;
let surfaces = [];

// --- UI ELEMENTS ---
const el = {
    btnPath: document.getElementById('btnPath'),
    btnFile: document.getElementById('btnFile'),
    legacyInput: document.getElementById('legacyInput'),
    searchInput: document.getElementById('searchInput'),
    trackSelect: document.getElementById('trackSelect'),
    statusLabel: document.getElementById('statusLabel'),
    layoutTabs: document.getElementById('layoutTabs'),
    surfacesList: document.getElementById('surfacesList'),
    btnApply: document.getElementById('btnApply'),
    presetBtns: document.querySelectorAll('.btn-preset'),
    localWarning: document.getElementById('localWarning')
};

// --- INITIALIZATION ---
function init() {
    checkProtocol();
    setupEventListeners();
}

function checkProtocol() {
    if (window.location.protocol === 'file:') {
        el.localWarning.classList.remove('hidden');
    }
}

function setupEventListeners() {
    el.btnPath.addEventListener('click', handleOpenFolder);
    el.btnFile.addEventListener('click', handleOpenFile);
    el.legacyInput.addEventListener('change', handleLegacyFile);
    el.searchInput.addEventListener('input', handleSearch);
    el.trackSelect.addEventListener('change', handleTrackSelection);
    el.btnApply.addEventListener('click', handleSave);

    el.presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            el.presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const presetId = btn.getAttribute('data-preset');
            applyPreset(presetId);
        });
    });
}

// --- CORE LOGIC ---
async function handleOpenFile() {
    try {
        const [fileHandle] = await window.showOpenFilePicker({
            types: [{ description: 'INI Files', accept: { 'text/plain': ['.ini'] } }],
            multiple: false
        });
        await processSingleFile(fileHandle);
    } catch (err) {
        console.error(err);
        if (err.name === 'SecurityError' || err.name === 'AbortError') {
            updateStatus('SYSTEM BLOCKED: OPENING LEGACY...');
            el.legacyInput.click();
        }
    }
}

async function handleLegacyFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    updateStatus('LOADING (LEGACY)...');

    const reader = new FileReader();
    reader.onload = async (event) => {
        const text = event.target.result;

        const virtualTrack = {
            id: 'legacy',
            displayName: 'LEGACY FILE',
            variants: [{
                id: 'legacy_v',
                label: 'LEGACY',
                fileName: file.name,
                fileHandle: null,
                parentHandle: null
            }]
        };

        allTracks = [virtualTrack];
        filteredTracks = [virtualTrack];
        renderSelect();
        el.trackSelect.value = 'legacy';

        currentVariant = virtualTrack.variants[0];
        surfaces = parseIni(text);
        renderList();
        updateStatus('LOADED. CLICK APPLY TO DOWNLOAD.');
        el.btnApply.textContent = 'DOWNLOAD MODIFIED';
        el.btnApply.disabled = false;
        renderTabs();
    };
    reader.readAsText(file);
}

async function processSingleFile(fileHandle) {
    updateStatus('LOADING FILE...');
    const virtualTrack = {
        id: 'manual',
        displayName: 'MANUAL FILE',
        variants: [{
            id: 'manual_v',
            label: 'MANUAL',
            fileHandle: fileHandle,
            parentHandle: null
        }]
    };

    allTracks = [virtualTrack];
    filteredTracks = [virtualTrack];
    renderSelect();
    el.trackSelect.value = 'manual';
    await handleTrackSelection();
    el.btnApply.textContent = 'SAVE FILE';
    updateStatus('FILE READY');
}

async function handleOpenFolder() {
    try {
        const rootHandle = await window.showDirectoryPicker();
        updateStatus('SCANNING...');

        let tracksHandle = null;

        if (rootHandle.name.toLowerCase() === 'tracks') {
            tracksHandle = rootHandle;
        } else if (await isTrackFolder(rootHandle)) {
            const track = await parseTrackEntry(rootHandle.name, rootHandle);
            if (track) {
                allTracks = [track];
                filteredTracks = [track];
                renderSelect();
                el.trackSelect.value = track.id;
                await handleTrackSelection();
                updateStatus('SINGLE TRACK LOADED');
            }
            return;
        } else {
            try {
                const content = await rootHandle.getDirectoryHandle('content');
                tracksHandle = await content.getDirectoryHandle('tracks');
            } catch {
                tracksHandle = rootHandle;
            }
        }

        const list = [];
        for await (const [name, entry] of tracksHandle.entries()) {
            if (entry.kind === 'directory') {
                const track = await parseTrackEntry(name, entry);
                if (track) list.push(track);
            }
        }

        allTracks = list;
        handleSearch();
        updateStatus(`${allTracks.length} TRACKS LOADED`);
    } catch (err) {
        console.error(err);
        if (err.name === 'AbortError' || err.name === 'SecurityError') {
            updateStatus('ERROR: Browser blocked the folder. USE [FILE] INSTEAD.');
        } else {
            updateStatus('ERROR ACCESSING FOLDER');
        }
    }
}

async function isTrackFolder(handle) {
    try {
        await handle.getDirectoryHandle('data');
        return true;
    } catch {
        return false;
    }
}

async function parseTrackEntry(name, entry) {
    const track = { id: name, displayName: name, variants: [], handle: entry };

    try {
        const uiDir = await entry.getDirectoryHandle('ui');
        const uiFile = await uiDir.getFileHandle('ui_track.json');
        const file = await uiFile.getFile();
        const json = JSON.parse(await file.text());
        track.displayName = json.name || name;
    } catch { }

    try {
        const dataDir = await entry.getDirectoryHandle('data');
        const iniFile = await dataDir.getFileHandle('surfaces.ini');
        track.variants.push({ id: 'data', label: 'DEFAULT', fileHandle: iniFile, parentHandle: dataDir });
    } catch { }

    for await (const [subName, subEntry] of entry.entries()) {
        if (subEntry.kind === 'directory' && !['ui', 'data', 'ai', 'skins'].includes(subName)) {
            try {
                const vData = await subEntry.getDirectoryHandle('data');
                const vIni = await vData.getFileHandle('surfaces.ini');
                track.variants.push({ id: subName, label: subName.toUpperCase(), fileHandle: vIni, parentHandle: vData });
            } catch { }
        }
    }

    return track.variants.length > 0 ? track : null;
}


function handleSearch() {
    const term = el.searchInput.value.toLowerCase();
    filteredTracks = allTracks.filter(t => t.displayName.toLowerCase().includes(term) || t.id.toLowerCase().includes(term));
    renderSelect();
}

function renderSelect() {
    el.trackSelect.innerHTML = '<option value="">-- SELECT TRACK --</option>';
    filteredTracks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.displayName} (${t.id})`;
        el.trackSelect.appendChild(opt);
    });
}

async function handleTrackSelection() {
    const trackId = el.trackSelect.value;
    selectedTrack = allTracks.find(t => t.id === trackId);

    if (!selectedTrack) {
        el.surfacesList.innerHTML = '<div class="empty-state"><p>Waiting for selection...</p></div>';
        el.layoutTabs.innerHTML = '';
        return;
    }

    renderTabs();
    await loadVariant(selectedTrack.variants[0]);
}

function renderTabs() {
    el.layoutTabs.innerHTML = '';
    selectedTrack.variants.forEach(v => {
        const btn = document.createElement('button');
        btn.className = `tab-btn ${currentVariant?.id === v.id ? 'active' : ''}`;
        btn.textContent = v.label;
        btn.onclick = () => loadVariant(v);
        el.layoutTabs.appendChild(btn);
    });
}

async function loadVariant(variant) {
    currentVariant = variant;
    updateStatus(`READING ${variant.label}...`);
    renderTabs();

    const file = await variant.fileHandle.getFile();
    const text = await file.text();

    surfaces = parseIni(text);
    renderList();
    updateStatus(`${surfaces.length} SURFACES`);
    el.btnApply.disabled = false;
}

function parseIni(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let current = null;

    lines.forEach(line => {
        const match = line.match(/^\[(SURFACE_\d+)\]/i);
        if (match) {
            if (current) result.push(current);
            current = {
                id: match[1].toUpperCase(),
                key: '', friction: '', isValid: '1',
                rawLines: [line],
                initialRawLines: [line],
                selected: false
            };
        } else if (current) {
            current.rawLines.push(line);
            current.initialRawLines.push(line);
            const [k, v] = line.split('=');
            if (k && v) {
                const key = k.trim().toUpperCase();
                const val = v.trim();
                if (key === 'KEY') current.key = val;
                if (key === 'FRICTION') current.friction = val;
                if (key === 'IS_VALID_TRACK') current.isValid = val;
            }
        }
    });
    if (current) result.push(current);
    return result;
}

function renderList() {
    el.surfacesList.innerHTML = '';
    surfaces.forEach(s => {
        const div = document.createElement('div');
        div.className = `surface-item ${s.selected ? 'selected' : ''}`;

        const isModified = JSON.stringify(s.rawLines) !== JSON.stringify(s.initialRawLines);

        div.innerHTML = `
            <div class="surface-info">
                <span class="surface-id">${s.id} ${isModified ? '<span class="mod-tag">MOD</span>' : ''}</span>
                <span>KEY=<span class="surface-val">${s.key || '---'}</span></span>
                <span>FRIC=<span class="surface-val">${s.friction || '---'}</span></span>
            </div>
            <div class="surface-actions">
                ${isModified ? `<button class="btn-restore" title="Restore Original">↺</button>` : ''}
                <div class="check-indicator ${s.selected ? 'checked' : ''}">
                    ${s.selected ? '✓' : ''}
                </div>
            </div>
        `;

        div.onclick = (e) => {
            if (e.target.classList.contains('btn-restore')) {
                s.rawLines = [...s.initialRawLines];
                s.initialRawLines.forEach(l => {
                    const [k, v] = l.split('=');
                    if (k && v) {
                        const key = k.trim().toUpperCase();
                        if (key === 'KEY') s.key = v.trim();
                        if (key === 'FRICTION') s.friction = v.trim();
                    }
                });
                renderList();
                return;
            }
            s.selected = !s.selected;
            renderList();
        };
        el.surfacesList.appendChild(div);
    });
}

function applyPreset(presetId) {
    const preset = PRESET_LIBRARY[presetId];
    if (!preset) return;

    if (!surfaces.some(s => s.selected)) {
        updateStatus('SELECT SURFACES FIRST');
        el.presetBtns.forEach(b => b.classList.remove('active'));
        return;
    }

    surfaces.forEach(s => {
        if (s.selected) {
            const newLines = [];
            newLines.push(`[${s.id}]`);
            newLines.push(`KEY=ROAD`);
            if (preset.id !== 'ASPHALT') {
                newLines.push(`_EXT_SURFACE_TYPE=${preset.extType}`);
                if (preset.modifier) newLines.push(`_EXT_SURFACE_TYPE_MODIFIER=${preset.modifier}`);
                if (preset.preset) newLines.push(`GRAVEL_PRESET=${preset.preset}`);
            }
            newLines.push(`FRICTION=${preset.friction}`);
            newLines.push(`DAMPING=${preset.damping}`);
            newLines.push(`WAV=${preset.wav}`);
            newLines.push(`WAV_PITCH=0`);
            newLines.push(`FF_EFFECT=NULL`);
            newLines.push(`DIRT_ADDITIVE=${preset.dirtAdditive}`);
            newLines.push(`IS_VALID_TRACK=1`);
            newLines.push(`BLACK_FLAG_TIME=0`);
            newLines.push(`SIN_HEIGHT=0`);
            newLines.push(`SIN_LENGTH=0`);
            newLines.push(`IS_PITLANE=0`);
            newLines.push(`VIBRATION_GAIN=${preset.vibeGain}`);
            newLines.push(`VIBRATION_LENGTH=${preset.vibeLen}`);

            s.rawLines = newLines;
            s.key = 'ROAD';
            s.friction = preset.friction;
        }
    });

    renderList();
    updateStatus(`${presetId.toUpperCase()} APPLIED`);
}

async function handleSave() {
    if (!currentVariant) return;

    try {
        updateStatus('PREPARING FILE...');

        const finalBlocks = surfaces.map(s => {
            const isModified = JSON.stringify(s.rawLines) !== JSON.stringify(s.initialRawLines);
            if (isModified) {
                const backup = s.initialRawLines.map(line => `;ORIGINAL: ${line}`).join('\r\n');
                return backup + '\r\n' + s.rawLines.join('\r\n');
            }
            return s.rawLines.join('\r\n');
        });

        const content = finalBlocks.join('\r\n\r\n');

        if (currentVariant.fileHandle) {
            if (currentVariant.parentHandle) {
                try {
                    await currentVariant.parentHandle.getFileHandle('surfaces.ini.bak');
                } catch {
                    const originalFile = await currentVariant.fileHandle.getFile();
                    const bakHandle = await currentVariant.parentHandle.getFileHandle('surfaces.ini.bak', { create: true });
                    const writable = await bakHandle.createWritable();
                    await writable.write(await originalFile.arrayBuffer());
                    await writable.close();
                }
            }

            const writable = await currentVariant.fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            updateStatus('SAVED SUCCESSFULLY');
        } else {
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'surfaces.ini';
            a.click();
            URL.revokeObjectURL(url);
            updateStatus('DOWNLOAD STARTED. REPLACE THE ORIGINAL FILE.');
        }

        surfaces.forEach(s => s.initialRawLines = [...s.rawLines]);
        renderList();
        setTimeout(() => updateStatus(`${surfaces.length} SURFACES`), 3000);
    } catch (err) {
        console.error(err);
        updateStatus('SAVE FAILED');
    }
}

function updateStatus(msg) {
    el.statusLabel.textContent = msg;
}

init();
