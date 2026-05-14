export interface Skill {
  name: string;
  description: string;
  version: string;
}

export interface SkillConfig {
  skills: Skill[];
}
