// Simple test script for PlaywrightMCP
const { spawn } = require('child_process');

console.log('Testing PlaywrightMCP installation...');

// Test if the MCP server starts correctly
const mcpProcess = spawn('npx', ['@playwright/mcp@latest', '--help'], {
  stdio: 'pipe',
  shell: true
});

mcpProcess.stdout.on('data', (data) => {
  console.log('✅ PlaywrightMCP is working!');
  console.log('Available options:', data.toString().substring(0, 200) + '...');
  mcpProcess.kill();
});

mcpProcess.stderr.on('data', (data) => {
  console.error('❌ Error:', data.toString());
});

mcpProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ PlaywrightMCP test completed successfully!');
  } else {
    console.log(`❌ PlaywrightMCP test failed with code ${code}`);
  }
});
