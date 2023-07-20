import * as dotenv from 'dotenv';
import process from 'node:process';
import { join as pathJoin }  from 'path';
import { PROJECT_ROOT_DIRNAME } from '../lib/utils.js';

const varNames = [
    'DISCORD_BOT_TOKEN', 
    'DISCORD_ADMIN_ID',
    'DISCORD_GUILD_CHANNEL_ID'
];

let variablesSet = !!process.env[varNames[0]]; // if one is set, assume all are set
if (variablesSet === false) {
    // set env variables
    dotenv.config({ path: pathJoin(PROJECT_ROOT_DIRNAME, '.env') });

    // check for missing variables
    let missingVars = varNames.filter((varName) => !process.env[varName]);
    if (missingVars.length > 0) {
        throw new Error(`Please set the environmental variable(s): ${missingVars.join(', ')}`);
    }
}
