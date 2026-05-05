// Simple test for SoulSpec extension
import { SoulSpecLoader, Environment, InteractionMode } from './dist/soul.js';

console.log('Testing SoulSpec extension...');

// Test basic functionality
try {
  const loader = new SoulSpecLoader();
  console.log('✓ SoulSpecLoader created successfully');
  
  // Test enum values
  console.log('✓ Environment.VIRTUAL:', Environment.VIRTUAL);
  console.log('✓ InteractionMode.TEXT:', InteractionMode.TEXT);
  
  // Test soul discovery
  const souls = loader.getAllSouls();
  console.log('✓ Found souls:', souls);
  
  if (souls.length > 0) {
    // Test loading a soul
    const soul = await loader.load(souls[0], 1);
    console.log('✓ Soul loaded:', soul.display_name);
    console.log('✓ Description:', soul.description);
    
    // Test system prompt generation
    const prompt = loader.buildSystemPrompt(soul, 1);
    console.log('✓ System prompt generated (length:', prompt.length, 'characters)');
  }
  
  console.log('✓ All tests passed!');
} catch (error) {
  console.error('✗ Test failed:', error.message);
  process.exit(1);
}