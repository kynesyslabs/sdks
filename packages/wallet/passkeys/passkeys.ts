import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export class PasskeyGenerator {
    private scriptPath: string;

    constructor() {
        // Assuming the generate.sh script is in the same directory as this file
        this.scriptPath = path.join(__dirname, 'hmywallet/generate.sh');
    }

    /**
     * Generates passkeys using the generate.sh script
     * @param outputDir The directory where the passkeys should be generated
     * @param count Number of passkeys to generate (optional, defaults to 1)
     * @returns Promise<void>
     */
    async generate(): Promise<string> {
        try {

            // Execute the generate.sh script with the provided parameters
            const { stdout, stderr } = await execAsync(
                `bash "${this.scriptPath}"`
            );

            if (stderr) {
                throw new Error(`Script execution error: ${stderr}`);
            }

            // Log success message
            console.log(`Successfully generated a passkey!`);
            // Read the private key from the file
            const privateKey = fs.readFileSync('hmywallet/private_key.txt', 'utf8');
            console.log(`Private key: ${privateKey}`);
            fs.rmSync('hmywallet/private_key.txt');
            return privateKey;

        } catch (error) {
            console.error(`Error generating passkeys: ${error}`);
            throw error;
        }
    }
}

// Test the passkey generator if this file is run directly
if (require.main === module) {
    const main = async () => {
        try {
            const passkeyGenerator = new PasskeyGenerator();
            await passkeyGenerator.generate();
            console.log('Test completed successfully');
        } catch (error) {
            console.error('Test failed:', error);
            process.exit(1);
        }
    };

    main();
}
