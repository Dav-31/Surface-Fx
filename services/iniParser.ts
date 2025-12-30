
import { SurfaceSection } from '../types';

export const parseSurfacesIni = (content: string): SurfaceSection[] => {
  const lines = content.split(/\r?\n/);
  const sections: SurfaceSection[] = [];
  let currentSection: SurfaceSection | null = null;

  lines.forEach((line) => {
    const sectionMatch = line.match(/^\[(SURFACE_\d+)\]/i);
    if (sectionMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        id: sectionMatch[1].toUpperCase(),
        key: '',
        friction: '',
        isValidTrack: '',
        rawLines: [line],
        selected: false
      };
    } else if (currentSection) {
      currentSection.rawLines.push(line);
      const [key, value] = line.split('=');
      if (key && value) {
        const trimmedKey = key.trim().toUpperCase();
        if (trimmedKey === 'KEY') currentSection.key = value.trim();
        if (trimmedKey === 'FRICTION') currentSection.friction = value.trim();
        if (trimmedKey === 'IS_VALID_TRACK') currentSection.isValidTrack = value.trim();
      }
    }
  });

  if (currentSection) sections.push(currentSection);
  return sections;
};

export const applyPresetToSection = (section: SurfaceSection, presetData: string): string[] => {
  // We keep the header [SURFACE_X] and replace everything else with preset lines
  return [section.rawLines[0], ...presetData.split('\n')];
};

export const rebuildIni = (originalSections: SurfaceSection[], updatedSections: SurfaceSection[]): string => {
  let result = '';
  updatedSections.forEach((section, index) => {
    result += section.rawLines.join('\r\n');
    if (index < updatedSections.length - 1) result += '\r\n';
  });
  return result;
};
