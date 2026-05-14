import { Skill, SkillConfig } from './types';

export const wowokSkills: SkillConfig = {
  skills: [
    {
      name: 'wowok-build',
      description: 'WoWok build skill',
      version: '1.0.0'
    },
    {
      name: 'wowok-guard',
      description: 'WoWok guard skill',
      version: '1.0.0'
    },
    {
      name: 'wowok-machine',
      description: 'WoWok machine skill',
      version: '1.0.0'
    },
    {
      name: 'wowok-order',
      description: 'WoWok order skill',
      version: '1.0.0'
    },
    {
      name: 'wowok-safety',
      description: 'WoWok safety skill',
      version: '1.0.0'
    },
    {
      name: 'wowok-tools',
      description: 'WoWok tools skill',
      version: '1.0.0'
    }
  ]
};

export function getSkills(): Skill[] {
  return wowokSkills.skills;
}

export function getSkillByName(name: string): Skill | undefined {
  return wowokSkills.skills.find(skill => skill.name === name);
}
