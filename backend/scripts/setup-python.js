import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Setting up Python environment...');

try {
    // Create virtual environment if it doesn't exist
    if (!existsSync(join(__dirname, '..', '.venv'))) {
        console.log('Creating Python virtual environment...');
        if (isWindows) {
            execSync('python -m venv .venv', { 
                stdio: 'inherit',
                shell: 'powershell.exe'
            });
        } else {
            execSync('python3 -m venv .venv', { 
                stdio: 'inherit',
                shell: '/bin/bash'
            });
        }
    }

    // Activate virtual environment and install requirements
    const isWindows = process.platform === 'win32';
    const activateCmd = isWindows ? '& ./.venv/Scripts/Activate.ps1' : 'source .venv/bin/activate';
    
    console.log('Installing Python dependencies...');
    if (isWindows) {
        execSync(`${activateCmd}; pip install -r requirements.txt`, { 
            stdio: 'inherit',
            shell: 'powershell.exe'
        });
    } else {
        execSync(`${activateCmd} && pip install -r requirements.txt`, { 
            stdio: 'inherit',
            shell: '/bin/bash'
        });
    }

    console.log('✅ Python environment setup complete!');
} catch (error) {
    console.error('❌ Error setting up Python environment:', error.message);
    process.exit(1);
}