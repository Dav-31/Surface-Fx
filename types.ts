
export interface SurfacePreset {
  id: string;
  name: string;
  data: string; // The raw INI section content
}

export interface SurfaceSection {
  id: string; // [SURFACE_0], [SURFACE_1], etc.
  key: string;
  friction: string;
  isValidTrack: string;
  rawLines: string[]; // Store all lines for replacement
  selected: boolean;
}

export interface TrackVariant {
  name: string;
  displayName: string;
  path: string; // relative to content/tracks/trackname
  fileHandle: FileSystemFileHandle | null;
  parentDirHandle: FileSystemDirectoryHandle | null;
}

export interface Track {
  id: string; // folder name
  name: string; // from ui_track.json
  tags: string[];
  variants: TrackVariant[];
  dirHandle: FileSystemDirectoryHandle;
}
