import { Skill, SkillConfig } from './types';

export const wowokSkills: SkillConfig = {
  skills: [
    {
      name: 'wowok-build',
      description: 'Complex system building — Service, Machine, Guard, Allocation, Reward orchestration',
      version: '1.0.0'
    },
    {
      name: 'wowok-guard',
      description: 'Guard design mastery — programmable trust rules and multi-signature authorization',
      version: '1.0.0'
    },
    {
      name: 'wowok-machine',
      description: 'Machine workflow design — state machines, progress tracking, multi-step processes',
      version: '1.0.0'
    },
    {
      name: 'wowok-order',
      description: 'Order lifecycle management — payment, allocation, arbitration, and settlement',
      version: '1.0.0'
    },
    {
      name: 'wowok-safety',
      description: 'Safety protocol — dry-run, confirm, execute with user authorization checkpoints',
      version: '1.0.0'
    },
    {
      name: 'wowok-tools',
      description: 'MCP tool usage mastery — 13 tools, nested parameters, schema references',
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
