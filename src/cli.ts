#!/usr/bin/env node

import { getSkills, getSkillByName } from './skills';

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('WoWok Skills CLI');
    console.log('Usage: wowok-skills <command>');
    console.log('');
    console.log('Commands:');
    console.log('  list              List all skills');
    console.log('  get <name>        Get skill by name');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'list':
      console.log('Available WoWok Skills:');
      getSkills().forEach(skill => {
        console.log(`  - ${skill.name}: ${skill.description}`);
      });
      break;
    
    case 'get':
      if (args.length < 2) {
        console.error('Error: Skill name required');
        process.exit(1);
      }
      const skill = getSkillByName(args[1]);
      if (skill) {
        console.log(`Name: ${skill.name}`);
        console.log(`Description: ${skill.description}`);
        console.log(`Version: ${skill.version}`);
      } else {
        console.error(`Skill not found: ${args[1]}`);
        process.exit(1);
      }
      break;
    
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main();
