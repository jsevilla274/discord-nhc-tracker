import { logger } from './src/log.js';
import { main } from './src/discord-nhc-tracker.js';

let hasErrors = false;
logger.info('NHC Cyclone tracker started.');
try {
    await main();
} catch (error) {
    hasErrors = true;
    logger.error(error);
}
logger.info(`Exited ${hasErrors ? 'with' : 'without'} errors.`);