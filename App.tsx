
import React, { useState, useMemo } from 'react';
import { Track, TrackVariant, SurfaceSection, SurfacePreset } from './types';
import { SURFACE_PRESETS } from './constants';
import { parseSurfacesIni, applyPresetToSection, rebuildIni } from './services/iniParser';

const App: React.FC = () => {
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<TrackVariant | null>(null);
  const [surfaces, setSurfaces] = useState<SurfaceSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Selecciona la carpeta raíz de Assetto Corsa');

  const handleOpenFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      setRootHandle(handle);
      setStatus('Escaneando pistas...');
      setLoading(true);

      const tracksList: Track[] = [];
      let contentHandle: FileSystemDirectoryHandle;

      try {
        const contentDir = await handle.getDirectoryHandle('content');
        contentHandle = await contentDir.getDirectoryHandle('tracks');
      } catch {
        contentHandle = handle;
      }

      for await (const [name, entry] of contentHandle.entries()) {
        if (entry.kind === 'directory') {
          const trackDir = entry as FileSystemDirectoryHandle;
          let displayName = name;
          let tags: string[] = [];

          try {
            const uiDir = await trackDir.getDirectoryHandle('ui');
            const uiFile = await uiDir.getFileHandle('ui_track.json');
            const file = await uiFile.getFile();
            const text = await file.text();
            const json = JSON.parse(text);
            displayName = json.name || name;
            tags = json.tags || [];
          } catch {}

          const variants: TrackVariant[] = [];
          
          try {
            const dataDir = await trackDir.getDirectoryHandle('data');
            const surfaceFile = await dataDir.getFileHandle('surfaces.ini');
            variants.push({
              name: 'default',
              displayName: 'Default Layout',
              path: 'data',
              fileHandle: surfaceFile,
              parentDirHandle: dataDir
            });
          } catch {}

          for await (const [subName, subEntry] of trackDir.entries()) {
            if (subEntry.kind === 'directory' && !['data', 'ui', 'ai', 'skins'].includes(subName)) {
              try {
                const variantDir = subEntry as FileSystemDirectoryHandle;
                const variantDataDir = await variantDir.getDirectoryHandle('data');
                const surfaceFile = await variantDataDir.getFileHandle('surfaces.ini');
                variants.push({
                  name: subName,
                  displayName: subName.replace(/_/g, ' ').toUpperCase(),
                  path: `${subName}/data`,
                  fileHandle: surfaceFile,
                  parentDirHandle: variantDataDir
                });
              } catch {}
            }
          }

          if (variants.length > 0) {
            tracksList.push({ id: name, name: displayName, tags, variants, dirHandle: trackDir });
          }
        }
      }

      setTracks(tracksList);
      setLoading(false);
      setStatus(`Se encontraron ${tracksList.length} pistas.`);
    } catch (err) {
      console.error(err);
      setStatus('Error al acceder al directorio.');
      setLoading(false);
    }
  };

  const filteredTracks = useMemo(() => {
    return tracks.filter(t => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [tracks, searchTerm]);

  const loadSurfaces = async (variant: TrackVariant) => {
    if (!variant.fileHandle) return;
    try {
      const file = await variant.fileHandle.getFile();
      const text = await file.text();
      const parsed = parseSurfacesIni(text);
      setSurfaces(parsed);
      setSelectedVariant(variant);
      setStatus(`Superficies cargadas: ${variant.displayName}`);
    } catch (err) {
      console.error(err);
      setStatus('Error leyendo surfaces.ini');
    }
  };

  const toggleSurfaceSelection = (id: string) => {
    setSurfaces(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const applyPreset = (preset: SurfacePreset) => {
    setSurfaces(prev => prev.map(s => {
      if (s.selected) {
        return {
          ...s,
          rawLines: applyPresetToSection(s, preset.data),
          friction: preset.data.match(/FRICTION=([\d.]+)/)?.[1] || s.friction
        };
      }
      return s;
    }));
    setStatus(`Preset [${preset.name}] aplicado a la selección.`);
  };

  const handleSave = async () => {
    if (!selectedVariant || !selectedVariant.fileHandle || !selectedVariant.parentDirHandle) return;
    
    try {
      setStatus('Guardando y creando backup...');
      
      try {
        await selectedVariant.parentDirHandle.getFileHandle('surfaces.ini.bak');
      } catch {
        const originalFile = await selectedVariant.fileHandle.getFile();
        const bakHandle = await selectedVariant.parentDirHandle.getFileHandle('surfaces.ini.bak', { create: true });
        const writable = await bakHandle.createWritable();
        await writable.write(await originalFile.arrayBuffer());
        await writable.close();
      }

      const newContent = rebuildIni(surfaces, surfaces);
      const writable = await selectedVariant.fileHandle.createWritable();
      await writable.write(newContent);
      await writable.close();

      setStatus('¡Guardado con éxito! surfaces.ini actualizado.');
    } catch (err) {
      console.error(err);
      setStatus('Error al guardar los cambios.');
    }
  };

  const currentTrack = tracks.find(t => t.id === selectedTrackId);

  return (
    <div className="min-h-screen p-4 md:p-12 flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-full max-w-6xl bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-800">
        
        {/* Header Section */}
        <div className="p-8 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-3xl font-black tracking-tighter text-white">
                SURFACE<span className="text-red-600">MODDER</span>
              </h1>
              <p className="text-zinc-500 text-sm mt-1 font-medium">ASSETTO CORSA TRACK TOOLS</p>
            </div>
            <button 
              onClick={handleOpenFolder}
              className="group flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all active:scale-95 shadow-lg shadow-red-900/20"
            >
              <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
              [PATH] SELECT FOLDER
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
            <div className="relative group">
              <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500 group-focus-within:text-red-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </span>
              <input 
                type="text" 
                placeholder="Search name or tags (e.g. Indianapolis)..." 
                className="w-full pl-12 pr-4 py-4 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-red-600 outline-none transition-all placeholder:text-zinc-700"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="relative">
              <select 
                className="w-full appearance-none px-6 py-4 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-red-600 outline-none pr-12 cursor-pointer text-zinc-300"
                onChange={(e) => {
                  const tid = e.target.value;
                  setSelectedTrackId(tid);
                  const track = tracks.find(t => t.id === tid);
                  if (track && track.variants.length > 0) {
                    loadSurfaces(track.variants[0]);
                  }
                }}
              >
                <option value="">-- SELECT TRACK FROM RESULTS --</option>
                {filteredTracks.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-zinc-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Variants Bar */}
        {currentTrack && currentTrack.variants.length > 1 && (
          <div className="px-8 py-4 bg-zinc-800/30 flex gap-3 flex-wrap border-b border-zinc-800">
            <span className="text-xs font-bold text-zinc-500 uppercase flex items-center mr-2">Layouts:</span>
            {currentTrack.variants.map(v => (
              <button
                key={v.name}
                onClick={() => loadSurfaces(v)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold tracking-wider transition-all border ${selectedVariant?.name === v.name ? 'bg-red-600 border-red-500 text-white shadow-lg' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
              >
                {v.displayName}
              </button>
            ))}
          </div>
        )}

        {/* Content Area */}
        <div className="p-8 space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></div>
              {status}
            </h2>
          </div>
          
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-inner">
            <div className="max-h-[500px] overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {surfaces.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-zinc-700 italic">
                  <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                  <p className="text-lg font-medium opacity-40">No track data selected</p>
                </div>
              ) : (
                surfaces.map((s) => (
                  <div 
                    key={s.id} 
                    onClick={() => toggleSurfaceSelection(s.id)}
                    className={`group flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer ${s.selected ? 'bg-zinc-800/50 border-red-900/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-12">
                      <div className="flex items-center gap-3 min-w-[140px]">
                        <div className={`w-1 h-8 rounded-full ${s.selected ? 'bg-red-600' : 'bg-zinc-800 group-hover:bg-zinc-700'}`}></div>
                        <span className="font-mono font-bold text-red-500 text-base">{s.id}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1 font-mono text-[11px] uppercase tracking-tighter">
                        <div className="flex flex-col">
                          <span className="text-zinc-600">Key</span>
                          <span className="text-zinc-300 font-bold">{s.key || '---'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-zinc-600">Friction</span>
                          <span className="text-red-400 font-bold">{s.friction || '---'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-zinc-600">Valid Track</span>
                          <span className={s.isValidTrack === '1' ? 'text-green-500' : 'text-zinc-500'}>{s.isValidTrack === '1' ? 'YES' : 'NO'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center pr-2">
                       <div className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${s.selected ? 'bg-red-600 border-red-600 shadow-[0_0_10px_rgba(220,38,38,0.4)]' : 'border-zinc-700 bg-zinc-950'}`}>
                         {s.selected && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"/></svg>}
                       </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-8 bg-zinc-950/50 border-t border-zinc-800">
          <div className="flex flex-col lg:flex-row gap-8 justify-between items-center">
            
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest text-center lg:text-left">Quick Presets</span>
              <div className="flex gap-2 flex-wrap justify-center">
                {SURFACE_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={(e) => { e.stopPropagation(); applyPreset(p); }}
                    disabled={!surfaces.some(s => s.selected)}
                    className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed text-zinc-400 hover:text-red-500 text-xs font-black rounded border border-zinc-800 hover:border-red-900 transition-all uppercase tracking-tighter active:scale-95"
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            </div>
            
            <button 
              onClick={handleSave}
              disabled={surfaces.length === 0}
              className="w-full lg:w-auto px-12 py-5 bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black rounded-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-tighter"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
              Apply & Save surfaces.ini
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default App;
