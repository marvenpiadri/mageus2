export type ReadingMoodId = 'stars' | 'midnight' | 'moonlight' | 'eclipse' | 'aurora' | 'nordic';

export type GlassTreatment =
  | 'original'
  | 'clean'
  | 'blue-midnight'
  | 'black-pitch'
  | 'stars'
  | 'midnight'
  | 'moonlight'
  | 'eclipse'
  | 'aurora'
  | 'nordic';

export type CelestialEffect = 'star-classic' | 'star-aurora' | 'star-golden' | 'nebula' | 'none';

export interface ReadingMood {
  id: ReadingMoodId;
  name: string;
  description: string;
  icon: string;
  accent: string;
  glass: GlassTreatment;
  effect: CelestialEffect;
}

export const READING_MOODS: readonly ReadingMood[] = [
  { id: 'stars', name: 'Stars', description: 'A quiet celestial field with delicate points of light.', icon: '✦', accent: '#66CCC3', glass: 'stars', effect: 'star-classic' },
  { id: 'midnight', name: 'Midnight', description: 'Deep obsidian glass and restrained cyan light.', icon: '☾', accent: '#66CCC3', glass: 'midnight', effect: 'star-classic' },
  { id: 'moonlight', name: 'Moonlight', description: 'Silvery light with a cool indigo haze.', icon: '☽', accent: '#A5B4FC', glass: 'moonlight', effect: 'star-aurora' },
  { id: 'eclipse', name: 'Eclipse', description: 'A warm amber corona against a dark sky.', icon: '◉', accent: '#F59E0B', glass: 'eclipse', effect: 'star-golden' },
  { id: 'aurora', name: 'Aurora', description: 'Soft emerald and violet waves behind the page.', icon: '✧', accent: '#34D399', glass: 'aurora', effect: 'star-aurora' },
  { id: 'nordic', name: 'Nordic', description: 'Muted slate, graphite, and stillness.', icon: '❄', accent: '#94A3B8', glass: 'nordic', effect: 'none' }
] as const;