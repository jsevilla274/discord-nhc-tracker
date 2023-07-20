import { logger } from './src/log.js';
import { main } from './src/discord-nhc-tracker.js';

let hasErrors = false;
try {
    await main();
} catch (error) {
    hasErrors = true;
    logger.error(error);
}